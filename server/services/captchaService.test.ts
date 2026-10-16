import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

import { POW_ALGORITHM, powInput, satisfiesPow } from "@shared/pow";

import {
  issueCaptcha,
  verifyCaptcha,
  isHoneypotTriggered,
  solvePowChallengeSync,
  resetConsumedCaptchaTokens,
} from "./captchaService";

/**
 * The suite solves challenges exactly like the browser does, so `verifyCaptcha`
 * must not reject the result for arriving "too fast": the dwell-time rule is
 * exercised explicitly below, with the configured value under the test's
 * control.
 */
process.env.CAPTCHA_MIN_DWELL_MS = "0";

function digest(nonce: number, salt: string): string {
  return crypto.createHash("sha256").update(powInput(salt, nonce)).digest("hex");
}

/** A nonce that provably does NOT satisfy the challenge's difficulty. */
function wrongNonce(challenge: { salt: string; difficulty: number }): string {
  for (let nonce = 0; nonce < 50; nonce++) {
    if (!satisfiesPow(digest(nonce, challenge.salt), challenge.difficulty)) {
      return String(nonce);
    }
  }
  throw new Error("no unsuitable nonce found in the sample");
}

describe("captchaService (proof of work)", () => {
  beforeEach(() => {
    resetConsumedCaptchaTokens();
    process.env.CAPTCHA_MIN_DWELL_MS = "0";
  });

  afterEach(() => {
    delete process.env.CAPTCHA_POW_DIFFICULTY;
  });

  it("issues a challenge that a solver can satisfy", () => {
    const challenge = issueCaptcha();
    const solution = solvePowChallengeSync(challenge);

    expect(challenge.algorithm).toBe(POW_ALGORITHM);
    expect(challenge.salt).toMatch(/^[0-9a-f]+$/);
    expect(verifyCaptcha(challenge.token, solution).ok).toBe(true);
  });

  it("issues a puzzle, never an answer", () => {
    const challenge = issueCaptcha();

    // Nothing to parse out of the response: the human label carries no operands
    // and the payload is only what a solver needs in order to do the work.
    expect(challenge.question).not.toMatch(/\d/);
    expect(Object.keys(challenge).sort()).toEqual([
      "algorithm",
      "difficulty",
      "issuedAt",
      "maxNumber",
      "question",
      "salt",
      "token",
    ]);
    expect(challenge).not.toHaveProperty("answer");
  });

  it("accepts numeric solutions", () => {
    const challenge = issueCaptcha();
    const solution = Number(solvePowChallengeSync(challenge));

    expect(verifyCaptcha(challenge.token, solution).ok).toBe(true);
  });

  it("rejects a hash that does not meet the difficulty", () => {
    const challenge = issueCaptcha();
    const result = verifyCaptcha(challenge.token, wrongNonce(challenge));

    expect(result.ok).toBe(false);
  });

  it("rejects a solution that does not satisfy the puzzle", () => {
    const challenge = issueCaptcha();

    // With four required leading zeros, 99.99% of guesses are wrong, so this is
    // a meaningful negative case without depending on the specific salt.
    expect(verifyCaptcha(challenge.token, "999999").ok).toBe(false);
  });

  it("rejects a nonce above the declared bound", () => {
    const challenge = issueCaptcha();
    const beyond = String(challenge.maxNumber + 1);

    expect(verifyCaptcha(challenge.token, beyond).ok).toBe(false);
  });

  it("rejects a solution found for a different challenge", () => {
    const first = issueCaptcha();
    const second = issueCaptcha();

    // Same answer string, different salt: a solution is bound to its puzzle.
    expect(verifyCaptcha(second.token, solvePowChallengeSync(first)).ok).toBe(false);
  });

  it("rejects tampered tokens", () => {
    const challenge = issueCaptcha();
    const [payload] = challenge.token.split(".");
    const forged = `${payload}.RmluZ2VyLXByaW50aW5nLWlzLW5vdC1hLXNpZ25hdHVyZQ`;

    expect(verifyCaptcha(forged, solvePowChallengeSync(challenge)).ok).toBe(false);
  });


  it("rejects non-numeric answers", () => {
    const challenge = issueCaptcha();

    expect(verifyCaptcha(challenge.token, "cuarenta y dos").ok).toBe(false);
    expect(verifyCaptcha(challenge.token, "-1").ok).toBe(false);
    expect(verifyCaptcha(challenge.token, "12.5").ok).toBe(false);
  });

  it("rejects missing values", () => {
    expect(verifyCaptcha(undefined, "5").ok).toBe(false);
    expect(verifyCaptcha("token", undefined).ok).toBe(false);
  });

  it("honours the configured difficulty", () => {
    process.env.CAPTCHA_POW_DIFFICULTY = "2";
    const easy = issueCaptcha();
    expect(easy.difficulty).toBe(2);
    expect(satisfiesPow(digest(Number(solvePowChallengeSync(easy)), easy.salt), 2)).toBe(true);

    // Out-of-range values are clamped rather than honoured: difficulty 0 would
    // make the puzzle free, and 6 would lock out low-end phones.
    process.env.CAPTCHA_POW_DIFFICULTY = "0";
    expect(issueCaptcha().difficulty).toBe(1);

    process.env.CAPTCHA_POW_DIFFICULTY = "99";
    expect(issueCaptcha().difficulty).toBe(6);
  });

  it("accepts an immediate submission by default (no dwell floor)", () => {
    // Regression: the floor used to be 1500 ms, which rejected real submissions
    // whenever the form was filled quickly - autofill, a password manager, or the
    // Playwright run that caught it. See the note on DEFAULT_MIN_DWELL_MS.
    delete process.env.CAPTCHA_MIN_DWELL_MS;

    const challenge = issueCaptcha();
    const immediate = verifyCaptcha(challenge.token, solvePowChallengeSync(challenge));

    expect(immediate.ok).toBe(true);

    process.env.CAPTCHA_MIN_DWELL_MS = "0";
  });

  it("rejects a submission that arrives before the minimum dwell time", () => {
    const challenge = issueCaptcha();
    const solution = solvePowChallengeSync(challenge);

    process.env.CAPTCHA_MIN_DWELL_MS = "60000";
    const tooFast = verifyCaptcha(challenge.token, solution);

    expect(tooFast.ok).toBe(false);
    if (!tooFast.ok) {
      expect(tooFast.reason).toMatch(/demasiado rápida/i);
    }
  });

  it("accepts an immediate submission when the caller solves on demand", () => {
    const challenge = issueCaptcha();
    const solution = solvePowChallengeSync(challenge);

    process.env.CAPTCHA_MIN_DWELL_MS = "60000";

    // Buttons and programmatic clients fetch and solve inside the same
    // interaction, so they opt out explicitly instead of being rejected.
    expect(verifyCaptcha(challenge.token, solution, { minDwellMs: 0 }).ok).toBe(true);
  });

  it("detects honeypot submissions", () => {
    expect(isHoneypotTriggered({ website: "" })).toBe(false);
    expect(isHoneypotTriggered({})).toBe(false);
    expect(isHoneypotTriggered({ website: "http://spam.example" })).toBe(true);
  });
});
