import { runRetentionSweep } from "./retentionService";
import { runSlaMonitoringSweep } from "./slaMonitoringService";
import { startWebhookWorker } from "./webhookService";

/**
 * Background jobs (Phases 1.2 and 2.9).
 *
 *   * retention sweep - daily: anonymizes complaints older than 24 months and
 *     purges their evidence files (legal data-minimization requirement).
 *   * SLA monitoring - hourly: turns the SLA-breach prediction into reminders
 *     and escalations for the responsible staff and managers.
 *
 * Intervals are `unref`'d so tests and CLI scripts exit without waiting for
 * the next tick.
 */

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily
const SLA_INTERVAL_MS = 60 * 60 * 1000; // hourly

/** Exposed for the public status page. */
export const jobStatus = {
  retention: { lastRun: null as Date | null, lastResult: null as string | null },
  slaMonitoring: { lastRun: null as Date | null, lastResult: null as string | null },
};

async function runRetention(): Promise<void> {
  try {
    const result = await runRetentionSweep();
    jobStatus.retention = {
      lastRun: new Date(),
      lastResult: `${result.anonymizedComplaints} anonimizada(s), ${result.purgedAttachments} adjunto(s) purgado(s)`,
    };
  } catch (error) {
    console.error("[scheduler] retention sweep failed:", error);
    jobStatus.retention = { lastRun: new Date(), lastResult: `error: ${(error as Error).message}` };
  }
}

async function runSlaMonitoring(): Promise<void> {
  try {
    const result = await runSlaMonitoringSweep();
    jobStatus.slaMonitoring = {
      lastRun: new Date(),
      lastResult: `${result.remindersSent} recordatorio(s), ${result.escalationsSent} escalado(s)`,
    };
  } catch (error) {
    console.error("[scheduler] SLA monitoring sweep failed:", error);
    jobStatus.slaMonitoring = { lastRun: new Date(), lastResult: `error: ${(error as Error).message}` };
  }
}

let started = false;

/** Starts the background jobs. Safe to call multiple times. */
export function startScheduler(): void {
  if (started) {
    return;
  }
  started = true;

  // First run shortly after boot so the DB connection is fully up.
  const initialDelayMs = 30_000;
  const retentionTimer: NodeJS.Timeout = setTimeout(() => {
    void runRetention();
    const interval = setInterval(() => void runRetention(), RETENTION_INTERVAL_MS);
    interval.unref?.();
  }, initialDelayMs);
  retentionTimer.unref?.();

  const slaTimer: NodeJS.Timeout = setTimeout(() => {
    void runSlaMonitoring();
    const interval = setInterval(() => void runSlaMonitoring(), SLA_INTERVAL_MS);
    interval.unref?.();
  }, initialDelayMs + 5_000);
  slaTimer.unref?.();

  // Webhook retries / dead-letter backstop (every minute).
  startWebhookWorker();

  console.log("[scheduler] background jobs armed: retention (daily), SLA monitoring (hourly), webhooks (every minute)");
}
