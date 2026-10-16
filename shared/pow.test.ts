import { describe, it, expect } from "vitest";

import {
  DEFAULT_POW_MAX_NUMBER,
  DEFAULT_POW_DIFFICULTY,
  MAX_POW_DIFFICULTY,
  MIN_POW_DIFFICULTY,
  clampPowDifficulty,
  clampPowMaxNumber,
  powInput,
  powTarget,
  satisfiesPow,
} from "./pow";

/**
 * The rules in this module are the contract between the browser solver and the
 * server verifier: if they ever disagree, every solution is rejected.
 */
describe("pow contract", () => {
  it("clamps the difficulty into a usable range", () => {
    expect(clampPowDifficulty(undefined)).toBe(DEFAULT_POW_DIFFICULTY);
    expect(clampPowDifficulty("not a number")).toBe(DEFAULT_POW_DIFFICULTY);
    expect(clampPowDifficulty(0)).toBe(MIN_POW_DIFFICULTY);
    expect(clampPowDifficulty(-5)).toBe(MIN_POW_DIFFICULTY);
    expect(clampPowDifficulty(99)).toBe(MAX_POW_DIFFICULTY);
    expect(clampPowDifficulty("3")).toBe(3);
    expect(clampPowDifficulty(3.9)).toBe(3);
  });

  it("falls back to a sane search-space bound", () => {
    expect(clampPowMaxNumber(undefined)).toBe(DEFAULT_POW_MAX_NUMBER);
    expect(clampPowMaxNumber(0)).toBe(DEFAULT_POW_MAX_NUMBER);
    expect(clampPowMaxNumber("oops")).toBe(DEFAULT_POW_MAX_NUMBER);
    expect(clampPowMaxNumber(1000)).toBe(1000);
  });

  it("builds the hashed input from the salt and the nonce only", () => {
    expect(powInput("abc", 42)).toBe("abc42");
    expect(powInput("abc", 0)).toBe("abc0");
  });

  it("requires exactly `difficulty` leading hex zeros", () => {
    const target = powTarget(4);
    expect(target).toBe("0000");

    expect(satisfiesPow("0000deadbeef", 4)).toBe(true);
    expect(satisfiesPow("0000deadbeef", 5)).toBe(false);
    expect(satisfiesPow("000deadbeef", 4)).toBe(false);
    expect(satisfiesPow("abc0000deadbeef", 4)).toBe(false);
  });

  it("never accepts a solution when the difficulty is out of range", () => {
    expect(satisfiesPow("0000000000", 0)).toBe(false);
    expect(satisfiesPow("", 4)).toBe(false);
  });
});
