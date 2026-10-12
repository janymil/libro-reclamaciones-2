import { db } from "../db";
import { eq, and, isNull, lt, desc } from "drizzle-orm";
import {
  type ComplaintAttachment,
  complaints,
  complaintAttachments,
} from "@shared/schema";

/** Data access for complaint evidence attachments (Phase 1.1). */
export const attachmentStorage = {
  async createAttachment(
    data: Omit<ComplaintAttachment, "id" | "uploadedAt" | "deletedAt">,
  ): Promise<ComplaintAttachment> {
    const [attachment] = await db
      .insert(complaintAttachments)
      .values(data)
      .returning();
    return attachment;
  },

  async getAttachment(id: string): Promise<ComplaintAttachment | undefined> {
    const [attachment] = await db
      .select()
      .from(complaintAttachments)
      .where(eq(complaintAttachments.id, id));
    return attachment;
  },

  async getAttachmentsByComplaint(complaintId: string): Promise<ComplaintAttachment[]> {
    return await db
      .select()
      .from(complaintAttachments)
      .where(and(
        eq(complaintAttachments.complaintId, complaintId),
        isNull(complaintAttachments.deletedAt),
      ))
      .orderBy(desc(complaintAttachments.uploadedAt));
  },

  async countAttachmentsByComplaint(complaintId: string): Promise<number> {
    const list = await db
      .select({ id: complaintAttachments.id })
      .from(complaintAttachments)
      .where(and(
        eq(complaintAttachments.complaintId, complaintId),
        isNull(complaintAttachments.deletedAt),
      ));
    return list.length;
  },

  /** Soft-deletes one attachment (metadata only; the caller removes the file). */
  async softDeleteAttachment(id: string): Promise<ComplaintAttachment | undefined> {
    const [attachment] = await db
      .update(complaintAttachments)
      .set({ deletedAt: new Date() })
      .where(and(eq(complaintAttachments.id, id), isNull(complaintAttachments.deletedAt)))
      .returning();
    return attachment;
  },

  /**
   * Complaints whose submission is older than the cutoff and that still have
   * live attachment rows, i.e. files the retention sweep must purge.
   */
  async findAttachmentComplaintIdsOlderThan(cutoff: Date): Promise<string[]> {
    const rows = await db
      .selectDistinct({ complaintId: complaintAttachments.complaintId })
      .from(complaintAttachments)
      .innerJoin(complaints, eq(complaints.id, complaintAttachments.complaintId))
      .where(and(
        isNull(complaintAttachments.deletedAt),
        lt(complaints.submissionDate, cutoff),
      ));
    return rows.map((row) => row.complaintId);
  },
};
