import { RETENTION_MONTHS } from "@shared/plans";
import { storage } from "../storage";
import { deleteAttachmentFile } from "./attachmentService";

/**
 * 2-year retention policy (Phase 1.2).
 *
 * DS 011-2011-PCM requires the Libro de Reclamaciones to be kept available
 * to INDECOPI for two years. Once that window closes, continuing to hold the
 * consumer's personal data violates the data-minimization principle of
 * Ley 29733 / DS 016-2024-JUS - so the sweep:
 *
 *   1. deletes evidence files from disk and soft-deletes their rows,
 *   2. anonymizes the consumer PII on the complaint,
 *   3. marks the complaint archived (correlative, dates and status are kept
 *      for the aggregate statistics),
 *   4. appends an audit log entry per complaint (append-only trail).
 *
 * Runs on boot and then daily via server/services/scheduler.ts.
 */

export interface RetentionSweepResult {
  cutoff: Date;
  anonymizedComplaints: number;
  purgedAttachments: number;
}

/** Pure helper: the cutoff date before which records must be purged. */
export function retentionCutoff(now: Date = new Date(), months: number = RETENTION_MONTHS): Date {
  const cutoff = new Date(now);
  const day = cutoff.getUTCDate();

  // Move to the first of the target month, then clamp the day to the last day
  // of that month (May 31 - 3 months must be Feb 28/29, not March 3).
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - months);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
  ).getUTCDate();
  cutoff.setUTCDate(Math.min(day, lastDayOfTargetMonth));

  return cutoff;
}

/**
 * Deletes every live attachment of the given complaints from disk and
 * soft-deletes the metadata rows. Returns how many files were removed.
 */
async function purgeAttachments(complaintIds: string[]): Promise<number> {
  let purged = 0;

  for (const complaintId of complaintIds) {
    const attachments = await storage.getAttachmentsByComplaint(complaintId);

    for (const attachment of attachments) {
      deleteAttachmentFile(attachment.fileName);
      await storage.softDeleteAttachment(attachment.id);
      purged += 1;
    }
  }

  return purged;
}

/** Executes one retention sweep. Safe to run repeatedly (idempotent). */
export async function runRetentionSweep(now: Date = new Date()): Promise<RetentionSweepResult> {
  const cutoff = retentionCutoff(now);

  // 1. Purge evidence files of complaints whose window already closed
  const attachmentComplaintIds = await storage.findAttachmentComplaintIdsOlderThan(cutoff);
  const purgedAttachments = await purgeAttachments(attachmentComplaintIds);

  // 2. Anonymize consumer PII of not-yet-archived complaints
  const complaints = await storage.findComplaintsOlderThan(cutoff);
  let anonymized = 0;

  for (const complaint of complaints) {
    await storage.anonymizeComplaint(complaint.id);
    await storage.createAuditLog({
      complaintId: complaint.id,
      userId: null,
      action: 'retention_purged',
      oldValues: { consumerFullName: complaint.consumerFullName, retentionPurgedAt: null },
      newValues: { consumerFullName: '[DATOS ANONIMIZADOS]', retentionPurgedAt: now.toISOString() },
      notes: `Datos personales anonimizados y adjuntos eliminados tras ${RETENTION_MONTHS} meses de conservación (DS 011-2011-PCM / Ley 29733).`,
      ipAddress: null,
      userAgent: 'retention-sweep',
    });
    anonymized += 1;
  }

  if (anonymized > 0 || purgedAttachments > 0) {
    console.log(
      `[retention] sweep complete: ${anonymized} complaint(s) anonymized, ${purgedAttachments} attachment file(s) purged (cutoff ${cutoff.toISOString()})`,
    );
  }

  return { cutoff, anonymizedComplaints: anonymized, purgedAttachments };
}
