import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import crypto from "crypto";

import { powInput, satisfiesPow } from "@shared/pow";
import { RETENTION_MONTHS } from "@shared/plans";

import { startTestApp, call } from "../test/routeTestHarness";

/**
 * The CAPTCHA gate on every public, unauthenticated endpoint.
 *
 * `captchaService` is unit-tested on its own; what these tests pin down is the
 * *wiring*: a solved proof of work must open the door, an unsolved one must not,
 * and a solved one must be worthless the second time. Every route that accepts
 * anonymous traffic is covered, because the failure mode that matters is a new
 * endpoint being added later without the gate.
 *
 * Storage, the AI provider and the intake/registration services are mocked (no
 * database, no email, no model call), while the real routers, middleware and
 * rate limiters run.
 */

const h = vi.hoisted(() => ({
  intakeComplaint: vi.fn(),
  assistConsumerDraft: vi.fn(),
  registerUser: vi.fn(),
  isBusinessPublished: vi.fn(),
  getBusiness: vi.fn(),
  createArcoRequest: vi.fn(),
  createNotification: vi.fn(),
  getLibroConfigurationBySlug: vi.fn(),
  findComplaintByCorrelative: vi.fn(),
  getBusinessById: vi.fn(),
  getEstablishmentsByBusiness: vi.fn(),
}));

vi.mock("../services/complaintIntakeService", () => ({
  intakeComplaint: h.intakeComplaint,
  IntakeError: class IntakeError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("../services/aiService", () => ({
  aiService: { assistConsumerDraft: h.assistConsumerDraft },
  getAIStatus: () => ({ enabled: true, provider: "test", model: "test", fastModel: "test" }),
}));

vi.mock("../services/authService", () => ({
  authService: { registerUser: h.registerUser },
}));

vi.mock("../services/verificationService", () => ({
  isBusinessPublished: h.isBusinessPublished,
  allowsUnverifiedBusinesses: () => false,
}));

vi.mock("../services/subscriptionService", () => ({
  enforceQuota: async () => ({ allowed: true }),
  enforceComplaintType: async () => ({ allowed: true }),
  hasFeature: () => true,
  newBusinessTrialDefaults: () => ({}),
}));

vi.mock("../storage", () => ({
  storage: {
    getLibroConfigurationBySlug: h.getLibroConfigurationBySlug,
    findComplaintByCorrelative: h.findComplaintByCorrelative,
    getBusinessById: h.getBusinessById,
    getEstablishmentsByBusiness: h.getEstablishmentsByBusiness,
    getBusiness: h.getBusiness,
    createArcoRequest: h.createArcoRequest,
    createNotification: h.createNotification,
  },
}));

import { registerPublicRoutes } from "./public.routes";
import { registerComplaintsRoutes } from "./complaints.routes";
import { registerArcoRoutes } from "./arco.routes";
import { registerAiRoutes } from "./ai.routes";
import { registerAuthRoutes } from "./auth.routes";

const BUSINESS = "11111111-1111-4111-8111-111111111111";
const ESTABLISHMENT = "22222222-2222-4222-8222-222222222222";

function findNonce(salt: string, difficulty: number, maxNumber: number): number {
  for (let nonce = 0; nonce <= maxNumber; nonce++) {
    const digest = crypto.createHash("sha256").update(powInput(salt, nonce)).digest("hex");
    if (satisfiesPow(digest, difficulty)) {
      return nonce;
    }
  }
  throw new Error("the server issued an unsolvable challenge");
}

/** A complete consumer complaint body (the schema is validated first). */
function complaintBody() {
  return {
    businessId: BUSINESS,
    establishmentId: ESTABLISHMENT,
    complaintType: "reclamo",
    consumerFullName: "Consumidor de Prueba",
    consumerDocumentType: "DNI",
    consumerDocumentNumber: "44556677",
    consumerAddress: "Av. Los Pruebas 123",
    consumerPhone: "998877665",
    consumerEmail: "consumidor@example.com",
    productServiceName: "Servicio de prueba",
    complaintDetail: "Detalle de la reclamación para la prueba automatizada del captcha.",
    responseMethod: "email",
  };
}

/** A complete ARCO request body. */
function arcoBody() {
  return {
    businessId: BUSINESS,
    requestType: "access",
    requesterName: "Titular de los datos",
    requesterEmail: "titular@example.com",
    requesterDocumentType: "DNI",
    requesterDocumentNumber: "44556677",
    requestDetail: "Solicito acceder a los datos personales que obran en su poder.",
  };
}


describe("CAPTCHA gate on the public endpoints", () => {
  let app: { url: string; close: () => Promise<void> };

  beforeAll(async () => {
    app = await startTestApp((app) => {
      registerPublicRoutes(app);
      registerComplaintsRoutes(app);
      registerArcoRoutes(app);
      registerAiRoutes(app);
      registerAuthRoutes(app);
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    // Dwell time off by default: the gates are exercised immediately, and the
    // rule itself has its own test below.
    process.env.CAPTCHA_MIN_DWELL_MS = "0";

    h.isBusinessPublished.mockResolvedValue(true);
    h.intakeComplaint.mockResolvedValue({
      complaint: {
        id: "complaint-1",
        correlativeNumber: "REC-2026-000001",
        dueDate: new Date("2026-12-01T00:00:00.000Z"),
      },
    });
    h.assistConsumerDraft.mockResolvedValue({
      isComplete: true,
      missingFields: [],
      suggestions: [],
      improvedText: null,
      source: "fallback",
    });
    h.registerUser.mockResolvedValue({ success: true, message: "Cuenta creada", userId: "user-1" });
    h.getBusiness.mockResolvedValue(undefined);
    h.getBusinessById.mockResolvedValue(undefined);
    h.getEstablishmentsByBusiness.mockResolvedValue([]);
    h.createArcoRequest.mockImplementation(async (data: any) => ({ id: "arco-1", ...data }));
    h.createNotification.mockResolvedValue({ id: "notification-1" });
    h.getLibroConfigurationBySlug.mockResolvedValue({
      id: "libro-1",
      businessId: BUSINESS,
      isActive: true,
      urlSlug: "empresa-demo",
    });
    h.findComplaintByCorrelative.mockResolvedValue({
      correlativeNumber: "REC-2026-000001",
      complaintType: "reclamo",
      status: "new",
      productServiceName: "Servicio de prueba",
      submissionDate: new Date("2026-11-01T00:00:00.000Z"),
      dueDate: new Date("2026-11-20T00:00:00.000Z"),
      responseDate: null,
      providerResponse: null,
      isOverdue: false,
    });
  });

  /** Fetches a fresh challenge and solves it the way the browser does. */
  async function solveCaptcha() {
    const challenge = await call(app.url, "/api/public/captcha");
    expect(challenge.status).toBe(200);

    const nonce = findNonce(
      challenge.body.salt,
      challenge.body.difficulty,
      challenge.body.maxNumber
    );

    return {
      challenge: challenge.body,
      captchaToken: challenge.body.token,
      captchaAnswer: String(nonce),
    };
  }

  it("issues a puzzle, never an answer", async () => {
    const { challenge } = await solveCaptcha();

    expect(challenge.algorithm).toBe("SHA-256");
    expect(challenge.difficulty).toBeGreaterThanOrEqual(1);
    expect(challenge.question).not.toMatch(/\d/);
  });

  describe("complaint intake", () => {
    it("rejects a submission with no challenge", async () => {
      const res = await call(app.url, "/api/public/complaints", {
        method: "POST",
        body: complaintBody(),
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("captcha_invalid");
      expect(h.intakeComplaint).not.toHaveBeenCalled();
    });

    it("rejects a submission whose answer does not satisfy the puzzle", async () => {
      const solved = await solveCaptcha();
      const res = await call(app.url, "/api/public/complaints", {
        method: "POST",
        body: { ...complaintBody(), captchaToken: solved.captchaToken, captchaAnswer: "999999" },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("captcha_invalid");
      expect(h.intakeComplaint).not.toHaveBeenCalled();
    });

    it("accepts a submission with a solved challenge", async () => {
      const solved = await solveCaptcha();
      const res = await call(app.url, "/api/public/complaints", {
        method: "POST",
        body: {
          ...complaintBody(),
          captchaToken: solved.captchaToken,
          captchaAnswer: solved.captchaAnswer,
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.correlativeNumber).toBe("REC-2026-000001");
      expect(h.intakeComplaint).toHaveBeenCalledTimes(1);
    });

    it("still rejects a solved challenge when the honeypot is filled", async () => {
      const solved = await solveCaptcha();
      const res = await call(app.url, "/api/public/complaints", {
        method: "POST",
        body: {
          ...complaintBody(),
          website: "http://spam.example",
          captchaToken: solved.captchaToken,
          captchaAnswer: solved.captchaAnswer,
        },
      });

      expect(res.status).toBe(404);
      expect(h.intakeComplaint).not.toHaveBeenCalled();
    });

    it("refuses a challenge submitted before a human could have filled the form", async () => {
      process.env.CAPTCHA_MIN_DWELL_MS = "1500";

      const solved = await solveCaptcha();
      const tooFast = await call(app.url, "/api/public/complaints", {
        method: "POST",
        body: {
          ...complaintBody(),
          captchaToken: solved.captchaToken,
          captchaAnswer: solved.captchaAnswer,
        },
      });

      expect(tooFast.status).toBe(400);
      expect(tooFast.body.message).toMatch(/demasiado rápida/i);
      expect(h.intakeComplaint).not.toHaveBeenCalled();

      // The same challenge is still valid once the dwell time has passed: the
      // rule must not punish a slow form, only an instant one.
      await new Promise((resolve) => setTimeout(resolve, 1600));

      const accepted = await call(app.url, "/api/public/complaints", {
        method: "POST",
        body: {
          ...complaintBody(),
          captchaToken: solved.captchaToken,
          captchaAnswer: solved.captchaAnswer,
        },
      });

      expect(accepted.status).toBe(200);
      process.env.CAPTCHA_MIN_DWELL_MS = "0";
    }, 10000);
  });

  describe("public AI assistant", () => {
    it("rejects a call with no challenge without spending anything", async () => {
      const res = await call(app.url, "/api/ai/public/assist", {
        method: "POST",
        body: { text: "Un borrador de reclamación suficientemente largo." },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("captcha_invalid");
      expect(h.assistConsumerDraft).not.toHaveBeenCalled();
    });

    it("checks the challenge before it checks the draft", async () => {
      // The order matters: a caller that did not do the work must be turned away
      // before the endpoint reaches for the (paid) model.
      const solved = await solveCaptcha();
      const res = await call(app.url, "/api/ai/public/assist", {
        method: "POST",
        body: { text: "corto", captchaToken: solved.captchaToken, captchaAnswer: solved.captchaAnswer },
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/texto del borrador/i);
      expect(h.assistConsumerDraft).not.toHaveBeenCalled();
    });

    it("assists a draft once the challenge is solved", async () => {
      const solved = await solveCaptcha();
      const res = await call(app.url, "/api/ai/public/assist", {
        method: "POST",
        body: {
          text: "Compré un producto que llegó dañado y no me respondieron.",
          captchaToken: solved.captchaToken,
          captchaAnswer: solved.captchaAnswer,
        },
      });

      expect(res.status).toBe(200);
      expect(h.assistConsumerDraft).toHaveBeenCalledTimes(1);
    });

    it("forwards the declared form fields, but never the visitor's personal data", async () => {
      const solved = await solveCaptcha();
      const res = await call(app.url, "/api/ai/public/assist", {
        method: "POST",
        body: {
          text: "El televisor comenzó a fallar a los pocos días de uso.",
          context: {
            productServiceName: "TV Sony 50",
            purchaseDate: "2026-10-10",
            receiptNumber: "4565548786654",
            // Not whitelisted: a hostile body must not smuggle PII into the
            // prompt the model reads.
            consumerFullName: "Ana Pérez",
            consumerDocumentNumber: "45678912",
            consumerAddress: "Av. Siempre Viva 742",
            consumerEmail: "ana@example.com",
          },
          captchaToken: solved.captchaToken,
          captchaAnswer: solved.captchaAnswer,
        },
      });

      expect(res.status).toBe(200);
      expect(h.assistConsumerDraft).toHaveBeenCalledWith("El televisor comenzó a fallar a los pocos días de uso.", {
        productServiceName: "TV Sony 50",
        purchaseDate: "2026-10-10",
        receiptNumber: "4565548786654",
      });
    });

    it("burns the challenge, so a solved puzzle cannot be replayed", async () => {
      const solved = await solveCaptcha();
      const first = await call(app.url, "/api/ai/public/assist", {
        method: "POST",
        body: {
          text: "Compré un producto que llegó dañado y no me respondieron.",
          captchaToken: solved.captchaToken,
          captchaAnswer: solved.captchaAnswer,
        },
      });
      expect(first.status).toBe(200);

      const replay = await call(app.url, "/api/ai/public/assist", {
        method: "POST",
        body: {
          text: "Compré un producto que llegó dañado y no me respondieron.",
          captchaToken: solved.captchaToken,
          captchaAnswer: solved.captchaAnswer,
        },
      });

      expect(replay.status).toBe(400);
      expect(replay.body.message).toMatch(/ya fue utilizado/i);
      expect(h.assistConsumerDraft).toHaveBeenCalledTimes(1);
    });
  });

  describe("registration", () => {
    it("rejects a registration with no challenge", async () => {
      const res = await call(app.url, "/api/auth/register", {
        method: "POST",
        body: { firstName: "Ana", lastName: "Pérez", email: "ana@example.com" },
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("captcha_invalid");
      expect(h.registerUser).not.toHaveBeenCalled();
    });

    it("lets a solved registration through to validation", async () => {
      const solved = await solveCaptcha();
      const res = await call(app.url, "/api/auth/register", {
        method: "POST",
        body: { firstName: "A", captchaToken: solved.captchaToken, captchaAnswer: solved.captchaAnswer },
      });

      // Not a captcha rejection: the gate opened and the payload was rejected for
      // its own reasons, without creating an account.
      expect(res.status).toBe(400);
      expect(res.body.message).toBe("Datos inválidos");
      expect(h.registerUser).not.toHaveBeenCalled();
    });
  });

  describe("ARCO intake", () => {
    it("rejects a request with no challenge", async () => {
      const res = await call(app.url, "/api/arco-requests", {
        method: "POST",
        body: arcoBody(),
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("captcha_invalid");
      expect(h.createArcoRequest).not.toHaveBeenCalled();
    });

    it("lets a solved request through and does not write it for an unknown business", async () => {
      const solved = await solveCaptcha();
      const res = await call(app.url, "/api/arco-requests", {
        method: "POST",
        body: { ...arcoBody(), captchaToken: solved.captchaToken, captchaAnswer: solved.captchaAnswer },
      });

      expect(res.status).toBe(404);
      expect(res.body.message).toMatch(/no encontrada/i);
      expect(h.createArcoRequest).not.toHaveBeenCalled();
    });
  });

  describe("public complaint tracking", () => {
    it("throttles the lookup instead of answering as a free oracle", async () => {
      const path = "/api/public/libro/empresa-demo/consultar/REC-2026-000001?documento=44556677";

      const answered: number[] = [];
      for (let attempt = 0; attempt < 35; attempt++) {
        const res = await call(app.url, path);
        answered.push(res.status);
      }

      // Normal lookups are served, and the ones past the ceiling are refused: an
      // unthrottled endpoint lets anyone walk the sequential correlativos while
      // guessing an 8-digit document number.
      expect(answered.slice(0, 30).every((status) => status === 200)).toBe(true);
      expect(answered.slice(30).every((status) => status === 429)).toBe(true);
    });
  });

  describe("public privacy policy", () => {
    const publishedBook = {
      id: "libro-1",
      businessId: BUSINESS,
      isActive: true,
      urlSlug: "empresa-demo",
      libroName: "Libro de Reclamaciones",
      whatsappNumber: "999888777",
      websiteUrl: "https://www.wong.pe",
      privacyPolicyUrl: null as string | null,
    };

    const cencosud = {
      id: BUSINESS,
      businessName: "Cencosud Retail Perú S.A.",
      commercialName: "Wong",
      ruc: "20109072177",
      address: "Av. Alfredo Benavides 3187",
      distrito: "Santiago de Surco",
      provincia: "Lima",
      departamento: "Lima",
      // Plan fields getEffectivePlan reads: the book payload resolves them.
      subscriptionPlan: "gratis",
      subscriptionStatus: "active",
      trialEndsAt: null,
    };

    it("serves the hosted policy of the book, without the notification inbox", async () => {
      h.getLibroConfigurationBySlug.mockResolvedValue(publishedBook);
      h.getBusinessById.mockResolvedValue(cencosud);

      const res = await call(app.url, "/api/public/libro/empresa-demo/privacy-policy");

      expect(res.status).toBe(200);
      expect(res.body.policy.responsible).toMatchObject({
        name: "Cencosud Retail Perú S.A.",
        ruc: "20109072177",
        address: "Av. Alfredo Benavides 3187, Santiago de Surco, Lima, Lima",
      });
      expect(res.body.policy.retentionMonths).toBe(RETENTION_MONTHS);
      expect(res.body.policy.sections).toHaveLength(8);
      expect(res.body.policy.arcoChannels).toContain("Por WhatsApp al 999888777.");
      // The notification inbox is internal contact data: the consumer-facing
      // endpoints stopped exposing it, and the policy page must not leak it back.
      expect(JSON.stringify(res.body)).not.toMatch(/@/);
    });

    it("answers 404 for a book that does not exist", async () => {
      h.getLibroConfigurationBySlug.mockResolvedValue(undefined);

      const res = await call(app.url, "/api/public/libro/no-existe/privacy-policy");

      expect(res.status).toBe(404);
    });

    it("publishes the business's own policy link when it has one", async () => {
      h.getLibroConfigurationBySlug.mockResolvedValue({
        ...publishedBook,
        privacyPolicyUrl: "https://www.wong.pe/politica-de-privacidad",
      });
      h.getBusinessById.mockResolvedValue(cencosud);

      const res = await call(app.url, "/api/public/libro/empresa-demo");

      expect(res.status).toBe(200);
      expect(res.body.libro.privacyPolicyUrl).toBe("https://www.wong.pe/politica-de-privacidad");
    });

    it("never publishes a link that is not http(s), even if it is stored", async () => {
      // A value written before the validation existed (or straight into the table)
      // must not reach the href of the consent checkbox.
      h.getLibroConfigurationBySlug.mockResolvedValue({
        ...publishedBook,
        privacyPolicyUrl: "javascript:alert(document.cookie)",
      });
      h.getBusinessById.mockResolvedValue(cencosud);

      const res = await call(app.url, "/api/public/libro/empresa-demo");

      expect(res.status).toBe(200);
      expect(res.body.libro.privacyPolicyUrl).toBeNull();
    });
  });
});
