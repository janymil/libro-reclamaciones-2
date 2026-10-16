import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

import {
  buildComplaintUrls,
  buildInboundReply,
  buildResponseNotification,
  getWhatsAppConfig,
  isWhatsAppConfigured,
  matchesWhatsAppNumber,
  normalizePeruPhone,
  parseInboundMessages,
  sendTextMessage,
  verifyWebhookChallenge,
  verifyWebhookSignature,
  type WhatsAppConfig,
} from "./whatsappService";

const TEST_CONFIG: WhatsAppConfig = {
  accessToken: "test-token",
  phoneNumberId: "1234567890",
  verifyToken: "verify-me",
  appSecret: "app-secret",
  apiVersion: "v21.0",
  graphBase: "https://graph.facebook.com",
};

const TEXT_MESSAGE_PAYLOAD = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "51999888777", phone_number_id: "1234567890" },
            contacts: [{ profile: { name: "Ana" }, wa_id: "51999888777" }],
            messages: [
              {
                from: "51999888777",
                id: "wamid.ABC",
                timestamp: "1750000000",
                type: "text",
                text: { body: "  Mi pedido no llegó  " },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe("whatsapp config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    delete process.env.WHATSAPP_APP_SECRET;
    delete process.env.WHATSAPP_API_VERSION;
    delete process.env.WHATSAPP_GRAPH_BASE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults the API version and graph base, and trims values", () => {
    const config = getWhatsAppConfig({ WHATSAPP_ACCESS_TOKEN: "  token  ", WHATSAPP_PHONE_NUMBER_ID: " 99 " } as NodeJS.ProcessEnv);

    expect(config.accessToken).toBe("token");
    expect(config.phoneNumberId).toBe("99");
    expect(config.apiVersion).toBe("v21.0");
    expect(config.graphBase).toBe("https://graph.facebook.com");
  });

  it("is only configured with both a token and a sender number", () => {
    expect(isWhatsAppConfigured(getWhatsAppConfig({} as NodeJS.ProcessEnv))).toBe(false);
    expect(isWhatsAppConfigured(getWhatsAppConfig({ WHATSAPP_ACCESS_TOKEN: "t" } as NodeJS.ProcessEnv))).toBe(false);
    expect(isWhatsAppConfigured(TEST_CONFIG)).toBe(true);
  });
});

describe("normalizePeruPhone", () => {
  it("accepts what customers actually type", () => {
    expect(normalizePeruPhone("+51 999 888 777")).toBe("51999888777");
    expect(normalizePeruPhone("999888777")).toBe("51999888777");
    expect(normalizePeruPhone("51999888777")).toBe("51999888777");
    expect(normalizePeruPhone("0051 999 888 777")).toBe("51999888777");
    // Lima: (01) 456-7890 -> the area code `1` is part of the national number.
    expect(normalizePeruPhone("(01) 456-7890")).toBe("5114567890");
  });

  it("rejects values that are not plausible Peruvian numbers", () => {
    expect(normalizePeruPhone(null)).toBeNull();
    expect(normalizePeruPhone("")).toBeNull();
    expect(normalizePeruPhone("---")).toBeNull();
    expect(normalizePeruPhone("12345")).toBeNull();
    expect(normalizePeruPhone("888888888")).toBeNull(); // 9 digits but not a mobile prefix
    expect(normalizePeruPhone("99999999999999")).toBeNull();
  });

  it("matches a stored business number against the sender", () => {
    expect(matchesWhatsAppNumber("+51 999 888 777", "51999888777")).toBe(true);
    expect(matchesWhatsAppNumber("999888777", "51999888000")).toBe(false);
    expect(matchesWhatsAppNumber(null, "51999888777")).toBe(false);
  });
});

describe("webhook verification", () => {
  it("echoes the challenge only for the right mode and token", () => {
    const query = { "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "42" };

    expect(verifyWebhookChallenge(query, TEST_CONFIG)).toBe("42");
    expect(verifyWebhookChallenge({ ...query, "hub.verify_token": "nope" }, TEST_CONFIG)).toBeNull();
    expect(verifyWebhookChallenge({ ...query, "hub.mode": "unsubscribe" }, TEST_CONFIG)).toBeNull();
    expect(verifyWebhookChallenge(query, { ...TEST_CONFIG, verifyToken: "" })).toBeNull();
  });

  it("accepts Meta's HMAC and rejects tampered or unsigned bodies", () => {
    const body = JSON.stringify(TEXT_MESSAGE_PAYLOAD);
    const signature = `sha256=${createHmac("sha256", TEST_CONFIG.appSecret).update(body).digest("hex")}`;

    expect(verifyWebhookSignature(body, signature, TEST_CONFIG.appSecret)).toBe(true);
    expect(verifyWebhookSignature(`${body} `, signature, TEST_CONFIG.appSecret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=deadbeef", TEST_CONFIG.appSecret)).toBe(false);
    expect(verifyWebhookSignature(body, undefined, TEST_CONFIG.appSecret)).toBe(false);
    expect(verifyWebhookSignature(body, signature, "")).toBe(false);
  });
});

describe("parseInboundMessages", () => {
  it("extracts text messages with their metadata", () => {
    const messages = parseInboundMessages(TEXT_MESSAGE_PAYLOAD);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      from: "51999888777",
      profileName: "Ana",
      text: "Mi pedido no llegó",
      messageId: "wamid.ABC",
      phoneNumberId: "1234567890",
      displayPhoneNumber: "51999888777",
    });
  });

  it("ignores status callbacks, media and malformed payloads", () => {
    expect(parseInboundMessages({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] })).toEqual([]);
    expect(parseInboundMessages({ entry: [{ changes: [{ value: { messages: [{ from: "51", type: "image", id: "1" }] } }] }] })).toEqual([]);
    expect(parseInboundMessages(null)).toEqual([]);
    expect(parseInboundMessages("not-json")).toEqual([]);
  });
});

describe("message builders", () => {
  it("builds the public form and tracking URLs from APP_URL", () => {
    const urls = buildComplaintUrls("panaderia-ana", "2026-0007", "https://librodigital.pe/");

    expect(urls.formUrl).toBe("https://librodigital.pe/libro/panaderia-ana");
    expect(urls.consultUrl).toBe("https://librodigital.pe/libro/panaderia-ana?folio=2026-0007");
  });

  it("returns no URLs when APP_URL or the slug is missing", () => {
    expect(buildComplaintUrls("slug", "2026-0001", "")).toEqual({ formUrl: null, consultUrl: null });
    expect(buildComplaintUrls(null, "2026-0001", "https://librodigital.pe")).toEqual({ formUrl: null, consultUrl: null });
  });

  it("points the consumer to the virtual Libro and states the legal deadline", () => {
    const reply = buildInboundReply({
      businessName: "Panadería Ana",
      profileName: "Ana",
      urls: buildComplaintUrls("panaderia-ana", "2026-0007", "https://librodigital.pe"),
    });

    expect(reply).toContain("Hola Ana");
    expect(reply).toContain("Panadería Ana");
    expect(reply).toContain("https://librodigital.pe/libro/panaderia-ana");
    expect(reply).toContain("https://librodigital.pe/libro/panaderia-ana?folio=2026-0007");
    expect(reply).toContain("Anexo 1");
    expect(reply).toContain("15 días hábiles");
  });

  it("never claims a complaint exists, and still works without URLs", () => {
    const reply = buildInboundReply({
      businessName: "Bodega",
      urls: { formUrl: null, consultUrl: null },
    });

    expect(reply).toContain("Hola, gracias");
    expect(reply).toContain("Ingrese al Libro de Reclamaciones virtual");
    expect(reply).not.toContain("null");
  });

  it("states that the written response remains the legal channel", () => {
    const text = buildResponseNotification({
      businessName: "Panadería Ana",
      correlativeNumber: "2026-0007",
      complaintType: "reclamo",
      providerResponse: "  Le   devolvimos el importe.  ",
      consultUrl: "https://librodigital.pe/libro/panaderia-ana?folio=2026-0007",
    });

    expect(text).toContain("Le devolvimos el importe.");
    expect(text).toContain("enviada por escrito");
    expect(text).toContain("canal legal");
  });

  it("truncates a very long response so the message stays deliverable", () => {
    const text = buildResponseNotification({
      businessName: "Bodega",
      correlativeNumber: "2026-0001",
      complaintType: "queja",
      providerResponse: "a".repeat(2000),
    });

    expect(text.length).toBeLessThan(900);
  });
});

describe("sendTextMessage", () => {
  it("does not attempt a request when the WABA is not configured", async () => {
    let called = false;
    const result = await sendTextMessage("999888777", "hola", {
      config: { ...TEST_CONFIG, accessToken: "", phoneNumberId: "" },
      fetchImpl: (async () => { called = true; return new Response("{}"); }) as typeof fetch,
    });

    expect(result).toEqual({ sent: false, skipped: true, error: "whatsapp_not_configured" });
    expect(called).toBe(false);
  });

  it("refuses an implausible phone number instead of guessing", async () => {
    const result = await sendTextMessage("123", "hola", { config: TEST_CONFIG });

    expect(result.sent).toBe(false);
    expect(result.error).toBe("invalid_phone");
  });

  it("posts the normalized recipient and the bearer token to the Cloud API", async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: any, init: any) => {
      captured = { url: String(url), init };
      return new Response(JSON.stringify({ messages: [{ id: "wamid.SENT" }] }), { status: 200 });
    }) as typeof fetch;

    const result = await sendTextMessage("+51 999 888 777", "Su reclamo fue respondido", {
      config: TEST_CONFIG,
      fetchImpl,
    });

    expect(result).toEqual({ sent: true, messageId: "wamid.SENT" });
    expect(captured!.url).toBe("https://graph.facebook.com/v21.0/1234567890/messages");

    const headers = captured!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-token");

    const body = JSON.parse(String(captured!.init.body));
    expect(body.to).toBe("51999888777");
    expect(body.type).toBe("text");
    expect(body.text.body).toBe("Su reclamo fue respondido");
  });

  it("reports a Meta error without throwing", async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({ error: { message: "Invalid token" } }), { status: 401 })) as typeof fetch;

    const result = await sendTextMessage("999888777", "hola", { config: TEST_CONFIG, fetchImpl });

    expect(result.sent).toBe(false);
    expect(result.error).toBe("http_401");
  });

  it("reports a network failure without throwing", async () => {
    const fetchImpl = (async () => { throw new Error("socket hang up"); }) as typeof fetch;

    const result = await sendTextMessage("999888777", "hola", { config: TEST_CONFIG, fetchImpl });

    expect(result).toEqual({ sent: false, error: "network_error" });
  });
});
