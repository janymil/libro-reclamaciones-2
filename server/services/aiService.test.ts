import { describe, expect, it } from "vitest";
import {
  AI_MODEL,
  aiService,
  getAIStatus,
  heuristicConsumerAssistance,
  renderConsumerDraftContext,
} from "./aiService";

/**
 * The AI features are optional: the server must boot and the endpoints must stay
 * usable when no provider key is configured (AI_API_KEY, or the legacy
 * OPENAI_API_KEY). In that case every call falls back to local heuristics
 * instead of throwing, and the result is tagged source: 'fallback' so the UI
 * can warn the user.
 */
const hasApiKey = Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY);

describe.skipIf(hasApiKey)("aiService without an AI provider key", () => {
  it("still reports model names", () => {
    expect(AI_MODEL.length).toBeGreaterThan(0);
  });

  it("classifies with keyword heuristics instead of throwing", async () => {
    const classification = await aiService.classifyComplaint("El producto llegó dañado.");

    expect(classification.source).toBe("fallback");
    expect(classification.type).toBe("reclamo");
    expect(classification.confidence).toBe(0.35);
    expect(classification.category).toBe("calidad");
    expect(classification.priority).toBe("high");
    expect(classification.riskLevel).toBe("medium");
    expect(classification.keywords).toEqual([]);
  });

  it("flags legal-risk cases as urgent in the heuristic fallback", async () => {
    const classification = await aiService.classifyComplaint(
      "Voy a denunciarlos ante INDECOPI, esto es una estafa."
    );

    expect(classification.priority).toBe("urgent");
    expect(classification.riskLevel).toBe("high");
    expect(classification.sentiment).toBe("negative");
  });

  it("detects quejas about service in the heuristic fallback", async () => {
    const classification = await aiService.classifyComplaint(
      "La atención del personal fue pésima, muy groseros."
    );

    expect(classification.type).toBe("queja");
    expect(classification.category).toBe("atencion");
  });

  it("returns a manual-response message instead of throwing", async () => {
    const result = await aiService.suggestResponse("El producto llegó dañado.", "reclamo");

    expect(result.suggestion).toContain("manualmente");
    expect(result.source).toBe("fallback");
  });

  it("returns empty trend analysis instead of throwing", async () => {
    const trends = await aiService.analyzeComplaintTrends(["uno", "dos"]);

    expect(trends.commonIssues).toEqual([]);
    expect(trends.recommendations).toEqual([]);
    expect(trends.severity).toBe("medium");
    expect(trends.source).toBe("fallback");
  });

  it("exposes provider status for GET /api/ai/status", () => {
    const status = getAIStatus();

    expect(status.enabled).toBe(false);
    expect(status.model.length).toBeGreaterThan(0);
    expect(status.fastModel.length).toBeGreaterThan(0);
  });
});

/**
 * The public form assistant now receives the non-personal fields the visitor
 * already completed, because reviewing the textarea alone made it report as
 * missing what the form already held. These tests pin the part that runs in any
 * deployment without an AI key, i.e. the fallback a self-hosted instance keeps.
 */
describe("heuristicConsumerAssistance with declared form data", () => {
  const draft =
    "El televisor comenzó a fallar a los pocos días de uso y sigue mostrando líneas horizontales en la pantalla.";

  it("does not report as missing what the form fields already declare", () => {
    const assistance = heuristicConsumerAssistance(draft, {
      productServiceName: "TV Sony 50",
      purchaseDate: "2026-10-10",
      receiptNumber: "4565548786654",
    });

    expect(assistance.missingFields).not.toContain("el nombre del producto o servicio");
    expect(assistance.missingFields).not.toContain("la fecha aproximada de la compra o del problema");
    // The draft still never asks for anything: a real gap, so it stays reported.
    expect(assistance.missingFields).toContain("qué solución solicita (reembolso, cambio, reparación, etc.)");
    expect(assistance.source).toBe("fallback");
  });

  it("still reports the fields nobody filled in", () => {
    const assistance = heuristicConsumerAssistance(draft, { complaintType: "reclamo" });

    expect(assistance.missingFields).toContain("el nombre del producto o servicio");
    expect(assistance.missingFields).toContain("la fecha aproximada de la compra o del problema");
  });

  it("counts a declared field as a declaration, not as detail", () => {
    // The narrative is what the business reads: a one-line detail stays flagged
    // even when every other field of the form is complete.
    const assistance = heuristicConsumerAssistance("No funciona", {
      productServiceName: "TV Sony 50",
      purchaseDate: "2026-10-10",
      receiptNumber: "4565548786654",
      consumerRequest: "Quiero la reparación del equipo",
    });

    expect(assistance.missingFields).toContain("más detalle sobre lo ocurrido");
    expect(assistance.missingFields).not.toContain("qué solución solicita (reembolso, cambio, reparación, etc.)");
  });

  it("renders the declared fields for the prompt, and nothing when there are none", () => {
    expect(renderConsumerDraftContext(undefined)).toBe("");

    expect(
      renderConsumerDraftContext({ productServiceName: "TV Sony 50", purchaseAmount: "4850" }),
    ).toBe("- Nombre del producto o servicio: TV Sony 50\n- Monto reclamado (S/): 4850");
  });
});

describe.skipIf(hasApiKey)("assistConsumerDraft without an AI provider key", () => {
  it("uses the declared fields in the fallback too", async () => {
    const assistance = await aiService.assistConsumerDraft(
      "Compré un televisor y a los pocos días la imagen empezó a parpadear con líneas horizontales.",
      { productServiceName: "TV Sony 50", purchaseDate: "2026-10-10" },
    );

    expect(assistance.source).toBe("fallback");
    expect(assistance.missingFields).not.toContain("el nombre del producto o servicio");
    expect(assistance.missingFields).not.toContain("la fecha aproximada de la compra o del problema");
  });
});

