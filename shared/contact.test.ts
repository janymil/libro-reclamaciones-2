import { describe, expect, it } from "vitest";

import { contactMessageSchema, contactSubjectLabel } from "./contact";

const validMessage = {
  name: "Ana Torres",
  email: "ana@example.com",
  phone: "+51 987 654 321",
  subject: "demo" as const,
  message: "Quisiera ver una demostración para mi restaurante en Arequipa.",
  consent: true as const,
};

describe("contactMessageSchema", () => {
  it("accepts a complete message", () => {
    expect(contactMessageSchema.safeParse(validMessage).success).toBe(true);
  });

  it("accepts a message without phone, because it is optional", () => {
    const { phone: _phone, ...withoutPhone } = validMessage;
    expect(contactMessageSchema.safeParse(withoutPhone).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = contactMessageSchema.safeParse({ ...validMessage, email: "ana@" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("correo");
    }
  });

  it("requires an explicit consent", () => {
    expect(contactMessageSchema.safeParse({ ...validMessage, consent: false }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...validMessage, consent: undefined }).success).toBe(false);
  });

  it("rejects a message that is too short to be useful", () => {
    expect(contactMessageSchema.safeParse({ ...validMessage, message: "hola" }).success).toBe(false);
  });

  it("rejects the honeypot when a bot fills it", () => {
    expect(contactMessageSchema.safeParse({ ...validMessage, website: "spam" }).success).toBe(false);
  });

  it("rejects an unknown subject", () => {
    expect(contactMessageSchema.safeParse({ ...validMessage, subject: "ventas" }).success).toBe(false);
  });
});

describe("contactSubjectLabel", () => {
  it("returns the Spanish label for the email", () => {
    expect(contactSubjectLabel("facturacion")).toBe("Facturación y pagos");
  });
});
