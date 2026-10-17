/**
 * The identity a consumer-facing email must carry.
 *
 * A consumer files a complaint with a BUSINESS (Cencosud, Wong, ...), never with
 * the platform that hosts the book. The confirmation and the provider's reply
 * must therefore arrive with the business's own name, logo and contact data, and
 * a reply must travel back to the business - not to the platform's inbox.
 *
 * This module is pure: the caller passes the `business` row, the
 * `libro_configuration` row and the platform's SMTP policy, so the same rules
 * run in the test suite and in production. Nothing here talks to the database,
 * to `process.env` or to nodemailer.
 */

import type { Business, LibroConfiguration } from "./schema";

/**
 * What the platform's mail host allows us to send as.
 *
 * Every provider (Zoho included) only accepts a From address on a domain whose
 * SPF/DKIM records the sending account controls: `billing@cencosud.pe` cannot be
 * used just because a customer typed it. A business that wants its own address
 * as the sender therefore needs the platform to verify its domain first, which
 * is what `verifiedDomains` records.
 */
export interface SenderPolicy {
  /** Address that signs platform-generated email (SMTP_FROM_EMAIL || SMTP_USER). */
  platformFromAddress: string | null | undefined;
  /** Display name used when the tenant has none (SMTP_FROM_NAME). */
  platformFromName: string;
  /** Domains the platform is allowed to send as. */
  verifiedDomains: string[];
}

export type SenderStatus =
  /** Sending as the platform address, with the business as the display name. */
  | "platform"
  /** Sending as the business's own address on a verified domain. */
  | "custom"
  /** A custom address was configured but its domain is not verified yet. */
  | "pending_verification"
  /** A custom address was configured but is not a valid address. */
  | "invalid";

export interface BusinessEmailIdentity {
  /** Display name the consumer sees ("Cencosud"). */
  fromName: string;
  /** Address the message is sent from (verified business address or platform's). */
  fromAddress: string;
  senderStatus: SenderStatus;
  /** Address a reply must go to (the business inbox), when known. */
  replyTo: string | null;
  /** Business name used in the subject and the header. */
  businessName: string;
  /** Absolute logo URL, or null when the business has none (or no base URL). */
  logoUrl: string | null;
  /** Validated hex brand colour, or null. */
  brandColor: string | null;
  /** Business contact block, one line per entry (empty entries removed). */
  contactLines: string[];
}

/**
 * Deliberately strict: an address that reaches a header is a mail-header
 * injection vector if it carries spaces, commas, CR/LF or angle brackets, so
 * only a conservative shape is accepted.
 */
const EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Whether a value can safely be used as an email address. */
export function isEmailAddress(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && EMAIL_PATTERN.test(value.trim());
}

/** Domain part of an address, lower-cased (`""` when there is none). */
export function emailDomain(address: string): string {
  const at = address.lastIndexOf("@");
  return at === -1 ? "" : address.slice(at + 1).trim().toLowerCase();
}

/** Parses `SMTP_ALLOWED_SENDER_DOMAINS` ("a.pe, b.pe") into normalized domains. */
export function parseVerifiedDomains(raw: string | null | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

/**
 * Normalizes a display name.
 *
 * CR/LF are collapsed because a name typed into a form ends up in a mail header:
 * `"Cencosud\r\nBcc: ..."` must never become a second header.
 */
export function sanitizeDisplayName(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return clean.length > 0 ? clean.slice(0, 120) : null;
}

/** Trims a value, or null when it is empty after trimming. */
function clean(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** A valid, trimmed address, or null. */
function sanitizeEmail(value: string | null | undefined): string | null {
  const trimmed = clean(value);
  return trimmed && isEmailAddress(trimmed) ? trimmed : null;
}

/** Absolute URL for a stored path, or null when it cannot be built. */
export function toAbsoluteUrl(
  value: string | null | undefined,
  baseUrl: string | null | undefined,
): string | null {
  const raw = clean(value);
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  const base = clean(baseUrl)?.replace(/\/+$/, '');
  if (!base || !/^https?:\/\//i.test(base)) return null;
  return `${base}${raw.startsWith('/') ? '' : '/'}${raw}`;
}


/**
 * The business's own contact block for the email footer.
 *
 * `notificationEmail` is intentionally NOT printed: the public portal does not
 * publish the internal inbox either. It is still used as the Reply-To, so the
 * consumer can always answer; only an address the business published on purpose
 * (`emailReplyTo`) is shown.
 */
export function businessContactLines(
  business: Pick<
    Business,
    'businessName' | 'commercialName' | 'ruc' | 'address' | 'distrito' | 'provincia' | 'departamento' | 'phone' | 'website'
  >,
  config?: Pick<LibroConfiguration, 'websiteUrl' | 'whatsappNumber' | 'emailReplyTo'> | null,
): string[] {
  const lines: string[] = [];

  const tradeName = clean(business.commercialName);
  const legalName = clean(business.businessName);
  const title =
    tradeName && legalName && tradeName !== legalName
      ? `${tradeName} · ${legalName}`
      : tradeName ?? legalName;

  if (title) {
    lines.push(business.ruc ? `${title} - RUC ${business.ruc}` : title);
  }

  const place = [
    clean(business.address),
    clean(business.distrito),
    clean(business.provincia),
    clean(business.departamento),
  ].filter(Boolean) as string[];
  if (place.length > 0) {
    lines.push(place.join(', '));
  }

  const contact = [
    clean(business.phone) ?? clean(config?.whatsappNumber),
    sanitizeEmail(config?.emailReplyTo),
    clean(config?.websiteUrl) ?? clean(business.website),
  ].filter(Boolean) as string[];
  if (contact.length > 0) {
    lines.push(contact.join(' · '));
  }

  return lines;
}


/**
 * Builds the identity of a consumer-facing email for one business.
 *
 * Falls back one field at a time, so a business that has configured nothing at
 * all still gets its own name on the message instead of the platform's.
 */
export function buildBusinessEmailIdentity(params: {
  business: Business;
  config?: LibroConfiguration | null;
  sender: SenderPolicy;
  /** Public origin of the app (APP_URL), needed for an absolute logo URL. */
  baseUrl?: string | null;
}): BusinessEmailIdentity {
  const { business, sender } = params;
  const config = params.config ?? null;

  const fromName =
    sanitizeDisplayName(config?.emailFromName) ??
    sanitizeDisplayName(business.commercialName) ??
    sanitizeDisplayName(business.businessName) ??
    sanitizeDisplayName(sender.platformFromName) ??
    'Libro de Reclamaciones';

  const businessName =
    clean(business.commercialName) ?? clean(business.businessName) ?? fromName;

  const platformAddress = sanitizeEmail(sender.platformFromAddress) ?? '';

  // A custom sender is only honored when its domain is one the platform may
  // send as; otherwise the message would be rejected or rewritten by the host.
  const requested = clean(config?.emailFromAddress);
  let senderStatus: SenderStatus = 'platform';
  let fromAddress = platformAddress;

  if (requested) {
    if (!isEmailAddress(requested)) {
      senderStatus = 'invalid';
    } else if (sender.verifiedDomains.includes(emailDomain(requested))) {
      senderStatus = 'custom';
      fromAddress = requested.trim();
    } else {
      senderStatus = 'pending_verification';
    }
  }

  const brandColor = clean(config?.brandColor);

  return {
    fromName,
    fromAddress,
    senderStatus,
    replyTo: sanitizeEmail(config?.emailReplyTo) ?? sanitizeEmail(config?.notificationEmail),
    businessName,
    logoUrl: toAbsoluteUrl(config?.logoUrl, params.baseUrl),
    brandColor: brandColor && HEX_COLOR_PATTERN.test(brandColor) ? brandColor : null,
    contactLines: businessContactLines(business, config),
  };
}
