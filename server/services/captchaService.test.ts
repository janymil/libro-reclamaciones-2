import { describe, it, expect } from "vitest";
import {
  issueCaptcha,
  verifyCaptcha,
  isHoneypotTriggered,
} from "./captchaService";

describe("captchaService", () => {
  it("issues a solvable math challenge", () => {
    const challenge = issueCaptcha();

    expect(challenge.token).toBeTruthy();
    const match = challenge.question.match(/¿Cuánto es (\d+) \+ (\d+)\?/);
    expect(match).not.toBeNull();

    const answer = Number(match![1]) + Number(match![2]);
    expect(verifyCaptcha(challenge.token, String(answer)).ok).toBe(true);
  });

  it("accepts numeric answers", () => {
    const challenge = issueCaptcha();
    const match = challenge.question.match(/(\d+) \+ (\d+)/)!;
    expect(verifyCaptcha(challenge.token, Number(match[1]) + Number(match[2])).ok).toBe(true);
  });

  it("rejects a wrong answer", () => {
    const challenge = issueCaptcha();
    const result = verifyCaptcha(challenge.token, "999");
    expect(result.ok).toBe(false);
  });

  it("rejects tampered tokens", () => {
    const challenge = issueCaptcha();
    const [payload] = challenge.token.split(".");
    const forged = `${payload}.RmluZ2VyLXByaW50aW5nLWlzLW5vdC1hLXNpZ25hdHVyZQ`;
    expect(verifyCaptcha(forged, "5").ok).toBe(false);
  });

  it("rejects a forged payload with a re-computed but bogus answer", () => {
    const challenge = issueCaptcha();
    const match = challenge.question.match(/(\d+) \+ (\d+)/)!;
    const rightAnswer = Number(match[1]) + Number(match[2]);
    // Right signature, wrong answer
    expect(verifyCaptcha(challenge.token, rightAnswer + 1).ok).toBe(false);
  });

  it("rejects missing values", () => {
    expect(verifyCaptcha(undefined, "5").ok).toBe(false);
    expect(verifyCaptcha("token", undefined).ok).toBe(false);
  });

  it("detects honeypot submissions", () => {
    expect(isHoneypotTriggered({ website: "" })).toBe(false);
    expect(isHoneypotTriggered({})).toBe(false);
    expect(isHoneypotTriggered({ website: "http://spam.example" })).toBe(true);
  });
});
