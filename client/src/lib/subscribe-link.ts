import { isPlanId, type PlanId } from "@shared/plans";
import { isPlanPeriod, type PlanPeriod } from "@shared/payments";
import { PAYMENT_RESUME_PATH } from "@shared/payment-recovery";

/**
 * The shareable subscription link - and why it has to be ours.
 *
 * A payment link that anyone can open (for example a plan link created in the
 * Mercado Pago panel) carries no information about the customer: Mercado Pago
 * creates the subscription and can only tell us the payer's Mercado Pago e-mail,
 * which is not necessarily the company's. Automating activation from that is
 * guesswork, and guesswork about WHO PAID is exactly what we cannot afford.
 *
 * This link inverts the order. It can still be shared in WhatsApp, an e-mail or an
 * ad, but the customer is identified FIRST (log in, or sign up in one step) and
 * only then sent to the provider. The subscription is created by our server, bound
 * to that company, so activation needs no guessing at all.
 *
 * Replacement for the `mpago.la/...` links when selling outside the app.
 */

export const SUBSCRIBE_PATH = PAYMENT_RESUME_PATH;

export interface SubscribeTarget {
  plan: PlanId;
  period: PlanPeriod;
}

/** Path to share, e.g. `/suscribir?plan=profesional&periodo=anual`. */
export function buildSubscribePath(plan: string, period: PlanPeriod): string {
  return `${SUBSCRIBE_PATH}?plan=${encodeURIComponent(plan)}&periodo=${encodeURIComponent(period)}`;
}

/** Absolute, ready-to-paste link for a site origin. */
export function buildSubscribeUrl(origin: string, plan: string, period: PlanPeriod): string {
  return `${origin.replace(/\/+$/, "")}${buildSubscribePath(plan, period)}`;
}

/**
 * Normalises whatever the caller has into query parameters.
 *
 * A bare query (`plan=...`), a search string (`?plan=...`) and a full path or URL
 * (`/suscribir?plan=...`) are all accepted. Being strict here would mean telling a
 * customer "this link is not valid" for a perfectly good link, which is a much
 * worse failure than being forgiving.
 */
function toParams(search: string | URLSearchParams): URLSearchParams {
  if (typeof search !== "string") {
    return search;
  }

  const queryStart = search.indexOf("?");
  return new URLSearchParams(queryStart >= 0 ? search.slice(queryStart + 1) : search);
}

/**
 * Validates the query of the subscribe page.
 *
 * Anything unrecognised returns `null` instead of a half-valid target, so the page
 * can say "this link is not valid" rather than showing the wrong plan or price.
 */
export function parseSubscribeQuery(search: string | URLSearchParams): SubscribeTarget | null {
  const params = toParams(search);

  const plan = params.get("plan") ?? "";
  // `periodo` is the Spanish spelling we generate; `period` is accepted too so a
  // hand-written link still works.
  const period = params.get("periodo") ?? params.get("period") ?? "monthly";

  if (!isPlanId(plan) || !isPlanPeriod(period)) {
    return null;
  }

  return { plan, period };
}

/**
 * Guards a `next` parameter before navigating to it.
 *
 * Only same-site absolute paths survive. Without this, a crafted link such as
 * `/acceso?next=https://sitio-malicioso.example` would turn our own login page
 * into an open redirect - the classic phishing helper, with our domain on it.
 */
export function safeInternalPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/")) {
    return null;
  }
  // `//host` and `/\host` are protocol-relative and leave the site.
  if (value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value;
}
