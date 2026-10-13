import { describe, it, expect } from "vitest";

import { documentMatches } from "./attachmentService";

/**
 * The public evidence upload is authorized by the consumer's document number,
 * compared in constant time so the endpoint cannot be used as a timing oracle
 * while brute-forcing the number.
 */
describe("documentMatches - upload knowledge check", () => {
  it("accepts the exact document number", () => {
    expect(documentMatches("12345678", "12345678")).toBe(true);
  });

  it("tolerates surrounding whitespace from the form", () => {
    expect(documentMatches("  12345678  ", "12345678")).toBe(true);
  });

  it("rejects a different number, including same-length ones", () => {
    expect(documentMatches("12345679", "12345678")).toBe(false);
    expect(documentMatches("87654321", "12345678")).toBe(false);
  });

  it("rejects different lengths without throwing", () => {
    expect(documentMatches("1234567", "12345678")).toBe(false);
    expect(documentMatches("123456789", "12345678")).toBe(false);
  });

  it("rejects missing, empty or non-string input", () => {
    expect(documentMatches(undefined, "12345678")).toBe(false);
    expect(documentMatches(null, "12345678")).toBe(false);
    expect(documentMatches("", "12345678")).toBe(false);
    expect(documentMatches("   ", "12345678")).toBe(false);
    expect(documentMatches(12345678 as unknown, "12345678")).toBe(false);
    expect(documentMatches({ toString: () => "12345678" }, "12345678")).toBe(false);
  });

  it("rejects anything when the stored value is empty", () => {
    expect(documentMatches("12345678", "")).toBe(false);
  });
});