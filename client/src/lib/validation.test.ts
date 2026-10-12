import { describe, expect, it } from "vitest";
import {
  addBusinessDays,
  complaintFormSchema,
  getBusinessDaysRemaining,
  isBusinessDay,
  validateDni,
  validateEmail,
  validatePhone,
  validateRuc,
} from "./validation";
import { businessDayCalculator } from "../../../server/services/businessDayCalculator";
import { formatCalendarDate } from "@shared/peru-holidays";

/** Builds a date at UTC midnight so assertions are identical in every time zone. */
const d = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

describe("document validators", () => {
  it("accepts an 11 digit RUC and rejects anything else", () => {
    expect(validateRuc("20123456789")).toBe(true);
    expect(validateRuc("2012345678")).toBe(false);
    expect(validateRuc("201234567890")).toBe(false);
    expect(validateRuc("2012345678A")).toBe(false);
  });

  it("accepts an 8 digit DNI and rejects anything else", () => {
    expect(validateDni("12345678")).toBe(true);
    expect(validateDni("1234567")).toBe(false);
    expect(validateDni("1234567A")).toBe(false);
  });

  it("validates email shape", () => {
    expect(validateEmail("consumidor@example.com")).toBe(true);
    expect(validateEmail("consumidor@example")).toBe(false);
    expect(validateEmail("no-es-email")).toBe(false);
  });

  it("accepts Peruvian phone formats with 7 to 15 digits", () => {
    expect(validatePhone("+51 987 654 321")).toBe(true);
    expect(validatePhone("(01) 224-7777")).toBe(true);
    expect(validatePhone("123")).toBe(false);
  });
});

describe("business day helpers", () => {
  it("matches the server holiday table exactly (regression)", () => {
    // `validation.ts` used to keep its own holiday list that omitted July 23 and
    // stopped at 2025, so the deadline shown to a consumer could differ from the
    // deadline the backend enforced.
    for (const holiday of ["2024-07-23", "2025-07-23", "2026-07-23", "2026-12-25", "2026-01-01"]) {
      expect(isBusinessDay(d(holiday)), `${holiday} should not be a business day`).toBe(false);
    }
  });

  it("agrees with businessDayCalculator on a holiday-free week", () => {
    expect(isBusinessDay(d("2026-10-12"))).toBe(true);
    expect(isBusinessDay(d("2026-10-10"))).toBe(false);
    expect(isBusinessDay(d("2026-10-11"))).toBe(false);
  });

  it("produces the same legal deadline as the server", () => {
    for (const submission of ["2025-07-21", "2026-07-20", "2026-10-12"]) {
      expect(formatCalendarDate(addBusinessDays(d(submission), 15))).toBe(
        formatCalendarDate(businessDayCalculator.getComplaintDeadline(d(submission))),
      );
    }
  });

  it("reports remaining days, flooring at zero", () => {
    expect(getBusinessDaysRemaining(d("2026-10-19"), d("2026-10-12"))).toBe(5);
    expect(getBusinessDaysRemaining(d("2026-10-01"), d("2026-10-12"))).toBe(0);
  });
});

describe("complaintFormSchema", () => {
  const validSubmission = {
    consumerFullName: "Ana Pérez",
    consumerDocumentType: "DNI" as const,
    consumerDocumentNumber: "12345678",
    consumerAddress: "Av. Siempre Viva 123",
    consumerPhone: "987654321",
    consumerEmail: "ana@example.com",
    productServiceName: "Plan de internet",
    complaintType: "reclamo" as const,
    complaintDetail: "El servicio se interrumpió por tres días.",
    consentGiven: true,
  };

  it("accepts a complete submission", () => {
    expect(complaintFormSchema.safeParse(validSubmission).success).toBe(true);
  });

  it("requires consent for personal data processing", () => {
    const result = complaintFormSchema.safeParse({ ...validSubmission, consentGiven: false });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const result = complaintFormSchema.safeParse({ ...validSubmission, consumerEmail: "no-es-email" });
    expect(result.success).toBe(false);
  });

  it("requires the mandatory consumer fields", () => {
    const result = complaintFormSchema.safeParse({ ...validSubmission, consumerFullName: "" });
    expect(result.success).toBe(false);
  });
});
