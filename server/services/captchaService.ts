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

  // The token carries the answer + expiry base64url-encoded, HMAC-signed over
  // the *encoded* payload (exactly what verifyCaptcha re-computes). base64url
  // never contains a '.', so splitting the token is unambiguous.
  const encodedPayload = Buffer.from(`${answer}.${expires}`).toString("base64url");
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
