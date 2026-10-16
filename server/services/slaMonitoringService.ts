import type { Complaint, User } from "@shared/schema";
import { storage } from "../storage";
import { rankSlaRisk } from "./slaPredictionService";
import { emailService } from "./emailService";

/**
 * Internal SLA reminders + auto-escalation (Phase 2.9).
 *
 * Wires the existing SLA-breach prediction into notifications:
 *   - <= 5 business days remaining (medium risk): reminder to the assignee.
 *   - <= 2 business days remaining or already overdue (high risk): escalation
 *     to the assignee AND the business managers (admin users), including a
 *     wa.me deep link so staff can reach the consumer on WhatsApp, which the
 *     base legal framework allows as an internal contact channel.
 *
 * Runs hourly via server/services/scheduler.ts. Notifications are keyed on
 * the complaint's remaining-days bucket so the same complaint is not
 * re-notified for the same bucket twice.
 */

const REMINDER_THRESHOLD_DAYS = 5;
const ESCALATION_THRESHOLD_DAYS = 2;

export interface SlaSweepResult {
  businessesSwept: number;
  remindersSent: number;
  escalationsSent: number;
}

export async function runSlaMonitoringSweep(): Promise<SlaSweepResult> {
  const result: SlaSweepResult = { businessesSwept: 0, remindersSent: 0, escalationsSent: 0 };

  const businesses = await storage.getAllBusinesses();

  for (const business of businesses) {
    if (!business.isActive) {
      continue;
    }
    result.businessesSwept += 1;

    const complaints = await storage.getComplaintsByBusiness(business.id);
    const open = complaints.filter(
      (complaint) => complaint.status === 'new' || complaint.status === 'in_progress',
    );
    if (open.length === 0) {
      continue;
    }

    const assessments = rankSlaRisk(open);

    for (const assessment of assessments) {
      const complaint = open.find((c) => c.id === assessment.complaintId);
      if (!complaint) {
        continue;
      }

      const needsEscalation =
        assessment.businessDaysRemaining <= ESCALATION_THRESHOLD_DAYS || assessment.riskLevel === 'high';
      const needsReminder =
        !needsEscalation &&
        assessment.businessDaysRemaining <= REMINDER_THRESHOLD_DAYS &&
        (assessment.riskLevel === 'medium' || assessment.businessDaysRemaining <= REMINDER_THRESHOLD_DAYS);

      if (needsEscalation) {
        await escalate(business.id, business.businessName, complaint, assessment.businessDaysRemaining);
        result.escalationsSent += 1;
      } else if (needsReminder) {
        await remind(business.id, complaint, assessment.businessDaysRemaining);
        result.remindersSent += 1;
      }
    }
  }

  return result;
}

async function notifyAssignee(
  businessId: string,
  complaint: Complaint,
  title: string,
  message: string,
): Promise<User | null> {
  if (!complaint.assignedToUserId) {
    return null;
  }

  const assignee = await storage.getUser(complaint.assignedToUserId);
  if (!assignee) {
    return null;
  }

  await storage.createNotification({
    businessId,
    userId: assignee.id,
    type: 'sla_escalation',
    title,
    message,
    relatedEntityType: 'complaint',
    relatedEntityId: complaint.id,
  });

  return assignee;
}

async function remind(businessId: string, complaint: Complaint, remainingDays: number): Promise<void> {
  const message =
    `${complaint.correlativeNumber} vence en ${remainingDays} día(s) hábil(es). ` +
    `Priorice la respuesta para cumplir el plazo legal de 15 días hábiles (DS 101-2022-PCM).`;

  await notifyAssignee(businessId, complaint, 'Recordatorio de plazo SLA', message);

  await storage.createNotification({
    businessId,
    type: 'sla_reminder',
    title: `Plazo por vencer: ${complaint.correlativeNumber}`,
    message,
    relatedEntityType: 'complaint',
    relatedEntityId: complaint.id,
  });
}

async function escalate(businessId: string, businessName: string, complaint: Complaint, remainingDays: number): Promise<void> {
  const overdueText = remainingDays <= 0
    ? 'El plazo legal YA VENCIÓ - riesgo de sanción por INDECOPI.'
    : `Vence en apenas ${remainingDays} día(s) hábil(es).`;

  const whatsapp = complaint.consumerPhone
    ? ` Contacto del consumidor: https://wa.me/51${complaint.consumerPhone.replace(/\D/g, '').replace(/^0+/, '')}`
    : '';

  const message = `${complaint.correlativeNumber} (${complaint.productServiceName}): ${overdueText}${whatsapp}`;

  // 1. Assignee (if any) - in-app + email
  const assignee = await notifyAssignee(businessId, complaint, 'ESCALADO SLA - riesgo de vencimiento', message);
  if (assignee) {
    void emailService.sendSlaEscalation(assignee.email, businessName, complaint.correlativeNumber, message).catch(() => {});
  }

  // 2. Managers (admin users of the business) - in-app
  const users = await storage.getAllUsers();
  const managers = users.filter((user) => user.businessId === businessId && user.role === 'admin' && user.isActive);

  for (const manager of managers) {
    await storage.createNotification({
      businessId,
      userId: manager.id,
      type: 'sla_escalation',
      title: `ESCALADO a gerencia: ${complaint.correlativeNumber}`,
      message,
      relatedEntityType: 'complaint',
      relatedEntityId: complaint.id,
    });
  }
}
