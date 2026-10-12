import { describe, expect, it } from "vitest";
import type { Complaint } from "@shared/schema";
import { LEGAL_KNOWLEDGE, searchLegalKnowledge } from "@shared/legal-knowledge";
import { formatCalendarDate } from "@shared/peru-time";
import {
  AGENT_TOOLS,
  agentCapabilities,
  agentService,
  buildDeadlineInfo,
  executeAgentTool,
  type AgentContext,
} from "./agentService";
import { businessDayCalculator } from "./businessDayCalculator";

/**
 * The agent is optional and deterministic where it matters: the normative
 * retrieval, the deadline maths and the tool surface can all be tested without a
 * provider, and without touching the network.
 */
const hasApiKey = Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY);

const context: AgentContext = { businessId: "b1", userId: "u1", userName: "Ana" };

const complaint = (overrides: Partial<Complaint> = {}): Complaint =>
  ({
    id: "c1",
    businessId: "b1",
    establishmentId: "e1",
    correlativeNumber: "2026-0001",
    complaintType: "reclamo",
    consumerFullName: "Juan Pérez",
    consumerDocumentType: "DNI",
    consumerDocumentNumber: "12345678",
    consumerAddress: "Calle 1",
    consumerPhone: "987654321",
    consumerEmail: "juan@example.com",
    productServiceName: "Laptop",
    complaintDetail: "Llegó dañada",
    consumerRequest: "Reembolso",
    status: "new",
    priority: "normal",
    submissionDate: new Date("2026-01-05T15:00:00Z"),
    dueDate: new Date("2026-01-23T15:00:00Z"),
    isOverdue: false,
    consentGiven: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as unknown as Complaint;

describe("legal knowledge base", () => {
  it("finds the 15-business-day response rule", () => {
    const matches = searchLegalKnowledge("¿En cuántos días hábiles debo responder un reclamo?");

    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((match) => match.entry.summary.includes("15 días hábiles"))).toBe(true);
  });

  it("finds the ARCO / data protection rules", () => {
    const matches = searchLegalKnowledge("derechos ARCO y banco de datos personales");

    expect(matches.some((match) => /29733|016-2024/.test(match.entry.norm))).toBe(true);
  });

  it("returns nothing for an unrelated query", () => {
    expect(searchLegalKnowledge("receta de ceviche")).toEqual([]);
  });
});

describe("agent tool surface", () => {
  it("exposes the domain tools the agent depends on", () => {
    const names = AGENT_TOOLS.map((tool) => tool.function.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "buscar_normativa",
        "consultar_reclamos",
        "resumen_caso",
        "calcular_plazo",
        "estado_cumplimiento",
        "estadisticas_reclamos",
      ]),
    );
  });

  it("never lets the model name a tenant", () => {
    for (const tool of AGENT_TOOLS) {
      const properties = (tool.function.parameters as { properties?: Record<string, unknown> })
        .properties ?? {};
      for (const key of Object.keys(properties)) {
        expect(key.toLowerCase()).not.toMatch(/business|empresa|tenant|negocio|ruc/);
      }
    }
  });

  it("advertises optional filter params as nullable for provider compatibility", () => {
    // Groq (and other strict OpenAI-compatible providers) reject a null argument
    // when the schema only allows a string, and models routinely emit null for
    // optional fields. `consultar_reclamos` must therefore allow null explicitly.
    const tool = AGENT_TOOLS.find((entry) => entry.function.name === "consultar_reclamos");
    const properties = (tool?.function.parameters as {
      properties: Record<string, { type: unknown }>;
    }).properties;

    for (const key of ["estado", "tipo", "prioridad", "limite"]) {
      expect(properties[key].type).toContain("null");
    }
  });
});

describe("deadline tool", () => {
  it("formats the stored deadline and delegates the maths to the calculator", () => {
    const atSubmission = buildDeadlineInfo(complaint(), new Date("2026-01-05T15:00:00Z"));

    expect(atSubmission.correlativo).toBe("2026-0001");
    expect(atSubmission.fechaPresentacion).toBe("2026-01-05");
    expect(atSubmission.fechaVencimiento).toBe(formatCalendarDate(new Date("2026-01-23T15:00:00Z")));
    expect(atSubmission.diasHabilesRestantes).toBe(
      businessDayCalculator.getRemainingBusinessDays(
        new Date("2026-01-23T15:00:00Z"),
        new Date("2026-01-05T15:00:00Z"),
      ),
    );
    expect(atSubmission.vencido).toBe(false);
  });

  it("flags a complaint as overdue past its deadline", () => {
    const late = buildDeadlineInfo(complaint(), new Date("2026-02-10T15:00:00Z"));

    expect(late.vencido).toBe(true);
    expect(late.diasHabilesRestantes).toBeLessThanOrEqual(0);
  });
});

describe("executeAgentTool", () => {
  it("grounds buscar_normativa in the local corpus and returns citations", async () => {
    const outcome = await executeAgentTool("buscar_normativa", { consulta: "plazo de respuesta" }, context);

    expect(outcome.toolName).toBe("buscar_normativa");
    expect(outcome.citations && outcome.citations.length).toBeGreaterThan(0);
    const payload = outcome.result as { resultados: unknown[] };
    expect(payload.resultados.length).toBeGreaterThan(0);
  });

  it("reports an error for an unknown tool instead of throwing", async () => {
    const outcome = await executeAgentTool("borrar_todo", {}, context);

    expect(outcome.result).toEqual({ error: expect.stringContaining("desconocida") });
  });
});

describe("agentCapabilities", () => {
  it("reports the tools and the corpus size", () => {
    const capabilities = agentCapabilities();

    expect(capabilities.tools).toHaveLength(AGENT_TOOLS.length);
    expect(capabilities.knowledgeBaseSize).toBe(LEGAL_KNOWLEDGE.length);
  });
});

describe.skipIf(hasApiKey)("agentService without an AI provider key", () => {
  it("answers from the local corpus and tags the reply as fallback", async () => {
    const reply = await agentService.chat(context, [
      { role: "user", content: "¿Cuál es el plazo para responder un reclamo?" },
    ]);

    expect(reply.source).toBe("fallback");
    expect(reply.toolsUsed).toContain("buscar_normativa");
    expect(reply.citations.length).toBeGreaterThan(0);
    expect(reply.reply.length).toBeGreaterThan(0);
  });
});
