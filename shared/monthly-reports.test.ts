import { describe, it, expect } from "vitest";

import { buildMonthlyReports, MONTHLY_REPORT_WINDOW } from "./monthly-reports";

/**
 * Automatic monthly reports.
 *
 * The regression pinned here: a company (and user) registered today was shown
 * six monthly rows, most of them "0 reclamaciones procesadas", for periods in
 * which it did not exist in the app.
 *
 * Instants are written in UTC and read in Peru (UTC-5) on purpose, so a mistake
 * that buckets by the host time zone instead of the Peruvian calendar fails.
 */

const utc = (iso: string) => new Date(iso);

describe("buildMonthlyReports", () => {
  it("starts at the month the company was registered in", () => {
    const reports = buildMonthlyReports([], {
      now: utc("2026-10-16T17:00:00Z"), // 12:00 in Peru
      firstMonth: utc("2026-10-16T15:00:00Z"), // registered today
    });

    expect(reports).toHaveLength(1);
    expect(reports[0].month).toMatch(/^octubre de 2026$/i);
    expect(reports[0].complaints).toBe(0);
    expect(reports[0].resolved).toBe(0);
    expect(reports[0].overdue).toBe(0);
  });

  it("covers the whole six-month window for a company old enough", () => {
    const reports = buildMonthlyReports([], {
      now: utc("2026-10-16T17:00:00Z"),
      firstMonth: utc("2026-03-01T15:00:00Z"),
    });

    expect(reports).toHaveLength(MONTHLY_REPORT_WINDOW);
    expect(reports[0].month).toMatch(/^octubre de 2026$/i);
    // Six months back from October is May, not April.
    expect(reports[MONTHLY_REPORT_WINDOW - 1].month).toMatch(/^mayo de 2026$/i);
  });

  it("never covers more than the window, however old the company is", () => {
    const reports = buildMonthlyReports([], {
      now: utc("2026-10-16T17:00:00Z"),
      firstMonth: utc("2019-01-01T15:00:00Z"),
    });

    expect(reports).toHaveLength(MONTHLY_REPORT_WINDOW);
  });

  it("aggregates complaints, resolved and overdue per month", () => {
    const reports = buildMonthlyReports(
      [
        { submissionDate: utc("2026-10-05T15:00:00Z"), status: "new", isOverdue: false },
        { submissionDate: utc("2026-10-20T15:00:00Z"), status: "resolved", isOverdue: false },
        { submissionDate: utc("2026-10-25T15:00:00Z"), status: "in_progress", isOverdue: true },
        { submissionDate: utc("2026-09-10T15:00:00Z"), status: "resolved", isOverdue: false },
      ],
      { now: utc("2026-10-16T17:00:00Z"), firstMonth: utc("2026-09-01T15:00:00Z") },
    );

    expect(reports).toHaveLength(2);
    expect(reports[0]).toMatchObject({ complaints: 3, resolved: 1, overdue: 1 }); // October
    expect(reports[1]).toMatchObject({ complaints: 1, resolved: 1, overdue: 0 }); // September
  });

  it("never hides a month that actually holds complaints", () => {
    // Imported/legacy record older than the company row: the report must still
    // show it rather than silently dropping the complaint.
    const reports = buildMonthlyReports(
      [{ submissionDate: utc("2026-07-04T15:00:00Z"), status: "resolved", isOverdue: false }],
      { now: utc("2026-10-16T17:00:00Z"), firstMonth: utc("2026-09-20T15:00:00Z") },
    );

    expect(reports).toHaveLength(4); // October, September, August, July
    expect(reports[3].complaints).toBe(1);
  });

  it("buckets by Peruvian calendar month, not UTC", () => {
    const reports = buildMonthlyReports(
      // 2026-10-31 23:30 in Peru, i.e. already 2026-11-01 in UTC.
      [{ submissionDate: utc("2026-11-01T04:30:00Z"), status: "new", isOverdue: false }],
      { now: utc("2026-11-15T17:00:00Z"), firstMonth: utc("2026-11-15T15:00:00Z") },
    );

    expect(reports).toHaveLength(2);
    expect(reports[0].month).toMatch(/^noviembre de 2026$/i);
    expect(reports[0].complaints).toBe(0); // November
    expect(reports[1].month).toMatch(/^octubre de 2026$/i);
    expect(reports[1].complaints).toBe(1); // October
  });
});
