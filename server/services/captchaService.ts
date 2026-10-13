import crypto from "crypto";

/**
 * Self-hosted CAPTCHA for the public complaint form (Phase 1.5).
 *
 * Deliberately NOT reCAPTCHA: no third-party script, no privacy consent
 * needed for consumers, and it works offline (local development). The
 * challenge is a small math question whose answer is embedded in an
 * HMAC-signed, expiring token, so the server can verify the response
 * statelessly. Combined with the honeypot field and the existing rate
 * limits this blocks scripted spam without punishing real consumers.
 */

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const SECRET =
  process.env.SESSION_SECRET || "captcha-dev-secret-change-me";

/**
 * Single-use tracking for issued challenges.
 *
 * The token is stateless (HMAC over answer + expiry), so without this a bot
 * could solve one challenge and replay the same token for its entire 10-minute
 * window. Consumed tokens are remembered until shortly after their own expiry,
 * then dropped.
 *
 * Limitation (documented, not hidden): the store is per-process in memory. On
 * a horizontally scaled deployment each instance keeps its own set, so a token
 * solved against instance A could still be replayed once on instance B. The
 * per-IP rate limit on the intake endpoint remains the backstop; moving this to
 * a shared store (Postgres/Redis) is the next step if the app scales out.
 */
const USED_TOKEN_TTL_MS = CHALLENGE_TTL_MS + 60 * 1000;
const MAX_TRACKED_TOKENS = 10_000;
const usedTokens = new Map<string, number>();

function sweepUsedTokens(now: number): void {
  for (const [token, expiresAt] of usedTokens) {
    if (expiresAt <= now) {
      usedTokens.delete(token);
    }
  }
}

/** Marks a challenge as consumed so it can never be replayed. */
export function consumeCaptchaToken(token: unknown): void {
  if (typeof token !== "string" || token.length === 0) {
    return;
  }

  const now = Date.now();
  sweepUsedTokens(now);

  // Bound the memory footprint: if the map is still full of live entries,
  // evict the oldest ones (insertion order is preserved by Map).
  while (usedTokens.size >= MAX_TRACKED_TOKENS) {
    const oldest = usedTokens.keys().next();
    if (oldest.done) break;
    usedTokens.delete(oldest.value);
  }

  usedTokens.set(token, now + USED_TOKEN_TTL_MS);
}

function isTokenConsumed(token: string): boolean {
  const expiresAt = usedTokens.get(token);
  if (expiresAt === undefined) {
    return false;
  }
  if (expiresAt <= Date.now()) {
    usedTokens.delete(token);
    return false;
  }
  return true;
}

/** Test-only helper: clears the single-use registry. */
export function resetConsumedCaptchaTokens(): void {
  usedTokens.clear();
}

export interface CaptchaChallenge {
  token: string;
  question: string;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** Issues a fresh math challenge the consumer must answer. */
export function issueCaptcha(): CaptchaChallenge {
  const a = 2 + Math.floor(Math.random() * 8); // 2..9
  const b = 1 + Math.floor(Math.random() * 8); // 1..8
  const answer = a + b;
  const expires = Date.now() + CHALLENGE_TTL_MS;

  // The token carries the answer + expiry + a random nonce, base64url-encoded and
  // HMAC-signed over the *encoded* payload (exactly what verifyCaptcha
  // re-computes). base64url never contains a '.', so splitting is unambiguous.
  //
  // The nonce is load-bearing: without it the token is a pure function of
  // (answer, expiry), so two challenges issued in the same millisecond with the
  // same sum are byte-identical and consuming one would invalidate the other.
  const nonce = crypto.randomBytes(9).toString("base64url");
  const encodedPayload = Buffer.from(`${answer}.${expires}.${nonce}`).toString("base64url");
  const token = `${encodedPayload}.${sign(encodedPayload)}`;

  return {
    token,
    question: `¿Cuánto es ${a} + ${b}?`,
  };
}

export type CaptchaVerification =
  | { ok: true }
  | { ok: false; reason: string };

/** Verifies the consumer's answer against a previously issued token. */
export function verifyCaptcha(token: unknown, answer: unknown): CaptchaVerification {
  if (typeof token !== "string" || typeof answer !== "string" && typeof answer !== "number") {
    return { ok: false, reason: "Captcha requerido" };
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return { ok: false, reason: "Captcha inválido" };
  }

  // Constant-time compare of the signature
  const expected = sign(encodedPayload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "Captcha inválido" };
  }

  // Single-use: a challenge that already produced a complaint cannot be
  // replayed for another one.
  if (isTokenConsumed(token)) {
    return { ok: false, reason: "Este captcha ya fue utilizado. Resuelva uno nuevo." };
  }

  const payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  const [answerPart, expiresPart] = payload.split(".");
  const expires = Number(expiresPart);

  if (!Number.isFinite(expires) || Date.now() > expires) {
    return { ok: false, reason: "El captcha expiró. Intente nuevamente." };
  }

  const expectedAnswer = Number(answerPart);
  const givenAnswer = Number(answer);
  if (!Number.isFinite(givenAnswer) || givenAnswer !== expectedAnswer) {
    return { ok: false, reason: "Respuesta del captcha incorrecta" };
  }

  return { ok: true };
}

/**
 * Honeypot check: the public form renders a hidden "website" input that real
 * users never fill. Anything non-empty means a bot copied the field names.
 */
export function isHoneypotTriggered(body: Record<string, unknown>): boolean {
  const value = body.website;
  return typeof value === "string" && value.trim().length > 0;
}
