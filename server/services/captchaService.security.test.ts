import { describe, it, expect, beforeEach } from "vitest";
import crypto from "crypto";

import { POW_ALGORITHM, satisfiesPow, powInput } from "@shared/pow";
import { solvePowChallenge } from "@/lib/pow";

import {
  issueCaptcha,
  verifyCaptcha,
  consumeCaptchaToken,
  resetConsumedCaptchaTokens,
  isHoneypotTriggered,
  solvePowChallengeSync,
} from "./captchaService";

/**
 * Single-use proof-of-work CAPTCHA (F13 residual): a challenge that produced a
 * record must not be replayable inside its 10-minute window - which is exactly
 * the loophole that let one solved puzzle drive unlimited submissions.
 */
process.env.CAPTCHA_MIN_DWELL_MS = "0";

describe("CAPTCHA single-use enforcement", () => {
  beforeEach(() => {
    resetConsumedCaptchaTokens();
    process.env.CAPTCHA_MIN_DWELL_MS = "0";
  });

  /** Solves the puzzle the way the browser does. */
  function solve(challenge: ReturnType<typeof issueCaptcha>): string {
    return solvePowChallengeSync(challenge);
  }

  it("accepts a challenge before it is consumed", () => {
    const challenge = issueCaptcha();
    const result = verifyCaptcha(challenge.token, solve(challenge));

    expect(result.ok).toBe(true);
  });

  it("rejects the same challenge once it has been consumed", () => {
    const challenge = issueCaptcha();
    const answer = solve(challenge);

    expect(verifyCaptcha(challenge.token, answer).ok).toBe(true);
    consumeCaptchaToken(challenge.token);

    const replay = verifyCaptcha(challenge.token, answer);
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.reason).toMatch(/ya fue utilizado/i);
    }
  });

  it("blocks unlimited replay that a stateless design would allow", () => {
    const challenge = issueCaptcha();
    const answer = solve(challenge);
    consumeCaptchaToken(challenge.token);

    for (let i = 0; i < 5; i++) {
      expect(verifyCaptcha(challenge.token, answer).ok).toBe(false);
    }
  });

  it("does not affect other outstanding challenges", () => {
    const first = issueCaptcha();
    const second = issueCaptcha();

    consumeCaptchaToken(first.token);

    expect(verifyCaptcha(second.token, solve(second)).ok).toBe(true);
  });

  it("issues a distinct token for every challenge", () => {
    // Regression: the token used to be a pure function of its parameters, so
    // two challenges issued in the same millisecond were byte-identical and
    // consuming one silently invalidated the other.
    const tokens = new Set<string>();
    for (let i = 0; i < 500; i++) {
      tokens.add(issueCaptcha().token);
    }
    expect(tokens.size).toBe(500);
  });

  it("issues a distinct puzzle for every challenge", () => {
    const salts = new Set<string>();
    for (let i = 0; i < 200; i++) {
      salts.add(issueCaptcha().salt);
    }
    expect(salts.size).toBe(200);
  });

  it("still rejects a tampered token after consumption", () => {
    const challenge = issueCaptcha();
    consumeCaptchaToken(challenge.token);

    expect(verifyCaptcha(`${challenge.token}x`, solve(challenge)).ok).toBe(false);
  });
});

describe("honeypot", () => {
  it("only triggers on a non-empty hidden field", () => {
    expect(isHoneypotTriggered({ website: "" })).toBe(false);
    expect(isHoneypotTriggered({})).toBe(false);
    expect(isHoneypotTriggered({ website: "http://spam" })).toBe(true);
  });
});

/**
 * Interop between the two halves of the contract.
 *
 * The browser solver and the server verifier live in different runtimes and hash
 * independently, so a mismatch in the hashed input, the digest encoding or the
 * difficulty rule would silently reject every real visitor while the unit tests
 * of either side kept passing. This drives the actual browser implementation
 * against a challenge the server issued.
 */
describe("browser solver interop", () => {
  it("solves a server-issued challenge inside the deadline", async () => {
    const challenge = issueCaptcha();
    const solution = await solvePowChallenge(challenge);

    expect(verifyCaptcha(challenge.token, solution, { minDwellMs: 0 }).ok).toBe(true);
  });

  it("produces a digest the shared difficulty rule accepts", async () => {
    const salt = crypto.randomBytes(12).toString("hex");
    const difficulty = 3;
    const solution = await solvePowChallenge({
      algorithm: POW_ALGORITHM,
      salt,
      difficulty,
      maxNumber: 200_000,
    });

    const digest = crypto
      .createHash("sha256")
      .update(powInput(salt, Number(solution)))
      .digest("hex");

    expect(satisfiesPow(digest, difficulty)).toBe(true);
  });

  it("cannot be talked out of doing the work", () => {
    // A caller that never finds a solution must fail rather than return an
    // arbitrary nonce: the search space is bounded by the challenge.
    const impossible = { salt: "abc", difficulty: 6, maxNumber: 0 };
    expect(satisfiesPow(
      crypto.createHash("sha256").update(powInput(impossible.salt, 0)).digest("hex"),
      impossible.difficulty
    )).toBe(false);
  });
});
