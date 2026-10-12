import { describe, it, expect } from "vitest";
import { renderBrandInstructions } from "./aiService";

/**
 * Brand voice (Phase 3.10): the system-prompt fragment that makes AI drafts
 * follow the business's own tone and policies.
 */
describe("aiService brand voice", () => {
  it("adds nothing when there is no brand context", () => {
    expect(renderBrandInstructions()).toBe("");
    expect(renderBrandInstructions({})).toBe("");
    expect(renderBrandInstructions({ brandTone: "   ", brandPolicies: null })).toBe("");
  });

  it("injects the brand tone when configured", () => {
    const instructions = renderBrandInstructions({ brandTone: "Cercano y directo, tuteamos al cliente" });

    expect(instructions).toContain("Tono de marca");
    expect(instructions).toContain("Cercano y directo, tuteamos al cliente");
    expect(instructions).not.toContain("Políticas internas");
  });

  it("injects the business policies when configured", () => {
    const instructions = renderBrandInstructions({
      brandPolicies: "Reembolsos hasta 30 días con comprobante",
    });

    expect(instructions).toContain("Políticas internas");
    expect(instructions).toContain("Reembolsos hasta 30 días con comprobante");
  });

  it("combines tone and policies and trims the values", () => {
    const instructions = renderBrandInstructions({
      brandTone: "  Formal  ",
      brandPolicies: "  Sin descuentos  ",
    });

    expect(instructions).toContain("<tono>Formal</tono>");
    expect(instructions).toContain("<politicas>Sin descuentos</politicas>");
  });

  it("caps the injected text so a huge config cannot blow up the prompt", () => {
    const instructions = renderBrandInstructions({
      brandTone: "x".repeat(5000),
      brandPolicies: "y".repeat(5000),
    });

    // 600 + 1500 chars of content plus the wrapper sentences
    expect(instructions.length).toBeLessThan(2500);
    expect(instructions).not.toContain("x".repeat(700));
    expect(instructions).not.toContain("y".repeat(1600));
  });
});
