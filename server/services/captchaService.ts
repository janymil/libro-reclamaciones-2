import crypto from "crypto";

import {
  DEFAULT_POW_DIFFICULTY,
  DEFAULT_POW_MAX_NUMBER,
  POW_ALGORITHM,
  clampPowDifficulty,
  clampPowMaxNumber,
  powInput,
  satisfiesPow,
  type PowChallenge,
} from "@shared/pow";

/**
 * Self-hosted CAPTCHA for the public-facing endpoints (Phase 1.5).
 *
 * Deliberately NOT reCAPTCHA: no third-party script, no privacy consent needed
 * for consumers, works offline (local development) and - because the solver
 * runs in the visitor's own browser - no personal data leaves the country.
 *
 * The challenge is a proof of work: the server issues a random salt and a
 * difficulty, the browser searches for the first nonce whose
 * `SHA-256(salt + nonce)` starts with that many hex zeros, and the server
 * re-hashes the submitted nonce. The parameters (plus the expiry and issue
 * time) travel inside an HMAC-signed token, so the server verifies statelessly.
 *
 * Why not the arithmetic question it used to be: the operands shipped in plain
 * text ("¿Cuánto es 7 + 3?"), so a script read the answer straight out of the
 * response and the gate cost a bot nothing. A hash puzzle cannot be parsed -
 * the only way through is to actually spend the CPU - which is what makes an
 * attacker's cost grow with the number of requests.
 *
 * Layered with the honeypot field and the rate limits in
 * middleware/rateLimits.ts, this keeps the public endpoints (complaint intake,
 * public AI assistant, ARCO intake, registration) free of scripted spam without
 * asking a consumer to read a distorted image.
 */

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Minimum time between issuing a challenge and accepting its solution.
 *
 * **Off by default (0), and it should stay that way unless there is a concrete
 * reason to turn it on.** It was written for the consumer portal - where the
 * challenge is handed out when the form renders and filling a complaint takes a
 * minute - but it rejects real submissions as soon as anything fills the form
 * quickly: autofill, a password manager, a keyboard-only visitor flying through
 * the fields, or an automated browser. On a legally mandated complaint form a
 * false rejection is far worse than the spam it prevents, because the spam is
 * already paying for the proof of work, the honeypot and the rate limit.
 *
 * Raise it with `CAPTCHA_MIN_DWELL_MS` (ms) if a specific wave of bot spam is
 * being answered within milliseconds of the challenge being issued; read per call
 * so a change (or a test) needs no module reload.
 */
const DEFAULT_MIN_DWELL_MS = 0;

const SECRET =
  process.env.SESSION_SECRET || "captcha-dev-secret-change-me";

/** Human-facing label rendered next to the verification spinner. */
const CHALLENGE_LABEL = "Verificación de seguridad automática";

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

export interface CaptchaChallenge extends PowChallenge {
  token: string;
  /**
   * Ready-to-render label. Nothing for the visitor to answer: the browser
   * solves the puzzle while the rest of the page is being filled in.
   */
  question: string;
  /** When the challenge was issued (ms epoch); drives the dwell-time rule. */
  issuedAt: number;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

/** Leading hex zeros required right now (`CAPTCHA_POW_DIFFICULTY`). */
export function getPowDifficulty(): number {
  return clampPowDifficulty(process.env.CAPTCHA_POW_DIFFICULTY ?? DEFAULT_POW_DIFFICULTY);
}

function getPowMaxNumber(): number {
  return clampPowMaxNumber(process.env.CAPTCHA_POW_MAX_NUMBER ?? DEFAULT_POW_MAX_NUMBER);
}

/** Minimum dwell time in ms (`CAPTCHA_MIN_DWELL_MS`). */
export function getMinDwellMs(): number {
  const configured = Number(process.env.CAPTCHA_MIN_DWELL_MS);
  if (!Number.isFinite(configured) || configured < 0) {
    return DEFAULT_MIN_DWELL_MS;
  }
  return configured;
}

function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/**
 * Brute-forces the nonce for a challenge. Used by the test suite and by
 * operator smoke checks - never on a request path. Safe to ship because
 * everything it consumes (salt, difficulty, bound) is already public: it saves
 * the caller from re-implementing the search, not an attacker from doing it.
 */
export function solvePowChallengeSync(challenge: PowChallenge): string {
  const { salt, difficulty, maxNumber } = challenge;
  for (let nonce = 0; nonce <= maxNumber; nonce++) {
    if (satisfiesPow(sha256Hex(powInput(salt, nonce)), difficulty)) {
      return String(nonce);
    }
  }
  throw new Error("No se pudo resolver el desafío de prueba de trabajo");
}

/** Issues a fresh proof-of-work challenge the consumer's browser must solve. */
export function issueCaptcha(): CaptchaChallenge {
  const salt = crypto.randomBytes(12).toString("hex");
  const difficulty = getPowDifficulty();
  const maxNumber = getPowMaxNumber();
  const issuedAt = Date.now();
  const expires = issuedAt + CHALLENGE_TTL_MS;

  // The token carries the puzzle + expiry + issue time + a random value,
  // base64url-encoded and HMAC-signed over the *encoded* payload (exactly what
  // verifyCaptcha re-computes). Every field is dot-free (hex, digits, base64url)
  // and base64url never contains a '.', so splitting is unambiguous.
  //
  // The random value is load-bearing: without it two challenges issued in the
  // same millisecond with the same difficulty and expiry would be
  // byte-identical, and consuming one would invalidate the other.
  const random = crypto.randomBytes(9).toString("base64url");
  const payload = `${issuedAt}.${expires}.${difficulty}.${maxNumber}.${salt}.${random}`;
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const token = `${encodedPayload}.${sign(encodedPayload)}`;

  return {
    token,
    question: CHALLENGE_LABEL,
    algorithm: POW_ALGORITHM,
    salt,
    difficulty,
    maxNumber,
    issuedAt,
  };
}

export type CaptchaVerification =
  | { ok: true }
  | { ok: false; reason: string };

export interface VerifyCaptchaOptions {
  /**
   * Minimum time allowed between issuing the challenge and accepting it.
   * Defaults to `CAPTCHA_MIN_DWELL_MS`, which is **0 (off)** - see the note on
   * the default above. A caller that does want the rule can pass a value here,
   * or the deployment can set the variable.
   */
  minDwellMs?: number;
}

interface CaptchaPayload {
  issuedAt: number;
  expires: number;
  difficulty: number;
  maxNumber: number;
  salt: string;
}

/**
 * Decodes and authenticates a token without judging the answer.
 * Returns null for anything this server did not issue.
 */
function readPayload(token: string): CaptchaPayload | null {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  // Constant-time compare of the signature
  const expected = sign(encodedPayload);
  const provided = Buffer.from(signature);
  const reference = Buffer.from(expected);
  if (provided.length !== reference.length || !crypto.timingSafeEqual(provided, reference)) {
    return null;
  }

  const [issuedAtPart, expiresPart, difficultyPart, maxNumberPart, salt] = Buffer.from(
    encodedPayload,
    "base64url"
  )
    .toString("utf8")
    .split(".");

  if (!issuedAtPart || !expiresPart || !difficultyPart || !maxNumberPart || !salt) {
    return null;
  }

  const issuedAt = Number(issuedAtPart);
  const expires = Number(expiresPart);
  const difficulty = Number(difficultyPart);
  const maxNumber = Number(maxNumberPart);

  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expires) ||
    !Number.isInteger(difficulty) ||
    !Number.isInteger(maxNumber)
  ) {
    return null;
  }

  return { issuedAt, expires, difficulty, maxNumber, salt };
}

/**
 * Verifies the browser's solution against a previously issued token.
 *
 * Order matters: the signature is checked before anything else, so a forged
 * token can never influence the checks that follow, and the single-use rule
 * comes before the answer so a consumed challenge always reports "ya fue
 * utilizado" instead of leaking whether a solution was correct.
 */
export function verifyCaptcha(
  token: unknown,
  answer: unknown,
  options: VerifyCaptchaOptions = {}
): CaptchaVerification {
  if (
    typeof token !== "string" ||
    (typeof answer !== "string" && typeof answer !== "number")
  ) {
    return { ok: false, reason: "Captcha requerido" };
  }

  const payload = readPayload(token);
  if (!payload) {
    return { ok: false, reason: "Captcha inválido" };
  }

  // Single-use: a challenge that already produced a record cannot be replayed.
  if (isTokenConsumed(token)) {
    return { ok: false, reason: "Este captcha ya fue utilizado. Resuelva uno nuevo." };
  }

  const now = Date.now();

  if (now > payload.expires) {
    return { ok: false, reason: "El captcha expiró. Intente nuevamente." };
  }

  // Dwell time (off unless `CAPTCHA_MIN_DWELL_MS` / `minDwellMs` asks for it).
  // Even at 0 this rejects a token that claims to have been issued in the
  // future, i.e. a timestamps-disagree-with-this-server case.
  const minDwellMs = options.minDwellMs ?? getMinDwellMs();
  if (now - payload.issuedAt < minDwellMs) {
    return {
      ok: false,
      reason: "La verificación del captcha fue demasiado rápida. Intente nuevamente.",
    };
  }

  const givenAnswer = typeof answer === "number" ? String(answer) : answer.trim();
  if (!/^\d+$/.test(givenAnswer)) {
    return { ok: false, reason: "Respuesta del captcha incorrecta" };
  }

  const nonce = Number(givenAnswer);
  if (!Number.isSafeInteger(nonce) || nonce > payload.maxNumber) {
    return { ok: false, reason: "Respuesta del captcha incorrecta" };
  }

  if (!satisfiesPow(sha256Hex(powInput(payload.salt, nonce)), payload.difficulty)) {
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
