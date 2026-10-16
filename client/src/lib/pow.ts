import {
  POW_ALGORITHM,
  powInput,
  satisfiesPow,
  type PowChallenge,
} from "@shared/pow";

/**
 * Browser-side proof-of-work solver (see `shared/pow.ts` for the contract).
 *
 * The visitor never sees a puzzle: the challenge arrives with the form, this
 * module finds the nonce in the background, and the solution travels with the
 * request. That is what keeps the publicly mandated complaint form usable for
 * anyone - no image to read, no text to type, nothing that a screen reader or a
 * keyboard-only visitor cannot do.
 *
 * Solving is a loop of `crypto.subtle.digest` calls, which the browser runs on a
 * native worker thread, so the page stays responsive while it works.
 */

/** What `GET /api/public/captcha` returns. */
export interface CaptchaChallenge extends PowChallenge {
  token: string;
  question: string;
  issuedAt: number;
}

/** A solved challenge, ready to be attached to a request. */
export interface SolvedCaptcha {
  token: string;
  solution: string;
}

export const POW_UNSUPPORTED_MESSAGE =
  "Su navegador no puede completar la verificación de seguridad. Actualícelo o use Chrome, Edge, Firefox o Safari recientes.";

const HEX_DIGITS = "0123456789abcdef";

/**
 * How many hashes are resolved concurrently. Small enough to stay responsive,
 * large enough to hide the per-call overhead of `await` (a purely sequential
 * loop is several times slower than the hashing itself).
 */
const BATCH_SIZE = 250;

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += HEX_DIGITS[bytes[i] >> 4] + HEX_DIGITS[bytes[i] & 0x0f];
  }
  return out;
}

async function digestHex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  return toHex(await crypto.subtle.digest(POW_ALGORITHM, bytes));
}

/** True when this browser can solve the puzzle at all. */
export function isPowSupported(): boolean {
  return typeof crypto !== "undefined" && Boolean(crypto.subtle);
}

/**
 * Finds the first nonce whose digest meets the challenge's difficulty.
 *
 * Throws with a visitor-facing message when the browser cannot hash, when the
 * caller aborts, or when the whole search space was exhausted (which means the
 * challenge was tampered with - the server never issues one without a solution).
 */
export async function solvePowChallenge(
  challenge: PowChallenge,
  signal?: AbortSignal
): Promise<string> {
  if (!isPowSupported()) {
    throw new Error(POW_UNSUPPORTED_MESSAGE);
  }

  const { salt, difficulty, maxNumber } = challenge;

  for (let start = 0; start <= maxNumber; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE - 1, maxNumber);

    const candidates: Array<Promise<string | null>> = [];
    for (let nonce = start; nonce <= end; nonce++) {
      candidates.push(
        digestHex(powInput(salt, nonce)).then((digest) =>
          satisfiesPow(digest, difficulty) ? String(nonce) : null
        )
      );
    }

    const results = await Promise.all(candidates);
    const hit = results.find((candidate) => candidate !== null);
    if (hit !== undefined && hit !== null) {
      return hit;
    }

    if (signal?.aborted) {
      throw new Error("Verificación cancelada");
    }
  }

  throw new Error("No se pudo completar la verificación de seguridad. Intente nuevamente.");
}

/** Requests a fresh challenge from the server. */
export async function fetchCaptchaChallenge(): Promise<CaptchaChallenge> {
  const response = await fetch("/api/public/captcha", { credentials: "include" });

  if (!response.ok) {
    throw new Error("No se pudo cargar la verificación de seguridad. Intente nuevamente.");
  }

  return (await response.json()) as CaptchaChallenge;
}

/**
 * Convenience for callers that need a solved challenge on demand (the public AI
 * assistant button, the registration submit): fetch it and solve it.
 *
 * Nothing waits for the visitor here - the puzzle is solved inside the same
 * interaction. (The server's dwell-time rule is off by default for exactly this
 * reason; it exists only as an opt-in defence against a specific spam wave.)
 */
export async function requestSolvedCaptcha(signal?: AbortSignal): Promise<SolvedCaptcha> {
  const challenge = await fetchCaptchaChallenge();
  const solution = await solvePowChallenge(challenge, signal);

  return { token: challenge.token, solution };
}
