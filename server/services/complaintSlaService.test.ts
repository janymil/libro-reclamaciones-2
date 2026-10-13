import { describe, it, expect } from "vitest";

import { summarizeSla, averageResponseBusinessDays } from "./complaintSlaService";

/**
 * Complaint-handling compliance (DS 101-2022-PCM: 15 business days).
 *
 * Regression coverage for the two false "100%" readings this service replaced:
 *   - "nothing answered yet" was reported as fully compliant, and
 *   - the reports page showed a paperwork-checklist figure labelled
 *     "DS 011-2011-PCM conforme" while every complaint was overdue.
 */

const NOW = new Date("2026-03-20T12:00:00Z");
const PAST_DUE = new Date("2026-03-10T12:00:00Z"); // before NOW
const FUTURE_DUE = new Date("2026-04-10T12:00:00Z"); // after NOW

function complaint(overrides: Record<string, unknown> = {}) {
  return {
    submissionDate: new Date("2026-02-01T12:00:00Z"),
    responseDate: null as Date | null,
    dueDate: PAST_DUE as Date | null,
    isOverdue: false,
    ...overrides,
  };
}

describe("summarizeSla", () => {
  it("reports 0% (not 100%) when every complaint is past due and unanswered", () => {
    const summary = summarizeSla([complaint(), complaint(), complaint(), complaint()], NOW);

    expect(summary.total).toBe(4);
    expect(summary.answered).toBe(0);
    expect(summary.answeredOnTime).toBe(0);
    expect(summary.overdue).toBe(4);
    expect(summary.onTimeRate).toBe(0);
    // Nothing answered => the "of what was answered" rate has no meaning.
    expect(summary.answeredOnTimeRate).toBeNull();
  });

  it("does not count complaints that are still inside the deadline as overdue", () => {
    const summary = summarizeSla([complaint({ dueDate: FUTURE_DUE })], NOW);

    expect(summary.overdue).toBe(0);
    expect(summary.onTimeRate).toBe(0); // nothing answered out of 1 => 0%
  });

  it("reports 100% only when everything was answered on time", () => {
    const summary = summarizeSla(
      [
        complaint({ responseDate: new Date("2026-03-01T12:00:00Z") }),
        complaint({ responseDate: new Date("2026-03-09T12:00:00Z") }),
      ],
      NOW,
    );

    expect(summary.answeredOnTime).toBe(2);
    expect(summary.answeredLate).toBe(0);
    expect(summary.overdue).toBe(0);
    expect(summary.onTimeRate).toBe(100);
  });

  it("treats a response on the due date as on time (boundary)", () => {
    const summary = summarizeSla([complaint({ responseDate: PAST_DUE })], NOW);

    expect(summary.answeredOnTime).toBe(1);
    expect(summary.onTimeRate).toBe(100);
  });

  it("counts a late response as non-compliant", () => {
    const summary = summarizeSla(
      [complaint({ responseDate: new Date("2026-03-15T12:00:00Z") })],
      NOW,
    );

    expect(summary.answeredLate).toBe(1);
    expect(summary.answeredOnTime).toBe(0);
    expect(summary.onTimeRate).toBe(0);
    expect(summary.overdue).toBe(0); // it was answered, just late
  });

  it("mirrors the reported scenario: 4 complaints, 1 answered on time, 3 overdue", () => {
    const summary = summarizeSla(
      [
        complaint({ responseDate: new Date("2026-03-05T12:00:00Z") }),
        complaint(),
        complaint(),
        complaint(),
      ],
      NOW,
    );

    expect(summary.total).toBe(4);
    expect(summary.answered).toBe(1);
    expect(summary.answeredOnTime).toBe(1);
    expect(summary.overdue).toBe(3);
    expect(summary.onTimeRate).toBe(25);
    expect(summary.answeredOnTimeRate).toBe(100);
  });

  it("respects the stored isOverdue flag when the date is not yet past", () => {
    const summary = summarizeSla([complaint({ dueDate: FUTURE_DUE, isOverdue: true })], NOW);
    expect(summary.overdue).toBe(1);
  });

  it("returns null (sin datos) instead of 100% when there are no complaints", () => {
    const summary = summarizeSla([], NOW);

    expect(summary.total).toBe(0);
    expect(summary.onTimeRate).toBeNull();
    expect(summary.answeredOnTimeRate).toBeNull();
  });

  it("treats a response without a due date as compliant rather than crashing", () => {
    const summary = summarizeSla([complaint({ dueDate: null, responseDate: new Date() })], NOW);

    expect(summary.answered).toBe(1);
    expect(summary.answeredOnTime).toBe(1);
  });
});

describe("averageResponseBusinessDays", () => {
  it("is 0 when nothing has been answered", () => {
    expect(averageResponseBusinessDays([complaint(), complaint()])).toBe(0);
  });

  it("averages only answered complaints, in business days", () => {
    const average = averageResponseBusinessDays([
      { submissionDate: new Date("2026-03-02T12:00:00Z"), responseDate: new Date("2026-03-04T12:00:00Z") },
      { submissionDate: new Date("2026-03-02T12:00:00Z"), responseDate: new Date("2026-03-10T12:00:00Z") },
      { submissionDate: new Date("2026-03-02T12:00:00Z"), responseDate: null },
    ]);

    expect(average).toBeGreaterThan(0);
    expect(Number.isFinite(average)).toBe(true);
  });
});