import { describe, it, expect } from "vitest";
import type { Complaint } from "@shared/schema";
import {
  csvEscape,
  buildSirecCsv,
  computeVerificationCode,
  buildManifest,
} from "./expedienteService";

const complaint = (overrides: Partial<Complaint> = {}): Complaint =>
  ({
    id: "c1",
    businessId: "b1",
    establishmentId: "e1",
    correlativeNumber: "2026-0001",
    complaintType: "reclamo",
    consumerFullName: 'Juan "Comillas" Quispe',
    consumerDocumentType: "DNI",
    consumerDocumentNumber: "12345678",
    consumerAddress: "Calle Falsa 123",
    consumerPhone: "987654321",
    consumerEmail: "juan@example.com",
    productServiceName: "Laptop XYZ",
    complaintDetail: "No encendió, con coma, y \"comillas\"",
    consumerRequest: "Reembolso",
    status: "responded",
    priority: "normal",
    submissionDate: new Date("2026-01-05T12:00:00Z"),
    dueDate: new Date("2026-01-26T12:00:00Z"),
    isOverdue: false,
    consentGiven: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as unknown as Complaint;

describe("expedienteService", () => {
  it("escapes CSV cells per RFC 4180", () => {
    expect(csvEscape("simple")).toBe("simple");
    expect(csvEscape('con "comillas"')).toBe('"con ""comillas"""');
    expect(csvEscape("con,coma")).toBe('"con,coma"');
    expect(csvEscape(null)).toBe("");
  });

  it("builds a SIREC CSV with one row per complaint", () => {
    const csv = buildSirecCsv([complaint(), complaint({ correlativeNumber: "2026-0002" })]);

    // The file ends with a trailing CRLF, so ignore the empty tail element
    const lines = csv.split("\r\n").filter((line) => line.length > 0);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("N° Correlativo");
    expect(lines[1]).toContain("2026-0001");
    expect(lines[2]).toContain("2026-0002");
    // Commas inside the detail must be escaped, not break the structure
    expect(lines[1]).toContain('"No encendió, con coma, y ""comillas"""');
  });

  it("computes a deterministic verification code", () => {
    const at = new Date("2026-06-01T00:00:00Z");
    const one = computeVerificationCode("b1", [complaint()], at);
    const two = computeVerificationCode("b1", [complaint()], at);
    const other = computeVerificationCode("b2", [complaint()], at);

    expect(one).toBe(two);
    expect(one).not.toBe(other);
    expect(one).toMatch(/^[0-9A-F]{16}$/);
  });

  it("builds a manifest with company data and the verification code", () => {
    const manifest = buildManifest(
      {
        business: { id: "b1", ruc: "12345678901", businessName: "Demo SAC" } as any,
        complaints: [complaint()],
        filters: { type: "reclamo" },
        generatedAt: new Date("2026-06-01T00:00:00Z"),
      },
      "ABCDEF0123456789",
      2,
    );

    expect(manifest).toContain("Demo SAC");
    expect(manifest).toContain("12345678901");
    expect(manifest).toContain("ABCDEF0123456789");
    expect(manifest).toContain("Tipo: reclamo");
    expect(manifest).toContain("Reclamaciones incluidas: 1");
  });
});
