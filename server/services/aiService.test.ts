import { describe, expect, it } from "vitest";
import { AI_MODEL, aiService, getAIStatus } from "./aiService";

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

