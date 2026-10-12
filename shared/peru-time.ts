/**
 * Peru calendar helpers.
 *
 * Peru is a single-time-zone country (`America/Lima`, UTC-5 all year, no daylight
 * saving since 1994), and this application's legal deadlines are defined in terms
 * of *Peruvian calendar dates*. Every date computation must therefore be evaluated
 * in Peru time, never in the host's local time.
 *
 * That distinction is not academic. A deployed server commonly runs in UTC, and a
 * user's browser can be anywhere, so the previous mix of local `getDay()` and
 * UTC `toISOString()` produced the wrong day for complaints submitted between
 * 19:00 and 23:59 Peru time - a one day error in a legally binding deadline.
 *
 * All functions here are pure and depend only on `Intl`, so they give identical
 * results regardless of the `TZ` of the process that runs them.
 */

/** IANA zone for Peru. */
export const PERU_TIME_ZONE = "America/Lima";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: PERU_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: PERU_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  // `h23` avoids the "24" that some locales report for midnight.
  hourCycle: "h23",
});

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function readParts(formatter: Intl.DateTimeFormat, date: Date): DateParts {
  const parts = formatter.formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/**
 * The Peru calendar date of an instant, as a `Date` anchored at UTC midnight whose
 * UTC fields hold the Peru year, month and day.
 *
 * Anchoring at UTC midnight makes calendar arithmetic unambiguous: a "day" is
 * exactly 24 hours and `setUTCDate` cannot be perturbed by the host time zone.
 */
export function toPeruCalendarDate(date: Date): Date {
  const { year, month, day } = readParts(DATE_FORMATTER, date);
  return new Date(Date.UTC(year, month - 1, day));
}

/** The Peru calendar date of an instant, formatted as `YYYY-MM-DD`. */
export function formatCalendarDate(date: Date): string {
  return toPeruCalendarDate(date).toISOString().slice(0, 10);
}

/** The calendar year in Peru, e.g. for correlative numbering. */
export function getPeruYear(date: Date): number {
  return toPeruCalendarDate(date).getUTCFullYear();
}

/**
 * Offset of Peru time from UTC at the given instant, in milliseconds
 * (negative, `-18000000` = UTC-5).
 *
 * Exists so the "no daylight saving" assumption behind {@link shiftPeruCalendarDate}
 * is verifiable: a test asserts it stays at exactly five hours.
 */
export function getPeruUtcOffsetMs(date: Date): number {
  const { year, month, day, hour, minute, second } = readParts(DATE_TIME_FORMATTER, date);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  // Drop sub-second precision, which the formatter cannot express.
  const wallClockMs = Math.floor(date.getTime() / 1000) * 1000;
  return wallClockAsUtc - wallClockMs;
}

/** The instant at which the given Peru day begins (00:00 Peru time). */
export function startOfPeruDay(date: Date): Date {
  return new Date(toPeruCalendarDate(date).getTime() - getPeruUtcOffsetMs(date));
}

/**
 * The instant at which a Peru month begins (00:00 on the 1st).
 *
 * `monthOffset` shifts whole months, so `startOfPeruMonth(now, -1)` is the start of
 * the previous month - the basis for the monthly reports.
 */
export function startOfPeruMonth(date: Date, monthOffset = 0): Date {
  const calendarDate = toPeruCalendarDate(date);
  calendarDate.setUTCDate(1);
  calendarDate.setUTCMonth(calendarDate.getUTCMonth() + monthOffset);
  return new Date(calendarDate.getTime() - getPeruUtcOffsetMs(date));
}

/**
 * Shifts a date by whole Peru calendar days, months and/or years, keeping the time
 * of day.
 *
 * Whole days are added as exact 24 hour periods, which is only valid because Peru
 * has no daylight saving; {@link getPeruUtcOffsetMs} is tested to guarantee that.
 */
export function shiftPeruCalendarDate(
  date: Date,
  delta: { years?: number; months?: number; days?: number },
): Date {
  const calendarDate = toPeruCalendarDate(date);

  if (delta.years) {
    calendarDate.setUTCFullYear(calendarDate.getUTCFullYear() + delta.years);
  }
  if (delta.months) {
    calendarDate.setUTCMonth(calendarDate.getUTCMonth() + delta.months);
  }
  if (delta.days) {
    calendarDate.setUTCDate(calendarDate.getUTCDate() + delta.days);
  }

  const timeOfDay = date.getTime() - startOfPeruDay(date).getTime();
  return new Date(calendarDate.getTime() - getPeruUtcOffsetMs(date) + timeOfDay);
}

/** Whole Peru calendar days between two instants (`to` minus `from`). */
export function peruDayDifference(from: Date, to: Date): number {
  const fromCalendar = toPeruCalendarDate(from).getTime();
  const toCalendar = toPeruCalendarDate(to).getTime();
  return Math.round((toCalendar - fromCalendar) / MS_PER_DAY);
}

/** Adds whole Peru calendar days to an instant. */
export function addPeruDays(date: Date, days: number): Date {
  return shiftPeruCalendarDate(date, { days });
}
