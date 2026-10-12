/**
 * Live verification of the AI provider connection. Run with:
 *
 *   npx tsx scripts/verify-ai.ts
 *
 * Calls every AI feature once and prints the results, so you can confirm the
 * configured provider (default: Groq with open-weight Llama models) works
 * before relying on it in production.
 */
import "../server/env";
import { aiService, getAIStatus } from "../server/services/aiService";

async function main() {
  const status = getAIStatus();
  console.log("AI provider status:");
  console.log(JSON.stringify(status, null, 2));

  if (!status.enabled) {
    console.error("\n✗ AI_API_KEY is not set - all features run in local fallback mode.");
    process.exit(1);
  }

  console.log("\n--- 1. Classification + draft response ---");
  const classification = await aiService.classifyComplaint(
    "Compré un celular el 3 de enero y llegó con la pantalla dañada. Exijo un reembolso inmediato; si no me responden voy a denunciarlos ante INDECOPI."
  );
  console.log(JSON.stringify(classification, null, 2));

  console.log("\n--- 2. Full response drafting ---");
  const draft = await aiService.suggestResponse(
    "El producto llegó dañado y exijo un reembolso inmediato.",
    "reclamo"
  );
  console.log(`source: ${draft.source}`);
  console.log(draft.suggestion.slice(0, 600));

  console.log("\n--- 3. Trend analysis ---");
  const trends = await aiService.analyzeComplaintTrends([
    "El delivery llegó dos horas tarde y la comida fría.",
    "Mi pedido llegó con retraso de 3 horas.",
    "El producto llegó dañado y pido devolución.",
  ]);
  console.log(JSON.stringify(trends, null, 2));

  console.log("\n--- 4. Consumer form assistant ---");
  const assistance = await aiService.assistConsumerDraft("me trataron mal");
  console.log(JSON.stringify(assistance, null, 2));

  const ok = [classification, draft, trends, assistance].every((result) => result.source === "ai");
  console.log(`\n${ok ? "✓ All AI features verified against the live provider." : "✗ Some features fell back to heuristics - check the errors above."}`);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});
