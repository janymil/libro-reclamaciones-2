import { describe, expect, it } from "vitest";
import { AI_MODEL, aiService } from "./aiService";

/**
 * The AI features are optional: the server must boot and the endpoints must stay
 * usable when no OpenAI key is configured. Previously the client was constructed
 * eagerly with a `"default_key"` placeholder, so a missing key surfaced as a
 * request-time API error rather than an explicit fallback.
 */
const hasApiKey = Boolean(process.env.OPENAI_API_KEY);

describe.skipIf(hasApiKey)("aiService without OPENAI_API_KEY", () => {
  it("still reports a model name", () => {
    expect(AI_MODEL.length).toBeGreaterThan(0);
  });

  it("classifies with the documented heuristic fallback instead of throwing", async () => {
    const classification = await aiService.classifyComplaint("El producto llegó dañado.");

    expect(classification.type).toBe("reclamo");
    expect(classification.confidence).toBe(0.5);
    expect(classification.priority).toBe("normal");
    expect(classification.riskLevel).toBe("medium");
    expect(classification.keywords).toEqual([]);
  });

  it("returns a manual-response message instead of throwing", async () => {
    const response = await aiService.suggestResponse("El producto llegó dañado.", "reclamo");

    expect(response).toContain("manualmente");
  });

  it("returns empty trend analysis instead of throwing", async () => {
    const trends = await aiService.analyzeComplaintTrends(["uno", "dos"]);

    expect(trends.commonIssues).toEqual([]);
    expect(trends.recommendations).toEqual([]);
    expect(trends.severity).toBe("medium");
  });
});
