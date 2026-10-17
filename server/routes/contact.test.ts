import { beforeEach, describe, expect, it, vi } from "vitest";

import { call, startTestApp } from "../test/routeTestHarness";

/**
 * `POST /api/contact` (formulario de contacto público).
 *
 * Lo que estas pruebas fijan:
 *   * sin CAPTCHA válido no se envía nada;
 *   * el honeypot responde "ok" a un bot sin gastar un correo;
 *   * un mensaje válido llega al buzón del operador con el asunto traducido;
 *   * un cuerpo inválido se rechaza con el detalle del campo, sin enviar.
 *
 * El envío real (SMTP) y la identidad de la plataforma se mockean: la prueba es
 * del handler, no del proveedor de correo.
 */

const h = vi.hoisted(() => ({
  sent: [] as any[],
  contactEmail: "hola@librodigital.pe",
}));

vi.mock("../middleware/rateLimits", () => ({
  contactLimiter: (_req: any, _res: any, next: () => void) => next(),
}));

vi.mock("../services/emailService", () => ({
  emailService: {
    sendContactMessage: async (params: any) => {
      h.sent.push(params);
    },
  },
}));

vi.mock("../services/platformSettingsService", () => ({
  getIdentity: async () => ({
    legalName: "Servicios SAAS",
    commercialName: "LibroDigital.pe",
    ruc: "10411592982",
    fiscalAddress: "",
    contactEmail: h.contactEmail,
    contactPhone: "+51 938 693 848",
    website: "https://librodigital.pe",
  }),
}));

import { registerContactRoutes } from "./contact.routes";
import { issueCaptcha, solvePowChallengeSync } from "../services/captchaService";

const validBody = {
  name: "Ana Torres",
  email: "ana@example.com",
  phone: "+51 987 654 321",
  subject: "demo",
  message: "Quisiera ver una demostración para mi restaurante en Arequipa.",
  consent: true,
};

function solvedCaptcha() {
  const challenge = issueCaptcha();
  return {
    captchaToken: challenge.token,
    captchaAnswer: solvePowChallengeSync(challenge),
  };
}

describe("POST /api/contact", () => {
  beforeEach(() => {
    h.sent.length = 0;
    process.env.CAPTCHA_MIN_DWELL_MS = "0";
  });

  it("rejects a message without a valid captcha and sends nothing", async () => {
    const app = await startTestApp(registerContactRoutes);
    try {
      const response = await call(app.url, "/api/contact", { method: "POST", body: validBody });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("captcha_invalid");
      expect(h.sent).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("answers ok to a bot that fills the honeypot, without sending", async () => {
    const app = await startTestApp(registerContactRoutes);
    try {
      const response = await call(app.url, "/api/contact", {
        method: "POST",
        body: { ...validBody, website: "https://spam.example" },
      });

      expect(response.status).toBe(201);
      expect(h.sent).toHaveLength(0);
    } finally {
      await app.close();
    }
  });

  it("sends a valid message to the platform inbox with the subject label", async () => {
    const app = await startTestApp(registerContactRoutes);
    try {
      const response = await call(app.url, "/api/contact", {
        method: "POST",
        body: { ...validBody, ...solvedCaptcha() },
      });

      expect(response.status).toBe(201);
      expect(h.sent).toHaveLength(1);
      expect(h.sent[0]).toMatchObject({
        to: "hola@librodigital.pe",
        name: "Ana Torres",
        email: "ana@example.com",
        subjectLabel: "Quiero ver una demostración",
      });
    } finally {
      await app.close();
    }
  });

  it("rejects an invalid body with field detail and sends nothing", async () => {
    const app = await startTestApp(registerContactRoutes);
    try {
      const response = await call(app.url, "/api/contact", {
        method: "POST",
        body: { ...validBody, email: "ana@", ...solvedCaptcha() },
      });

      expect(response.status).toBe(400);
      expect(response.body.code).toBe("invalid_input");
      expect(response.body.issues?.[0]?.field).toBe("email");
      expect(h.sent).toHaveLength(0);
    } finally {
      await app.close();
    }
  });
});
