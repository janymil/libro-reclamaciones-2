/**
 * Peruvian national holidays ("feriados nacionales") and the calendar helpers
 * built on top of them.
 *
 * This module is the **single source of truth** for dates that must be excluded
 * when the 15 business day response deadline of a Libro de Reclamaciones is
 * calculated (DS 101-2022-PCM).
 *
 * Previously the same list was duplicated in three places - and they had drifted
 * apart:
 *   - `server/services/businessDayCalculator.ts` (had 2024-07-23)
 *   - `client/src/lib/constants.ts`          (had 2024-07-23)
 *   - `client/src/lib/validation.ts`         (was MISSING 2024-07-23)
 * Because of that, the deadline displayed to a consumer in the public complaint
 * form could disagree with the deadline the backend actually enforced. Everything
 * now derives from `PERU_HOLIDAYS` below.
 */

import { formatCalendarDate, shiftPeruCalendarDate, toPeruCalendarDate } from "./peru-time";

export { formatCalendarDate };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface PeruHoliday {
  /** Calendar date as `YYYY-MM-DD` (a Peru calendar date, with no time component). */
  date: string;
  name: string;
}

/**
 * National holidays for the years the application serves.
 *
 * Only "feriados nacionales" (non-working national holidays) belong here: days
 * that are working days for some sectors (e.g. 2024-06-07, 2024-06-29 sector
 * holidays) must NOT be added, because excluding them would understate the
 * provider's legal deadline.
 *
 * Easter-dependent holidays (Jueves/Viernes Santo):
 *   2024 - Easter 31 Mar -> Thu 28 Mar / Fri 29 Mar
 *   2025 - Easter 20 Apr -> Thu 17 Apr / Fri 18 Apr
 *   2026 - Easter 05 Apr -> Thu 02 Apr / Fri 03 Apr
 */
export const PERU_HOLIDAYS: readonly PeruHoliday[] = [
  // 2024
  { date: "2024-01-01", name: "Año Nuevo" },
  { date: "2024-03-28", name: "Jueves Santo" },
  { date: "2024-03-29", name: "Viernes Santo" },
  { date: "2024-05-01", name: "Día del Trabajo" },
  { date: "2024-06-29", name: "San Pedro y San Pablo" },
  { date: "2024-07-23", name: "Día de la Fuerza Aérea del Perú" },
  { date: "2024-07-28", name: "Fiestas Patrias" },
  { date: "2024-07-29", name: "Fiestas Patrias" },
  { date: "2024-08-30", name: "Santa Rosa de Lima" },
  { date: "2024-10-08", name: "Combate de Angamos" },
  { date: "2024-11-01", name: "Todos los Santos" },
  { date: "2024-12-08", name: "Inmaculada Concepción" },
  { date: "2024-12-25", name: "Navidad del Señor" },

  // 2025
  { date: "2025-01-01", name: "Año Nuevo" },
  { date: "2025-04-17", name: "Jueves Santo" },
  { date: "2025-04-18", name: "Viernes Santo" },
  { date: "2025-05-01", name: "Día del Trabajo" },
  { date: "2025-06-29", name: "San Pedro y San Pablo" },
  { date: "2025-07-23", name: "Día de la Fuerza Aérea del Perú" },
  { date: "2025-07-28", name: "Fiestas Patrias" },
  { date: "2025-07-29", name: "Fiestas Patrias" },
  { date: "2025-08-30", name: "Santa Rosa de Lima" },
  { date: "2025-10-08", name: "Combate de Angamos" },
  { date: "2025-11-01", name: "Todos los Santos" },
  { date: "2025-12-08", name: "Inmaculada Concepción" },
  { date: "2025-12-25", name: "Navidad del Señor" },

  // 2026
  { date: "2026-01-01", name: "Año Nuevo" },
  { date: "2026-04-02", name: "Jueves Santo" },
  { date: "2026-04-03", name: "Viernes Santo" },
  { date: "2026-05-01", name: "Día del Trabajo" },
  { date: "2026-06-29", name: "San Pedro y San Pablo" },
  { date: "2026-07-23", name: "Día de la Fuerza Aérea del Perú" },
  { date: "2026-07-28", name: "Fiestas Patrias" },
  { date: "2026-07-29", name: "Fiestas Patrias" },
  { date: "2026-08-30", name: "Santa Rosa de Lima" },
  { date: "2026-10-08", name: "Combate de Angamos" },
  { date: "2026-11-01", name: "Todos los Santos" },
  { date: "2026-12-08", name: "Inmaculada Concepción" },
  { date: "2026-12-25", name: "Navidad del Señor" },
];

/** Just the `YYYY-MM-DD` values of {@link PERU_HOLIDAYS}. */
export const PERU_HOLIDAY_DATES: readonly string[] = PERU_HOLIDAYS.map((holiday) => holiday.date);

/** Lookup set for O(1) holiday checks. */
const PERU_HOLIDAY_DATE_SET = new Set<string>(PERU_HOLIDAY_DATES);

/**
 * Weekend check for a Peru calendar date - a `Date` anchored at UTC midnight by
 * `toPeruCalendarDate`.
 *
 * Unanchored instants are converted first, so weekends and holidays are judged in
 * the same frame of reference. They previously disagreed: `isWeekend` read the
 * host's local day-of-week while `isPeruHoliday` read the UTC date, so an instant
 * late in the Peru evening could be "Friday" for one check and "Saturday" for the
 * other, shifting a legally binding deadline by a day.
 */
function isWeekendCalendarDate(calendarDate: Date): boolean {
  const day = calendarDate.getUTCDay();
  return day === 0 || day === 6;
}

/** Holiday check for a Peru calendar date. */
function isHolidayCalendarDate(calendarDate: Date): boolean {
  return PERU_HOLIDAY_DATE_SET.has(calendarDate.toISOString().slice(0, 10));
}

/** Working day check for a Peru calendar date. */
function isBusinessCalendarDate(calendarDate: Date): boolean {
  return !isWeekendCalendarDate(calendarDate) && !isHolidayCalendarDate(calendarDate);
}

/** True when the instant falls on a Saturday or Sunday in Peru. */
export function isWeekend(date: Date): boolean {
  return isWeekendCalendarDate(toPeruCalendarDate(date));
}

/** True when the instant falls on a Peruvian national holiday. */
export function isPeruHoliday(date: Date): boolean {
  return isHolidayCalendarDate(toPeruCalendarDate(date));
}

/** True when the instant falls on a working day in Peru: neither a weekend nor a holiday. */
export function isPeruBusinessDay(date: Date): boolean {
  return isBusinessCalendarDate(toPeruCalendarDate(date));
}

/** Every holiday declared for a given year. */
export function getPeruHolidaysForYear(year: number): PeruHoliday[] {
  const prefix = `${year}-`;
  return PERU_HOLIDAYS.filter((holiday) => holiday.date.startsWith(prefix));
}

/**
 * Advances `startDate` by `businessDays` Peruvian working days.
 *
 * `startDate` itself is never counted: the day after it is the first candidate.
 * This is the calculation behind the legal 15 business day response deadline of
 * DS 101-2022-PCM, so it exists in exactly one place and is shared by the server
 * service and every client-side display.
 */
export function addPeruBusinessDays(startDate: Date, businessDays: number): Date {
  const startCalendarDate = toPeruCalendarDate(startDate);
  const cursor = new Date(startCalendarDate);
  let daysAdded = 0;

  while (daysAdded < businessDays) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);

    if (isBusinessCalendarDate(cursor)) {
      daysAdded++;
    }
  }

  // Shift the original instant by whole days so the time of day is preserved.
  const elapsedDays = Math.round((cursor.getTime() - startCalendarDate.getTime()) / MS_PER_DAY);
  return shiftPeruCalendarDate(startDate, { days: elapsedDays });
}

/**
 * Moves `startDate` back by `businessDays` Peruvian working days.
 *
 * The inverse of {@link addPeruBusinessDays}, with the same Peru calendar semantics.
 */
export function subtractPeruBusinessDays(startDate: Date, businessDays: number): Date {
  const startCalendarDate = toPeruCalendarDate(startDate);
  const cursor = new Date(startCalendarDate);
  let daysRemoved = 0;

  while (daysRemoved < businessDays) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);

    if (isBusinessCalendarDate(cursor)) {
      daysRemoved++;
    }
  }

  const elapsedDays = Math.round((cursor.getTime() - startCalendarDate.getTime()) / MS_PER_DAY);
  return shiftPeruCalendarDate(startDate, { days: elapsedDays });
}

/**
 * Counts working days in the half-open interval `[startDate, endDate)`.
 *
 * `startDate` is included when it is a working day; `endDate` is never included.
 */
export function countPeruBusinessDaysBetween(startDate: Date, endDate: Date): number {
  const cursor = toPeruCalendarDate(startDate);
  const endCalendarDate = toPeruCalendarDate(endDate);
  let businessDays = 0;

  while (cursor < endCalendarDate) {
    if (isBusinessCalendarDate(cursor)) {
      businessDays++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return businessDays;
}

/**
 * Working days left between `currentDate` and `dueDate`.
 *
 * Returns 0 once the due date has been reached or passed, which is what the
 * client uses to render "vencido" deadlines.
 */
export function countPeruBusinessDaysRemaining(dueDate: Date, currentDate: Date = new Date()): number {
  if (dueDate <= currentDate) {
    return 0;
  }

  return countPeruBusinessDaysBetween(currentDate, dueDate);
}
