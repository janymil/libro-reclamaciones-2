import { describe, it, expect, beforeEach } from "vitest";

import {
  issueCaptcha,
  verifyCaptcha,
  consumeCaptchaToken,
  resetConsumedCaptchaTokens,
  isHoneypotTriggered,
} from "./captchaService";

/**
 * Single-use CAPTCHA (F13 residual): a challenge that produced a complaint must
 * not be replayable inside its 10-minute window.
 */
describe("CAPTCHA single-use enforcement", () => {
  beforeEach(() => {
    resetConsumedCaptchaTokens();
  });

  /** Recovers the numeric answer from the challenge text ("¿Cuánto es a + b?"). */
  function solve(question: string): string {
    const match = question.match(/(\d+)\s*\+\s*(\d+)/);
    if (!match) throw new Error(`unexpected challenge: ${question}`);
    return String(Number(match[1]) + Number(match[2]));
  }

  it("accepts a challenge before it is consumed", () => {
    const challenge = issueCaptcha();
    const result = verifyCaptcha(challenge.token, solve(challenge.question));
    expect(result.ok).toBe(true);
  });

  it("rejects the same challenge once it has been consumed", () => {
    const challenge = issueCaptcha();
    const answer = solve(challenge.question);

    expect(verifyCaptcha(challenge.token, answer).ok).toBe(true);
    consumeCaptchaToken(challenge.token);

    const replay = verifyCaptcha(challenge.token, answer);
    expect(replay.ok).toBe(false);
    if (!replay.ok) {
      expect(replay.reason).toMatch(/ya fue utilizado/i);
    }
  });

  it("blocks unlimited replay that the previous stateless design allowed", () => {
    const challenge = issueCaptcha();
    const answer = solve(challenge.question);
    consumeCaptchaToken(challenge.token);

    for (let i = 0; i < 5; i++) {
      expect(verifyCaptcha(challenge.token, answer).ok).toBe(false);
    }
  });

  it("does not affect other outstanding challenges", () => {
    const first = issueCaptcha();
    const second = issueCaptcha();

    consumeCaptchaToken(first.token);

    expect(verifyCaptcha(second.token, solve(second.question)).ok).toBe(true);
  });

  it("still rejects a tampered token after consumption", () => {
    const challenge = issueCaptcha();
    consumeCaptchaToken(challenge.token);
    expect(verifyCaptcha(`${challenge.token}x`, solve(challenge.question)).ok).toBe(false);
  });
});

describe("honeypot", () => {
  it("only triggers on a non-empty hidden field", () => {
    expect(isHoneypotTriggered({ website: "" })).toBe(false);
    expect(isHoneypotTriggered({})).toBe(false);
    expect(isHoneypotTriggered({ website: "http://spam" })).toBe(true);
  });
});