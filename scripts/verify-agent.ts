/**
 * Live verification of the compliance co-pilot. Run with:
 *
 *   npx tsx scripts/verify-agent.ts
 *
 * Sends a knowledge question (normative retrieval) and a data question (the
 * tenant-scoped tools) through the tool-calling loop and prints the answer, the
 * tools the model invoked and the citations it used. Requires AI_API_KEY to
 * exercise the live model; without it, the agent answers from the local corpus.
 *
 * The business id is a real UUID because the tenant-scoped storage queries are
 * typed as `uuid` in PostgreSQL; it points at no real tenant on purpose, so the
 * data question exercises the "no data" path.
 */
import "../server/env";
import { runAgent } from "../server/services/agentService";

const CONTEXT = {
  businessId: "00000000-0000-0000-0000-000000000000",
  businessName: "Demo SAC",
  userId: "verify",
  userName: "Verificación",
};

async function main() {
  const enabled = Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
  console.log(`AI provider configured: ${enabled}\n`);

  console.log("--- 1. Knowledge question (buscar_normativa) ---");
  const knowledge = await runAgent(CONTEXT, [
    { role: "user", content: "¿En cuántos días hábiles debo responder un reclamo y qué norma lo exige?" },
  ]);
  console.log(`source: ${knowledge.source} | tools: ${knowledge.toolsUsed.join(", ") || "-"}`);
  console.log(knowledge.reply);
  console.log(`citations: ${knowledge.citations.map((citation) => `${citation.norm} ${citation.article}`).join(" | ") || "-"}`);

  console.log("\n--- 2. Data question (tenant-scoped tools) ---");
  const data = await runAgent(CONTEXT, [
    { role: "user", content: "¿Cuántas reclamaciones tengo registradas y cuántas están vencidas?" },
  ]);
  console.log(`source: ${data.source} | tools: ${data.toolsUsed.join(", ") || "-"}`);
  console.log(data.reply);

  process.exit(0);
}

main().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});
