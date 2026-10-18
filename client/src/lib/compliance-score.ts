/**
 * Summary of the compliance standards returned by `/api/compliance/report`.
 *
 * Key rule: a standard without data (`not_applicable`) is excluded from BOTH the
 * numerator and the denominator. Counting the 15-day deadline as "met" before the
 * first complaint had arrived is exactly what produced a fake 67% for a brand-new
 * tenant with no reclamos.
 *
 * Kept as a pure function (no hooks, no fetch) so `compliance-score.test.ts` can
 * pin every branch.
 */

export type ComplianceStatus = "compliant" | "pending" | "overdue" | "not_applicable";

export interface ComplianceStandardLike {
  status: ComplianceStatus;
}

export type ComplianceTone = "unknown" | "risk" | "partial" | "ok";

export interface ComplianceSummary {
  /** Standards that apply today (excludes "no data yet"). */
  applicable: number;
  compliant: number;
  pending: number;
  overdue: number;
  notApplicable: number;
  /** compliant / applicable, 0 when nothing applies. */
  ratio: number;
  tone: ComplianceTone;
  message: string;
}

export function summarizeCompliance(
  standards: readonly ComplianceStandardLike[] | null | undefined,
): ComplianceSummary {
  const empty: ComplianceSummary = {
    applicable: 0,
    compliant: 0,
    pending: 0,
    overdue: 0,
    notApplicable: 0,
    ratio: 0,
    tone: "unknown",
    message: "Sin datos suficientes para evaluar tu cumplimiento.",
  };

  if (!standards || standards.length === 0) {
    return empty;
  }

  const count = (status: ComplianceStatus) =>
    standards.filter((standard) => standard.status === status).length;

  const compliant = count("compliant");
  const pending = count("pending");
  const overdue = count("overdue");
  const notApplicable = count("not_applicable");
  const applicable = standards.length - notApplicable;

  if (applicable === 0) {
    return { ...empty, notApplicable };
  }

  const ratio = compliant / applicable;

  const problems: string[] = [];
  if (overdue > 0) {
    problems.push(`${overdue} obligación(es) incumplida(s)`);
  }
  if (pending > 0) {
    problems.push(`${pending} obligación(es) pendiente(s)`);
  }

  if (problems.length > 0) {
    return {
      applicable,
      compliant,
      pending,
      overdue,
      notApplicable,
      ratio,
      tone: overdue > 0 ? "risk" : "partial",
      message: `⚠ ${problems.join(" y ")}: revisa el detalle y cómo corregirlas.`,
    };
  }

  return {
    applicable,
    compliant,
    pending,
    overdue,
    notApplicable,
    ratio,
    tone: "ok",
    message: "✓ Cumplimiento al día en las obligaciones aplicables.",
  };
}
