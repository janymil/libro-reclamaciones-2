import { afterAll, describe, expect, it, vi } from "vitest";

/**
 * The prompt the public draft assistant actually sends, with the model call
 * mocked.
 *
 * This guards the regression the visitor reported: the assistant reviewed the
 * detail textarea on its own, so someone who had already typed the product, the
 * amount, the purchase date and the receipt number in the fields above the
 * textarea was told all of that was missing. The declared fields must reach the
 * prompt, the prompt must forbid reporting them as missing, and a draft with no
 * declared fields must keep the prompt it always had.
 */
const h = vi.hoisted(() => {
  // Set before aiService is imported: the key is read at module load, and it is
  // what makes the service build a client at all.
  const previousApiKey = process.env.AI_API_KEY;
  process.env.AI_API_KEY = "test-key";
  return { create: vi.fn(), previousApiKey };
});

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: h.create } };
  },
}));

const { aiService } = await import("./aiService");

function messagesOfLastCall(): Array<{ role: string; content: string }> {
  const [request] = h.create.mock.calls.at(-1) as [
    { messages: Array<{ role: string; content: string }> },
  ];
  return request.messages;
}

function promptOf(role: string): string {
  return messagesOfLastCall().find((message) => message.role === role)?.content ?? "";
}

afterAll(() => {
  if (h.previousApiKey === undefined) {
    delete process.env.AI_API_KEY;
  } else {
    process.env.AI_API_KEY = h.previousApiKey;
  }
});

describe("assistConsumerDraft prompt", () => {
  it("sends the declared form fields inside their own delimited block", async () => {
    h.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              isComplete: false,
              missingFields: ["el número de serie del equipo"],
              suggestions: [],
              improvedText: null,
            }),
          },
        },
      ],
    });

    const assistance = await aiService.assistConsumerDraft(
      "El televisor comenzó a fallar a los pocos días de uso y sigue con líneas horizontales.",
      {
        productServiceName: "TV Sony 50",
        purchaseAmount: "4850",
        purchaseDate: "2026-10-10",
        receiptNumber: "4565548786654",
      },
    );

    const user = promptOf("user");

    expect(user).toContain("<datos_formulario>");
    expect(user).toContain("</datos_formulario>");
    expect(user).toContain("- Nombre del producto o servicio: TV Sony 50");
    expect(user).toContain("- Monto reclamado (S/): 4850");
    expect(user).toContain("- Fecha de consumo o compra: 2026-10-10");
    expect(user).toContain("- N° de comprobante: 4565548786654");
    expect(user).toContain("no los reporte como faltantes");
    expect(promptOf("system")).toMatch(/Nunca pidas como faltante/);

    expect(assistance.source).toBe("ai");
    expect(assistance.missingFields).toEqual(["el número de serie del equipo"]);
  });

  it("keeps the original prompt when the visitor filled in nothing else", async () => {
    h.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              isComplete: true,
              missingFields: [],
              suggestions: [],
              improvedText: null,
            }),
          },
        },
      ],
    });

    await aiService.assistConsumerDraft("Compré un producto que llegó dañado y pido el reembolso.");

    expect(promptOf("user")).not.toContain("<datos_formulario>");
    expect(promptOf("user")).toContain("<borrador>");
  });

  it("carries no personal data, because the service is never given any", async () => {
    h.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ isComplete: true, missingFields: [], suggestions: [] }),
          },
        },
      ],
    });

    await aiService.assistConsumerDraft("El producto llegó dañado y pido el reembolso.", {
      productServiceName: "TV Sony 50",
    });

    const user = promptOf("user");
    expect(user).not.toMatch(/DNI|documento de identidad|@|celular|teléfono/);
  });

  it("never calls a draft complete while it still lists missing fields", async () => {
    // Observed live: the model answered isComplete=true and, in the same
    // object, listed optional data as missing. The UI then showed "Borrador
    // completo" next to "Falta mencionar: ...".
    h.create.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              isComplete: true,
              missingFields: ["el número de serie del equipo"],
              suggestions: [],
            }),
          },
        },
      ],
    });

    const assistance = await aiService.assistConsumerDraft(
      "Compré una licuadora y dejó de encender a los dos días. Pido el cambio.",
    );

    expect(assistance.missingFields).toEqual(["el número de serie del equipo"]);
    expect(assistance.isComplete).toBe(false);
  });

  it("keeps the declared form fields when the provider call fails", async () => {
    // The catch path used to call the heuristic without the context, so a
    // provider outage made the assistant report the product and the date as
    // missing even though the visitor had already typed them.
    h.create.mockRejectedValueOnce(new Error("provider down"));

    const assistance = await aiService.assistConsumerDraft(
      "El equipo comenzó a fallar a los pocos días y pido la reparación.",
      {
        productServiceName: "TV Sony 50",
        purchaseAmount: "4850",
        purchaseDate: "2026-10-10",
        receiptNumber: "4565548786654",
      },
    );

    expect(assistance.source).toBe("fallback");
    const reported = assistance.missingFields.join(" ");
    expect(reported).not.toMatch(/fecha/i);
    expect(reported).not.toMatch(/producto/i);
  });
});
