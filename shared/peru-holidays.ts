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
 * Formats a `Date` as `YYYY-MM-DD` using its **UTC** calendar date.
 *
 * Note: `addBusinessDays` below advances dates with `setDate`, which operates in
 * the host's local time zone. Mixing a local-time step with a UTC-based format is
 * a pre-existing latent bug, so this helper deliberately reproduces the original
 * behaviour rather than silently shifting every legally binding deadline. Fixing
 * it is a separate, legal-sign-off decision.
 */
export function formatCalendarDate(date: Date): string {
  return date.toISOString().split("T")[0];
}

/** True when `date` is a Saturday or Sunday (local time, as originally implemented). */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** True when `date` is a Peruvian national holiday. */
export function isPeruHoliday(date: Date): boolean {
  return PERU_HOLIDAY_DATE_SET.has(formatCalendarDate(date));
}

/** True when `date` is a working day in Peru: neither a weekend nor a national holiday. */
export function isPeruBusinessDay(date: Date): boolean {
  return !isWeekend(date) && !isPeruHoliday(date);
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
  const currentDate = new Date(startDate);
  let daysAdded = 0;

  while (daysAdded < businessDays) {
    currentDate.setDate(currentDate.getDate() + 1);

    if (isPeruBusinessDay(currentDate)) {
      daysAdded++;
    }
  }

  return currentDate;
}

/**
 * Counts working days in the half-open interval `[startDate, endDate)`.
 *
 * `startDate` is included when it is a working day; `endDate` is never included.
 */
export function countPeruBusinessDaysBetween(startDate: Date, endDate: Date): number {
  const currentDate = new Date(startDate);
  let businessDays = 0;

  while (currentDate < endDate) {
    if (isPeruBusinessDay(currentDate)) {
      businessDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
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
