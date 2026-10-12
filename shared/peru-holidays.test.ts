import { describe, expect, it } from "vitest";
import {
  PERU_HOLIDAYS,
  PERU_HOLIDAY_DATES,
  addPeruBusinessDays,
  countPeruBusinessDaysBetween,
  countPeruBusinessDaysRemaining,
  formatCalendarDate,
  getPeruHolidaysForYear,
  isPeruBusinessDay,
  isPeruHoliday,
  isWeekend,
} from "./peru-holidays";

/** An instant at 10:00 in Peru on the given date (15:00 UTC). */
const d = (iso: string): Date => new Date(`${iso}T15:00:00.000Z`);

describe("PERU_HOLIDAYS data", () => {
  it("stores every date as a plain YYYY-MM-DD calendar date", () => {
    for (const holiday of PERU_HOLIDAYS) {
      expect(holiday.date, `${holiday.name} has a malformed date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(holiday.name.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicated dates", () => {
    expect(new Set(PERU_HOLIDAY_DATES).size).toBe(PERU_HOLIDAY_DATES.length);
  });

  it("keeps PERU_HOLIDAY_DATES in sync with PERU_HOLIDAYS", () => {
    expect(PERU_HOLIDAY_DATES).toEqual(PERU_HOLIDAYS.map((holiday) => holiday.date));
  });

  it.each([2024, 2025, 2026])("declares the 13 national holidays of %i", (year) => {
    expect(getPeruHolidaysForYear(year)).toHaveLength(13);
  });

  it.each([
    // year, Jueves Santo, Viernes Santo - derived from that year's Easter Sunday.
    [2024, "2024-03-28", "2024-03-29"],
    [2025, "2025-04-17", "2025-04-18"],
    [2026, "2026-04-02", "2026-04-03"],
  ])("places the %i Easter holidays on the correct days", (year, juevesSanto, viernesSanto) => {
    const dates = getPeruHolidaysForYear(year).map((holiday) => holiday.date);
    expect(dates).toContain(juevesSanto);
    expect(dates).toContain(viernesSanto);
  });

  it("does not silently drop a mid-July holiday (regression)", () => {
    // `client/src/lib/validation.ts` used to omit July 23, so the deadline shown
    // in the public form disagreed with the one the backend enforced.
    expect(isPeruHoliday(d("2024-07-23"))).toBe(true);
    expect(isPeruHoliday(d("2025-07-23"))).toBe(true);
    expect(isPeruHoliday(d("2026-07-23"))).toBe(true);
  });

  it("covers 2026, the current operating year (regression)", () => {
    // The table previously stopped at 2025, which made 2026 holidays count as
    // business days and produced deadlines that were too early.
    expect(getPeruHolidaysForYear(2026).length).toBeGreaterThan(0);
    expect(isPeruHoliday(d("2026-01-01"))).toBe(true);
    expect(isPeruHoliday(d("2026-12-25"))).toBe(true);
  });
});

describe("isWeekend / isPeruHoliday / isPeruBusinessDay", () => {
  it("treats Saturday and Sunday as non-working", () => {
    expect(isWeekend(d("2026-10-10"))).toBe(true); // Saturday
    expect(isWeekend(d("2026-10-11"))).toBe(true); // Sunday
    expect(isWeekend(d("2026-10-12"))).toBe(false); // Monday
  });

  it("recognises holidays and ordinary weekdays", () => {
    expect(isPeruHoliday(d("2026-07-28"))).toBe(true);
    expect(isPeruHoliday(d("2026-07-27"))).toBe(false);
    expect(isPeruBusinessDay(d("2026-10-12"))).toBe(true);
    expect(isPeruBusinessDay(d("2026-07-28"))).toBe(false); // holiday
    expect(isPeruBusinessDay(d("2026-10-10"))).toBe(false); // Saturday
  });

  it("formats dates using the UTC calendar date", () => {
    expect(formatCalendarDate(d("2026-03-05"))).toBe("2026-03-05");
  });

  it("falls back to no holidays for a year it does not know", () => {
    expect(getPeruHolidaysForYear(1999)).toEqual([]);
  });
});

describe("addPeruBusinessDays", () => {
  it("skips weekends and holidays", () => {
    // 2025-07-21 Mon -> 15 business days later, crossing 23/28/29 July holidays.
    expect(formatCalendarDate(addPeruBusinessDays(d("2025-07-21"), 15))).toBe("2025-08-14");
  });

  it("uses the 2026 holiday table", () => {
    // 2026-07-20 Mon -> crossing 23/28/29 July 2026 holidays.
    expect(formatCalendarDate(addPeruBusinessDays(d("2026-07-20"), 15))).toBe("2026-08-13");
  });

  it("counts only plain weekends when no holiday is near", () => {
    // Oct 12 2026 is a Monday, so 15 business days ends on Mon Nov 2 2026.
    expect(formatCalendarDate(addPeruBusinessDays(d("2026-10-12"), 15))).toBe("2026-11-02");
  });

  it("returns the start date when no days are requested", () => {
    expect(formatCalendarDate(addPeruBusinessDays(d("2026-10-12"), 0))).toBe("2026-10-12");
  });

  it("does not mutate the date it is given", () => {
    const start = d("2026-10-12");
    addPeruBusinessDays(start, 5);
    expect(formatCalendarDate(start)).toBe("2026-10-12");
  });
});

describe("countPeruBusinessDaysBetween", () => {
  it("excludes the end date and counts business days only", () => {
    // Mon 21 Jul -> Sat 26 Jul 2025: 21, 22, 24, 25 (23 is a holiday).
    expect(countPeruBusinessDaysBetween(d("2025-07-21"), d("2025-07-26"))).toBe(4);
  });

  it("returns 0 when the range is empty or inverted", () => {
    expect(countPeruBusinessDaysBetween(d("2026-10-12"), d("2026-10-12"))).toBe(0);
    expect(countPeruBusinessDaysBetween(d("2026-10-15"), d("2026-10-12"))).toBe(0);
  });
});

describe("countPeruBusinessDaysRemaining", () => {
  it("returns 0 once the due date has passed", () => {
    expect(countPeruBusinessDaysRemaining(d("2026-10-01"), d("2026-10-12"))).toBe(0);
  });

  it("counts forward while time is left", () => {
    expect(countPeruBusinessDaysRemaining(d("2026-10-19"), d("2026-10-12"))).toBe(5);
  });
});

describe("the Peru evening boundary (regression)", () => {
  /**
   * Complaints submitted between 19:00 and 23:59 Peru time used to be judged
   * against the *next* day's date: the weekend check read the host's local day
   * while the holiday check read the UTC date. Around a holiday that shifted the
   * legally binding deadline by a business day.
   */
  const peruEvening = (iso: string): Date => new Date(`${iso}T20:00:00-05:00`);

  it("still sees the Peru date on the evening before a holiday", () => {
    // 20:00 on Wed 7 Oct 2026, when it is already Thu 8 Oct in UTC (Angamos).
    const evening = peruEvening("2026-10-07");
    expect(evening.toISOString()).toBe("2026-10-08T01:00:00.000Z");

    expect(formatCalendarDate(evening)).toBe("2026-10-07");
    expect(isPeruHoliday(evening)).toBe(false);
    expect(isPeruBusinessDay(evening)).toBe(true);
  });

  it("still skips a holiday in the evening of the holiday itself", () => {
    // 20:00 on Thu 8 Oct 2026 (Angamos), when it is already Fri 9 Oct in UTC.
    const evening = peruEvening("2026-10-08");
    expect(evening.toISOString()).toBe("2026-10-09T01:00:00.000Z");

    expect(isPeruHoliday(evening)).toBe(true);
    expect(isPeruBusinessDay(evening)).toBe(false);
  });

  it("gives an evening submission the same deadline as a morning one", () => {
    const morning = new Date("2026-10-07T10:00:00-05:00");
    const evening = peruEvening("2026-10-07");

    expect(evening.getTime()).toBeGreaterThan(morning.getTime());

    const morningDeadline = addPeruBusinessDays(morning, 15);
    const eveningDeadline = addPeruBusinessDays(evening, 15);

    expect(formatCalendarDate(eveningDeadline)).toBe("2026-10-29");
    expect(formatCalendarDate(eveningDeadline)).toBe(formatCalendarDate(morningDeadline));
  });
});
