import { businessDayCalculator } from "./businessDayCalculator";

/**
 * Complaint-handling compliance (SLA) maths.
 *
 * The legal deadline is 15 business days to answer a reclamo/queja
 * (DS 101-2022-PCM, art. 4; the Libro itself is DS 011-2011-PCM). This module
 * is the single source of truth for "did the provider comply?" because the app
 * previously reported two DIFFERENT, misleading numbers:
 *
 *   - a dashboard SLA figure that returned 100% when NOTHING had been answered
 *     ("no data" was rendered as "perfect"), and
 *   - a report figure built from a manual checklist of formal obligations
 *     (RNPD, privacy policy...) that had nothing to do with the 15-day rule,
 *     yet was labelled "DS 011-2011-PCM conforme".
 *
 * Rules implemented here:
 *   - a complaint answered on or before its due date is compliant;
 *   - a complaint answered late is NOT compliant;
 *   - a complaint not answered after its due date is overdue (and therefore
 *     not compliant) whether or not the stored `isOverdue` flag was refreshed;
 *   - with no data the rate is `null` ("sin datos"), never 100.
 */

export interface SlaComplaintInput {
  submissionDate: Date | string;
  responseDate?: Date | string | null;
  dueDate?: Date | string | null;
  isOverdue?: boolean | null;
}

export interface SlaSummary {
  /** Complaints considered. */
  total: number;
  /** Complaints with a provider response. */
  answered: number;
  /** Answered on or before the legal deadline. */
  answeredOnTime: number;
  /** Answered after the deadline. */
  answeredLate: number;
  /** Past the deadline and still unanswered. */
  overdue: number;
  /** answeredOnTime / total, as a whole percentage. null when there is no data. */
  onTimeRate: number | null;
  /** answeredOnTime / answered, as a whole percentage. null when nothing was answered. */
  answeredOnTimeRate: number | null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function summarizeSla(
  complaints: SlaComplaintInput[],
  now: Date = new Date(),
): SlaSummary {
  let answered = 0;
  let answeredOnTime = 0;
  let answeredLate = 0;
  let overdue = 0;

  for (const complaint of complaints) {
    const responseDate = toDate(complaint.responseDate);
    const dueDate = toDate(complaint.dueDate);

    if (responseDate) {
      answered += 1;
      // Without a due date there is no deadline to breach, so the response is
      // treated as on time (legacy rows predating dueDate).
      if (!dueDate || responseDate.getTime() <= dueDate.getTime()) {
        answeredOnTime += 1;
      } else {
        answeredLate += 1;
      }
      continue;
    }

    const pastDeadline = dueDate ? dueDate.getTime() < now.getTime() : false;
    if (pastDeadline || complaint.isOverdue === true) {
      overdue += 1;
    }
  }

  const total = complaints.length;

  return {
    total,
    answered,
    answeredOnTime,
    answeredLate,
    overdue,
    onTimeRate: total > 0 ? Math.round((answeredOnTime / total) * 100) : null,
    answeredOnTimeRate: answered > 0 ? Math.round((answeredOnTime / answered) * 100) : null,
  };
}

/**
 * Average response time in business days (Peru calendar). Kept here so the
 * SLA figures come from one place.
 */
export function averageResponseBusinessDays(complaints: SlaComplaintInput[]): number {
  const answered = complaints.filter((complaint) => complaint.responseDate);

  if (answered.length === 0) {
    return 0;
  }

  const total = answered.reduce(
    (sum, complaint) =>
      sum +
      businessDayCalculator.getBusinessDaysBetween(
        complaint.submissionDate as Date,
        complaint.responseDate as Date,
      ),
    0,
  );

  return Math.round((total / answered.length) * 10) / 10;
}
