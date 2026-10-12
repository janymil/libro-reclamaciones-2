import { describe, it, expect } from "vitest";
import { retentionCutoff } from "./retentionService";

describe("retentionService", () => {
  it("computes the cutoff 24 months in the past", () => {
    const now = new Date("2026-06-15T12:00:00Z");
    const cutoff = retentionCutoff(now);

    expect(cutoff.toISOString()).toBe("2024-06-15T12:00:00.000Z");
  });

  it("handles month overflow by clamping to the last day of the target month", () => {
    // May 31 - 3 months would be "Feb 31", which doesn't exist: the cutoff
    // must clamp to Feb 28 (2026 is not a leap year) instead of rolling over
    // to March 3.
    const now = new Date("2026-05-31T00:00:00Z");
    const cutoff = retentionCutoff(now, 3);

    expect(cutoff.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("supports custom windows", () => {
    const now = new Date("2026-01-10T00:00:00Z");
    expect(retentionCutoff(now, 1).toISOString()).toBe("2025-12-10T00:00:00.000Z");
  });
});
