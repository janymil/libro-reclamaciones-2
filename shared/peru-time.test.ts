import { describe, expect, it } from "vitest";
import {
  PERU_TIME_ZONE,
  addPeruDays,
  formatCalendarDate,
  getPeruUtcOffsetMs,
  getPeruYear,
  peruDayDifference,
  shiftPeruCalendarDate,
  startOfPeruDay,
  startOfPeruMonth,
  toPeruCalendarDate,
} from "./peru-time";

/** An instant at 09:00 in Peru on the given date (14:00 UTC). */
const peruMorning = (iso: string): Date => new Date(`${iso}T14:00:00.000Z`);

/** An instant at 20:00 in Peru on the given date (01:00 UTC the next day). */
const peruEvening = (iso: string): Date => new Date(`${iso}T20:00:00-05:00`);

describe("PERU_TIME_ZONE", () => {
  it("is America/Lima", () => {
    expect(PERU_TIME_ZONE).toBe("America/Lima");
  });

  it("is a fixed UTC-5 all year, which the whole-day arithmetic relies on", () => {
    // If Peru ever reintroduces daylight saving this fails, flagging that
    // `shiftPeruCalendarDate` can no longer treat a day as 24 hours.
    const instants = [
      "2026-01-15T12:00:00Z",
      "2026-04-15T12:00:00Z",
      "2026-07-15T12:00:00Z",
      "2026-10-15T12:00:00Z",
      "2026-12-15T12:00:00Z",
    ];

    for (const instant of instants) {
      expect(getPeruUtcOffsetMs(new Date(instant)), instant).toBe(-5 * 60 * 60 * 1000);
    }
  });
});

describe("toPeruCalendarDate / formatCalendarDate", () => {
  it("reads the Peru calendar date, not the UTC one", () => {
    // 00:00 UTC on the 12th is still 19:00 on the 11th in Peru.
    expect(formatCalendarDate(new Date("2026-10-12T00:00:00Z"))).toBe("2026-10-11");
    // 04:00 UTC on the 12th is 23:00 on the 11th in Peru.
    expect(formatCalendarDate(new Date("2026-10-12T04:00:00Z"))).toBe("2026-10-11");
    // 05:00 UTC on the 12th is 00:00 on the 12th in Peru.
    expect(formatCalendarDate(new Date("2026-10-12T05:00:00Z"))).toBe("2026-10-12");
  });

  it("anchors the calendar date at UTC midnight", () => {
    expect(toPeruCalendarDate(new Date("2026-10-12T18:30:00Z")).toISOString()).toBe(
      "2026-10-12T00:00:00.000Z",
    );
  });

  it("does not depend on the host time zone", () => {
    // The same instant always yields the same Peru date, whatever TZ the process
    // runs in. The suite is executed under several zones to enforce this.
    expect(formatCalendarDate(new Date("2026-06-29T03:00:00Z"))).toBe("2026-06-28");
  });
});

describe("getPeruYear", () => {
  it("uses the Peru year, e.g. for correlative numbering", () => {
    // 23:00 on 31 December in Peru is already 1 January in UTC.
    const newYearInUtc = new Date("2027-01-01T04:00:00Z");
    expect(newYearInUtc.getUTCFullYear()).toBe(2027);
    expect(getPeruYear(newYearInUtc)).toBe(2026);
  });
});

describe("startOfPeruDay / startOfPeruMonth", () => {
  it("returns the instant Peru midnight begins", () => {
    expect(startOfPeruDay(new Date("2026-10-15T18:30:00Z")).toISOString()).toBe(
      "2026-10-15T05:00:00.000Z",
    );
  });

  it("returns the first moment of the Peru month, with month offsets", () => {
    const date = new Date("2026-10-15T18:30:00Z");
    expect(startOfPeruMonth(date).toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(startOfPeruMonth(date, -1).toISOString()).toBe("2026-09-01T05:00:00.000Z");
    expect(startOfPeruMonth(date, -11).toISOString()).toBe("2025-11-01T05:00:00.000Z");
  });
});

describe("shiftPeruCalendarDate / addPeruDays", () => {
  it("shifts whole years and keeps the time of day", () => {
    expect(shiftPeruCalendarDate(peruMorning("2026-10-15"), { years: -2 }).toISOString()).toBe(
      peruMorning("2024-10-15").toISOString(),
    );
  });

  it("shifts whole days", () => {
    expect(addPeruDays(peruMorning("2026-10-29"), 4).toISOString()).toBe(
      peruMorning("2026-11-02").toISOString(),
    );
  });
});

describe("peruDayDifference", () => {
  it("counts Peru calendar days, not 24 hour periods", () => {
    expect(peruDayDifference(peruMorning("2026-10-12"), peruMorning("2026-10-19"))).toBe(7);
  });

  it("treats two instants late on one Peru day and early on the next as one day apart", () => {
    const lateInTheDay = new Date("2026-10-12T02:00:00Z"); // 21:00 on the 11th in Peru
    const nextMorning = new Date("2026-10-12T15:00:00Z"); // 10:00 on the 12th in Peru

    expect(lateInTheDay.getUTCDate()).toBe(nextMorning.getUTCDate()); // same UTC date
    expect(peruDayDifference(lateInTheDay, nextMorning)).toBe(1); // one Peru day apart
  });
});
