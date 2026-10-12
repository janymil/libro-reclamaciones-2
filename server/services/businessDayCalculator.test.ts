import { describe, expect, it } from "vitest";
import { businessDayCalculator } from "./businessDayCalculator";
import { formatCalendarDate } from "@shared/peru-holidays";

/** Builds a date at UTC midnight so assertions are identical in every time zone. */
const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date): string => formatCalendarDate(date);

/**
 * These tests pin the legally binding response deadline of DS 101-2022-PCM:
 * 15 business days, excluding Peruvian national holidays and weekends.
 */
describe("isBusinessDay", () => {
  it("rejects weekends and holidays, accepts ordinary weekdays", () => {
    expect(businessDayCalculator.isBusinessDay(d("2025-07-26"))).toBe(false); // Saturday
    expect(businessDayCalculator.isBusinessDay(d("2025-07-27"))).toBe(false); // Sunday
    expect(businessDayCalculator.isBusinessDay(d("2025-07-23"))).toBe(false); // holiday
    expect(businessDayCalculator.isBusinessDay(d("2025-07-22"))).toBe(true);
  });
});

describe("addBusinessDays", () => {
  it("skips weekends and 23/28/29 July 2025 holidays", () => {
    expect(iso(businessDayCalculator.addBusinessDays(d("2025-07-21"), 15))).toBe("2025-08-14");
  });

  it("uses the 2026 holiday table", () => {
    expect(iso(businessDayCalculator.addBusinessDays(d("2026-07-20"), 15))).toBe("2026-08-13");
  });

  it("crosses only weekends when no holiday is nearby", () => {
    // Oct 12 2026 is a Monday, so 15 business days ends on Mon Nov 2 2026.
    expect(iso(businessDayCalculator.addBusinessDays(d("2026-10-12"), 15))).toBe("2026-11-02");
  });
});

describe("subtractBusinessDays", () => {
  it("is the inverse of addBusinessDays for a holiday-free rounding", () => {
    const deadline = businessDayCalculator.addBusinessDays(d("2025-07-21"), 15);
    expect(iso(businessDayCalculator.subtractBusinessDays(deadline, 15))).toBe("2025-07-21");
  });
});

describe("getBusinessDaysBetween", () => {
  it("counts business days in [start, end)", () => {
    expect(businessDayCalculator.getBusinessDaysBetween(d("2025-07-21"), d("2025-07-26"))).toBe(4);
  });
});

describe("getComplaintDeadline", () => {
  it("is 15 business days after submission", () => {
    expect(iso(businessDayCalculator.getComplaintDeadline(d("2025-07-21")))).toBe("2025-08-14");
  });
});

describe("getComplaintWarningDates", () => {
  it("reports the 10, 14 and 15 business day milestones", () => {
    const warnings = businessDayCalculator.getComplaintWarningDates(d("2025-07-21"));

    expect(iso(warnings.warningDate)).toBe("2025-08-07");
    expect(iso(warnings.urgentDate)).toBe("2025-08-13");
    expect(iso(warnings.dueDate)).toBe("2025-08-14");
  });
});

describe("isComplaintOverdue", () => {
  it("compares an explicit response date against the deadline", () => {
    expect(businessDayCalculator.isComplaintOverdue(d("2025-07-21"), d("2025-08-15"))).toBe(true);
    // Answering exactly on the deadline is on time, not overdue.
    expect(businessDayCalculator.isComplaintOverdue(d("2025-07-21"), d("2025-08-14"))).toBe(false);
  });

  it("uses the current date when no response has been given", () => {
    expect(businessDayCalculator.isComplaintOverdue(d("2025-07-21"), undefined, d("2025-08-15"))).toBe(true);
    expect(businessDayCalculator.isComplaintOverdue(d("2025-07-21"), undefined, d("2025-08-01"))).toBe(false);
  });
});

describe("getRemainingBusinessDays", () => {
  it("returns 0 for a past or same-day deadline", () => {
    expect(businessDayCalculator.getRemainingBusinessDays(d("2025-07-01"), d("2025-07-21"))).toBe(0);
  });

  it("counts forward while time is left", () => {
    expect(businessDayCalculator.getRemainingBusinessDays(d("2025-07-28"), d("2025-07-21"))).toBe(4);
  });
});

describe("getArcoRequestDeadline", () => {
  // Ley 29733 deadlines per request type, defaulting to 15 business days.
  it.each([
    ["access", "2025-08-07"],
    ["rectification", "2025-08-07"],
    ["opposition", "2025-08-07"],
    ["cancellation", "2025-08-14"],
    ["something-unknown", "2025-08-14"],
  ])("gives %s a deadline of %s", (requestType, expected) => {
    expect(iso(businessDayCalculator.getArcoRequestDeadline(d("2025-07-21"), requestType))).toBe(expected);
  });
});

describe("getHolidaysForYear", () => {
  it("returns the declared holidays of a year", () => {
    expect(businessDayCalculator.getHolidaysForYear(2025)).toHaveLength(13);
    expect(businessDayCalculator.getHolidaysForYear(2025)[0]).toEqual({
      date: "2025-01-01",
      name: "Año Nuevo",
    });
  });
});
