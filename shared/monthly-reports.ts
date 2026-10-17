/**
 * Automatic monthly reports ("Reportes Mensuales Automáticos").
 *
 * The aggregation is pure, so the server (which owns the data) and the test
 * suite run exactly the same logic. Month buckets and month labels are resolved
 * in Peru time through `@shared/peru-time`: formatting the label with the host's
 * local time zone would print the previous month on any host west of Peru.
 */

import { PERU_TIME_ZONE, startOfPeruMonth } from "./peru-time";

/** One row of the automatic monthly report, most recent month first. */
export interface MonthlyReport {
  month: string;
  complaints: number;
  resolved: number;
  overdue: number;
}

/** Minimal complaint shape the report aggregates. */
export interface MonthlyReportRow {
  submissionDate: Date | string;
  status: string;
  isOverdue: boolean;
}

/** How many months the automatic report covers, most recent first. */
export const MONTHLY_REPORT_WINDOW = 6;

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("es-PE", {
  timeZone: PERU_TIME_ZONE,
  month: "long",
  year: "numeric",
});

/**
 * Builds the last `months` (default {@link MONTHLY_REPORT_WINDOW}) monthly
 * reports, most recent month first.
 *
 * The window is bounded from below by `firstMonth` - the month the company was
 * registered in - so a brand-new account never lists six rows of
 * "0 reclamaciones procesadas" for periods in which neither the company nor the
 * user existed in the app. A month that actually holds complaints is always
 * kept, even when it predates the company record (imported or legacy data).
 */
export function buildMonthlyReports(
  rows: MonthlyReportRow[],
  options: { now?: Date | string; firstMonth?: Date | string | null; months?: number } = {},
): MonthlyReport[] {
  const now = options.now ? new Date(options.now) : new Date();
  const months = options.months ?? MONTHLY_REPORT_WINDOW;

  // Lower bound of the window: the earlier of "the month the company was
  // registered" and "the month of the oldest complaint on record". A report must
  // never start after data that it is supposed to show.
  const bounds: Date[] = [];
  if (options.firstMonth) {
    bounds.push(startOfPeruMonth(new Date(options.firstMonth)));
  }
  for (const row of rows) {
    const submitted = new Date(row.submissionDate);
    if (!Number.isNaN(submitted.getTime())) {
      bounds.push(startOfPeruMonth(submitted));
    }
  }
  const lowerBound = bounds.length > 0
    ? new Date(Math.min(...bounds.map((bound) => bound.getTime())))
    : null;

  const reports: MonthlyReport[] = [];

  for (let offset = 0; offset < months; offset++) {
    const start = startOfPeruMonth(now, -offset);

    // Never report a period before the company (or its oldest complaint) existed.
    if (lowerBound && start < lowerBound) break;

    const end = startOfPeruMonth(now, -offset + 1);

    const inMonth = rows.filter((row) => {
      const submitted = new Date(row.submissionDate);
      return submitted >= start && submitted < end;
    });

    reports.push({
      month: MONTH_LABEL_FORMATTER.format(start),
      complaints: inMonth.length,
      resolved: inMonth.filter((row) => row.status === "resolved").length,
      overdue: inMonth.filter((row) => row.isOverdue).length,
    });
  }

  return reports;
}
