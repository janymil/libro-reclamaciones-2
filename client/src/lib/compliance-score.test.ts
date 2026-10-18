import { describe, expect, it } from "vitest";

import { summarizeCompliance, type ComplianceStandardLike } from "./compliance-score";

/**
 * The compliance summary on /panel and /cumplimiento.
 *
 * Regression this pins: the card used to show "67%" for a brand-new business
 * with zero complaints, because the 15-day deadline was counted as "compliant"
 * (nothing could be late). A standard with no data must be excluded, not scored.
 */

const standard = (status: ComplianceStandardLike["status"]): ComplianceStandardLike => ({ status });

describe("summarizeCompliance", () => {
  it("says 'sin datos' when there is no report", () => {
    const summary = summarizeCompliance(null);

    expect(summary.tone).toBe("unknown");
    expect(summary.applicable).toBe(0);
    expect(summary.message).not.toMatch(/Riesgo|incumplida/i);
  });

  it("excludes the deadline from the score while there are no complaints", () => {
    // DS 011 compliant, deadline "no data", Ley 29733 pending.
    const summary = summarizeCompliance([
      standard("compliant"),
      standard("not_applicable"),
      standard("pending"),
    ]);

    expect(summary.applicable).toBe(2); // NOT 3
    expect(summary.compliant).toBe(1);
    expect(summary.notApplicable).toBe(1);
    expect(summary.ratio).toBe(0.5);
    expect(summary.tone).toBe("partial");
    expect(summary.message).toContain("1 obligación(es) pendiente(s)");
  });

  it("does not reward an all-'no data' report with 100%", () => {
    const summary = summarizeCompliance([standard("not_applicable")]);

    expect(summary.applicable).toBe(0);
    expect(summary.ratio).toBe(0);
    expect(summary.tone).toBe("unknown");
  });

  it("reports full compliance only when every applicable standard is met", () => {
    const summary = summarizeCompliance([
      standard("compliant"),
      standard("compliant"),
      standard("not_applicable"),
    ]);

    expect(summary.applicable).toBe(2);
    expect(summary.compliant).toBe(2);
    expect(summary.ratio).toBe(1);
    expect(summary.tone).toBe("ok");
  });

  it("mentions the breach and the pending items together", () => {
    const summary = summarizeCompliance([
      standard("overdue"),
      standard("pending"),
      standard("not_applicable"),
    ]);

    expect(summary.tone).toBe("risk");
    expect(summary.overdue).toBe(1);
    expect(summary.message).toContain("1 obligación(es) incumplida(s)");
    expect(summary.message).toContain("1 obligación(es) pendiente(s)");
  });
});
