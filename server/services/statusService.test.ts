import { describe, expect, it } from "vitest";

import {
  computeOverallStatus,
  readAppVersion,
  toJobHealth,
  type JobSnapshot,
} from "./statusService";

const job = (overrides: Partial<JobSnapshot> = {}): JobSnapshot => ({
  lastRun: new Date("2026-10-18T03:29:46.961Z"),
  lastResult: "0 anonimizada(s), 0 adjunto(s) purgado(s)",
  ...overrides,
});

const components = (
  overrides: Partial<Record<"database" | "ai" | "email", { status: "operational" | "degraded" | "down" | "disabled" | "pending" }>> = {},
) => ({
  database: { status: "operational" as const, ...overrides.database },
  ai: { status: "operational" as const, ...overrides.ai },
  email: { status: "operational" as const, ...overrides.email },
});

describe("toJobHealth", () => {
  it("is pending before the first pass after boot", () => {
    expect(toJobHealth({ lastRun: null, lastResult: null })).toEqual({
      status: "pending",
      lastRun: null,
      lastResult: null,
    });
  });

  it("is operational after a successful pass and keeps the result text", () => {
    const result = toJobHealth(job());
    expect(result.status).toBe("operational");
    expect(result.lastRun).toBe("2026-10-18T03:29:46.961Z");
    expect(result.lastResult).toContain("anonimizada");
  });

  it("is degraded when the last pass recorded an error", () => {
    expect(toJobHealth(job({ lastResult: "error: connection refused" })).status).toBe("degraded");
  });
});

describe("computeOverallStatus", () => {
  it("is operational when every probe is fine", () => {
    expect(computeOverallStatus(components(), [toJobHealth(job())])).toBe("operational");
  });

  it("is down when the database probe fails", () => {
    expect(computeOverallStatus(components({ database: { status: "down" } }), [])).toBe("down");
  });

  it("is degraded when AI cannot be reached", () => {
    expect(computeOverallStatus(components({ ai: { status: "degraded" } }), [])).toBe("degraded");
  });

  it("is degraded when email cannot authenticate", () => {
    expect(computeOverallStatus(components({ email: { status: "degraded" } }), [])).toBe("degraded");
  });

  it("does not count disabled components as a failure", () => {
    expect(
      computeOverallStatus(
        components({ ai: { status: "disabled" }, email: { status: "disabled" } }),
        [],
      ),
    ).toBe("operational");
  });

  it("is degraded when a scheduled job failed", () => {
    expect(
      computeOverallStatus(components(), [toJobHealth(job({ lastResult: "error: boom" }))]),
    ).toBe("degraded");
  });

  it("does not treat a pending job as a failure", () => {
    expect(
      computeOverallStatus(components(), [toJobHealth({ lastRun: null, lastResult: null })]),
    ).toBe("operational");
  });
});

describe("readAppVersion", () => {
  it("reads the version from package.json", () => {
    expect(readAppVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
