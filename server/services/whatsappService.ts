import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WhatsApp Cloud API (Meta) integration.
 *
 * Scope, deliberately narrow:
 *   - **inbound**: a consumer writes to the business's WhatsApp Business number;
 *     we ACK, tell the consumer how to register the reclamo properly (the Libro
 *     virtual, which is the legally valid record) and notify staff in-app;
 *   - **outbound**: a *notification* of a response the business already gave in
 *     writing (email/letter). The written response stays the legal one - per the
 *     Código art. 152 / DS 011-2011-PCM corpus in `shared/legal-knowledge.ts`,
 *     WhatsApp alone does not replace it.
 *
 * A WhatsApp message is therefore never turned into a Libro record by itself:
 * Anexo 1 requires fields (name, DNI, address, email...) that a chat message
 * does not carry, and inventing them would produce an invalid legal document.
 *
 * Everything degrades when the environment is not configured (same philosophy
 * as `emailService`): calls log and report `sent: false` instead of throwing,
 * so the rest of the app keeps working without a WABA.
 */

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  verifyToken: string;
  /** Meta app secret, used to verify the `X-Hub-Signature-256` header. */
  appSecret: string;
  apiVersion: string;
  graphBase: string;
}

export function getWhatsAppConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig {
  return {
    accessToken: env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "",
    verifyToken: env.WHATSAPP_VERIFY_TOKEN?.trim() ?? "",
    appSecret: env.WHATSAPP_APP_SECRET?.trim() ?? "",
    apiVersion: env.WHATSAPP_API_VERSION?.trim() || "v21.0",
    graphBase: (env.WHATSAPP_GRAPH_BASE?.trim() || "https://graph.facebook.com").replace(/\/+$/, ""),
  };
}

/** Whether the platform can send messages at all (token + sender number). */
export function isWhatsAppConfigured(config: WhatsAppConfig = getWhatsAppConfig()): boolean {
  return Boolean(config.accessToken && config.phoneNumberId);
}

/** Constant-time comparison, so token/signature checks do not leak timing. */
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Normalizes a Peruvian number to the digits-only E.164 form Meta expects.
 *
 * Accepts what customers actually type: `+51 999 888 777`, `999888777`,
 * `(01) 456-7890`, `0051...`. Returns null for anything that is not a
 * plausible Peruvian mobile (9 digits starting with 9) or fixed line
 * (7-8 digits) - sending to a guessed number would leak the complaint.
 */
export function normalizePeruPhone(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  let national = digits;
  if (national.startsWith("00")) {
    national = national.slice(2); // international access prefix (0051...)
  }
  if (national.startsWith("51") && national.length === 11) {
    national = national.slice(2); // already country-prefixed
  }
  while (national.startsWith("0")) {
    national = national.slice(1); // national trunk prefix (01 for Lima)
  }

  if (national.length === 9 && national.startsWith("9")) {
    return `51${national}`;
  }
  if (national.length >= 7 && national.length <= 8) {
    return `51${national}`;
  }
  return null;
}

/** True when a stored `libro_configuration.whatsapp_number` is this sender. */
export function matchesWhatsAppNumber(
  storedNumber: string | null | undefined,
  candidate: string | null | undefined,
): boolean {
  const stored = normalizePeruPhone(storedNumber);
  const incoming = normalizePeruPhone(candidate);
  return Boolean(stored && incoming && stored === incoming);
}

/**
 * Verifies Meta's webhook subscription handshake.
 * Returns the challenge to echo, or null when the request must be rejected.
 */
export function verifyWebhookChallenge(
  query: Record<string, unknown>,
  config: WhatsAppConfig = getWhatsAppConfig(),
): string | null {
  const mode = typeof query["hub.mode"] === "string" ? query["hub.mode"] : "";
  const token = typeof query["hub.verify_token"] === "string" ? query["hub.verify_token"] : "";
  const challenge = typeof query["hub.challenge"] === "string" ? query["hub.challenge"] : "";

  if (!config.verifyToken || mode !== "subscribe" || !token || !safeEqual(token, config.verifyToken)) {
    return null;
  }
  return challenge;
}

/**
 * Verifies the `X-Hub-Signature-256` HMAC over the raw request body.
 *
 * The raw body is required (re-serializing parsed JSON changes the bytes), so
 * `server/index.ts` stores it on `req.rawBody`. Returns false when the secret or
 * the header is missing: callers only skip this check when no secret is set.
 */
export function verifyWebhookSignature(
  rawBody: Buffer | string | undefined,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!appSecret || !signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const provided = signatureHeader.slice("sha256=".length).trim();
  const expected = createHmac("sha256", appSecret)
    .update(rawBody ?? "")
    .digest("hex");

  return safeEqual(provided, expected);
}


export interface InboundWhatsAppMessage {
  /** Sender, as Meta sends it: digits only (e.g. `51999888777`). */
  from: string;
  /** WhatsApp profile name, when the contact shares one. Unverified. */
  profileName: string | null;
  text: string;
  messageId: string;
  /** Unix seconds as a string, as sent by Meta. */
  timestamp: string | null;
  phoneNumberId: string | null;
  /** The business number that received the message (`51...`). */
  displayPhoneNumber: string | null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Flattens Meta's webhook envelope into text messages.
 *
 * Only `type: "text"` is actionable: media would need a separate download call
 * plus a Libro attachment, and status callbacks (sent/delivered/read) are not
 * consumer input. Unknown shapes are ignored rather than thrown on, because a
 * webhook that 500s gets retried by Meta for hours.
 */
export function parseInboundMessages(payload: unknown): InboundWhatsAppMessage[] {
  const messages: InboundWhatsAppMessage[] = [];

  const entries = (payload as { entry?: unknown } | null)?.entry;
  if (!Array.isArray(entries)) {
    return messages;
  }

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) {
      continue;
    }

    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      if (!value) {
        continue;
      }

      const metadata = (value.metadata ?? {}) as Record<string, unknown>;
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      const firstContact = (contacts[0] ?? {}) as Record<string, unknown>;
      const profile = (firstContact.profile ?? {}) as Record<string, unknown>;
      const inbound = Array.isArray(value.messages) ? value.messages : [];

      for (const message of inbound) {
        const typed = message as Record<string, unknown>;
        const text = ((typed.text ?? {}) as Record<string, unknown>).body;
        const from = asString(typed.from);

        if (typed.type !== "text" || typeof text !== "string" || !from || !text.trim()) {
          continue;
        }

        messages.push({
          from,
          profileName: asString(profile.name),
          text: text.trim(),
          messageId: asString(typed.id) ?? "",
          timestamp: asString(typed.timestamp),
          phoneNumberId: asString(metadata.phone_number_id),
          displayPhoneNumber: asString(metadata.display_phone_number),
        });
      }
    }
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Message builders (pure: unit tested without touching the network)
// ---------------------------------------------------------------------------

export interface ComplaintUrls {
  /** Public Libro form, where the consumer registers the reclamo. */
  formUrl: string | null;
  /** Public status page with the folio pre-filled, when available. */
  consultUrl: string | null;
}

export function buildComplaintUrls(
  slug: string | null | undefined,
  correlativeNumber?: string | null,
  appUrl: string = process.env.APP_URL ?? "",
): ComplaintUrls {
  const origin = appUrl.replace(/\/+$/, "");
  if (!origin || !slug) {
    return { formUrl: null, consultUrl: null };
  }

  return {
    formUrl: `${origin}/libro/${slug}`,
    consultUrl: correlativeNumber
      ? `${origin}/libro/${slug}?folio=${encodeURIComponent(correlativeNumber)}`
      : null,
  };
}

export interface InboundReplyInput {
  businessName: string;
  profileName?: string | null;
  urls: ComplaintUrls;
}

/**
 * Reply to any inbound consumer message.
 *
 * It intentionally asks the consumer to complete the Libro form instead of
 * converting the chat into a reclamo: Anexo 1 requires name, document, address,
 * phone, email and detail, and a WhatsApp message usually carries only a phone
 * number. The reply also states the legal deadline, so the consumer knows what
 * to expect.
 */
export function buildInboundReply({ businessName, profileName, urls }: InboundReplyInput): string {
  const greeting = profileName ? `Hola ${profileName}, ` : "Hola, ";
  const lines = [
    `${greeting}gracias por escribir a ${businessName}.`,
    "",
    "Para registrar un reclamo o queja en el Libro de Reclamaciones necesitamos los datos obligatorios del Anexo 1 (nombre, documento, domicilio, teléfono, correo y detalle del caso).",
  ];

  if (urls.formUrl) {
    lines.push("", `Regístrelo aquí en menos de 2 minutos: ${urls.formUrl}`);
  } else {
    lines.push("", "Ingrese al Libro de Reclamaciones virtual de la empresa para registrar su caso.");
  }

  if (urls.consultUrl) {
    lines.push("", `Si ya registró su reclamo, puede ver el estado aquí: ${urls.consultUrl}`);
  }

  lines.push(
    "",
    "Registrado el reclamo, la empresa tiene 15 días hábiles improrrogables para responderle por escrito (Ley N.° 31435).",
  );

  return lines.join("\n");
}

export interface ResponseNotificationInput {
  businessName: string;
  correlativeNumber: string;
  complaintType: string;
  providerResponse: string;
  consultUrl?: string | null;
}

/**
 * Text for the outbound "your complaint was answered" notification.
 *
 * It summarises the response and links to the public status page; the response
 * itself is the one already sent in writing, which the system keeps as the
 * legal evidence (email delivery + timestamp).
 */
export function buildResponseNotification({
  businessName,
  correlativeNumber,
  complaintType,
  providerResponse,
  consultUrl,
}: ResponseNotificationInput): string {
  const summary = providerResponse.trim().replace(/\s+/g, " ").slice(0, 600);
  const lines = [
    `${businessName} respondió su ${complaintType} ${correlativeNumber}:`,
    "",
    summary,
    "",
    "Esta respuesta también fue enviada por escrito (correo o carta), que es el canal legal.",
  ];

  if (consultUrl) {
    lines.push("", `Detalle y estado: ${consultUrl}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Outbound sending
// ---------------------------------------------------------------------------

export interface SendMessageResult {
  sent: boolean;
  messageId?: string;
  /** Machine-readable failure reason, safe to log. */
  error?: string;
  /** True when the environment has no WABA configured (nothing was attempted). */
  skipped?: boolean;
}

export interface SendOptions {
  config?: WhatsAppConfig;
  fetchImpl?: typeof fetch;
}

/**
 * Sends a plain text message through the Cloud API.
 *
 * Never throws: WhatsApp is a convenience channel, so a Meta outage must not
 * break the complaint workflow. Failures are returned and logged without the
 * message body (it contains consumer PII).
 */
export async function sendTextMessage(
  to: string | null | undefined,
  body: string,
  options: SendOptions = {},
): Promise<SendMessageResult> {
  const config = options.config ?? getWhatsAppConfig();
  const doFetch = options.fetchImpl ?? fetch;

  if (!isWhatsAppConfigured(config)) {
    console.warn('[whatsapp] not configured - message not sent (set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID)');
    return { sent: false, skipped: true, error: "whatsapp_not_configured" };
  }

  const recipient = normalizePeruPhone(to);
  if (!recipient) {
    return { sent: false, error: "invalid_phone" };
  }

  try {
    const response = await doFetch(
      `${config.graphBase}/${config.apiVersion}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.accessToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "text",
          text: { preview_url: true, body },
        }),
      },
    );

    const payload = await response.json().catch(() => null) as
      | { messages?: Array<{ id?: string }>; error?: { message?: string } }
      | null;

    if (!response.ok) {
      const reason = payload?.error?.message ?? `http_${response.status}`;
      console.error(`[whatsapp] send failed (${response.status}): ${reason}`);
      return { sent: false, error: `http_${response.status}` };
    }

    return { sent: true, messageId: payload?.messages?.[0]?.id };
  } catch (error) {
    console.error('[whatsapp] send error:', (error as Error).message);
    return { sent: false, error: "network_error" };
  }
}



