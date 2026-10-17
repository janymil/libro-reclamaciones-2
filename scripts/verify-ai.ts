/**
 * Live verification of the AI provider connection. Run with:
 *
 *   npx tsx scripts/verify-ai.ts
 *
 * Calls every aiService feature once and prints the results, so you can confirm
 * the configured provider (default: Groq with open-weight GPT-OSS models) works
 * before relying on it in production. The compliance co-pilot is verified
 * separately by `scripts/verify-agent.ts` (it has its own tool-calling loop).
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

  console.log("\n--- 4. Consumer form assistant (draft + declared form fields) ---");
  // Mirrors what the public form now sends: the draft *and* the non-personal
  // fields the visitor already completed, so the assistant stops reporting as
  // missing what the form already holds (product, amount, date, receipt number).
  const assistance = await aiService.assistConsumerDraft(
    "El dia 10 de octubre de 2026 compré un televisor Sony Smart TV de 55 pulgadas. Después de unos días de uso, el equipo comenzó a presentar problemas de imagen, con parpadeos constantes y líneas horizontales en la pantalla. He intentado solucionar el problema reiniciando el televisor y restableciendo la configuración de fábrica, pero la falla continúa.",
    {
      productServiceName: "TV Sony 50",
      purchaseAmount: "4850",
      purchaseDate: "2026-10-10",
      receiptNumber: "4565548786654",
    }
  );
  console.log(JSON.stringify(assistance, null, 2));
  console.log(
    assistance.missingFields.some((field) => /producto|comprobante|factura|fecha de consumo/i.test(field))
      ? "✗ The assistant still reports a declared field as missing."
      : "✓ No declared field (producto, monto, fecha de consumo, comprobante) is reported as missing."
  );

  console.log("\n--- 5. Abusive-clause review ---");
  const clauses = await aiService.detectAbusiveClauses(
    "El proveedor no será responsable por ningún daño, pérdida o perjuicio derivado del uso del producto. " +
      "El consumidor renuncia expresamente a presentar cualquier reclamo o denuncia ante INDECOPI. " +
      "Las decisiones del proveedor sobre garantías son definitivas e inapelables.",
  );
  console.log(JSON.stringify(clauses, null, 2));

  console.log("\n--- 6. Executive case summary ---");
  const summary = await aiService.generateCaseSummary(
    "Correlativo: 2026-0001\nTipo: reclamo (prioridad urgent)\nEstado: new\n" +
      "Producto/Servicio: Celular\nDetalle: Compré un celular el 3 de enero y llegó con la pantalla dañada. " +
      "Exijo un reembolso inmediato; si no me responden voy a denunciarlos ante INDECOPI.\n" +
      "Pedido del consumidor: reembolso inmediato\nRespuesta enviada: Aún sin respuesta",
  );
  console.log(JSON.stringify(summary, null, 2));

  console.log("\n--- 7. Public-form autofill ---");
  const extracted = await aiService.extractComplaintFields(
    "El 10 de octubre de 2026 compré una licuadora Oster por S/ 249.90 con boleta B001-12345. " +
      "A los dos días dejó de encender y solicito el cambio por otra igual.",
  );
  console.log(JSON.stringify(extracted, null, 2));

  console.log("\n--- 8. Onboarding kit ---");
  const onboarding = await aiService.generateOnboardingKit({
    description:
      "Somos una cafetería de barrio en Lima. Atendemos con cercanía, respondemos rápido y cuidamos la experiencia del cliente.",
    businessName: "Café Demo",
    businessType: "local_fisico",
  });
  console.log(JSON.stringify(onboarding, null, 2));

  console.log("\n--- 9. Monthly executive report ---");
  const executive = await aiService.generateExecutiveReport({
    periodLabel: "octubre de 2026",
    stats: {
      total: 12,
      open: 3,
      overdue: 1,
      resolved: 8,
      answered: 9,
      slaOnTimeRate: 89,
      averageResponseTime: 3.4,
    },
    previousMonth: { complaints: 9, resolved: 6, overdue: 0 },
    topProducts: [
      { name: "Licuadora Oster", total: 4, overdue: 1 },
      { name: "Delivery", total: 3, overdue: 0 },
    ],
    complaints: [
      "La licuadora dejó de encender a los dos días; el cliente pide el cambio.",
      "El pedido llegó tarde y la comida estaba fría; pide reembolso.",
    ],
  });
  console.log(JSON.stringify(executive, null, 2));

  console.log("\n--- 10. SLA follow-up message ---");
  const followUp = await aiService.generateSlaFollowUp({
    correlativeNumber: "2026-0001",
    productServiceName: "Licuadora Oster",
    daysRemaining: 2,
    status: "in_progress",
    consumerRequest: "cambio del producto",
  });
  console.log(JSON.stringify(followUp, null, 2));

  const ok = [
    classification,
    draft,
    trends,
    assistance,
    clauses,
    summary,
    extracted,
    onboarding,
    executive,
    followUp,
  ].every((result) => result.source === "ai");
  console.log(`\n${ok ? "✓ All AI features verified against the live provider." : "✗ Some features fell back to heuristics - check the errors above."}`);
  process.exit(ok ? 0 : 1);
}

main().catch((error) => {
  console.error("Verification failed:", error);
  process.exit(1);
});
