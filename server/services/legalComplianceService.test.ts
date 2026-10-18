import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Compliance derived from REAL data.
 *
 * Regressions pinned here:
 *  - reading the never-written `compliance_tracking` table reported every
 *    business as 0% "riesgo de incumplimiento";
 *  - counting the 15-day deadline as "met" before the first complaint showed a
 *    brand-new tenant as 67% compliant.
 */

interface FakeComplaint {
  submissionDate: Date;
  responseDate: Date | null;
}

const state: {
  establishments: Array<{ id: string }>;
  books: Array<{ establishmentId: string }>;
  complaints: FakeComplaint[];
  activities: Array<{ id: string }>;
  tracking: Array<{
    complianceType: string;
    status: string;
    dueDate: Date | null;
    notes?: string | null;
    completedDate?: Date | null;
  }>;
} = {
  establishments: [],
  books: [],
  complaints: [],
  activities: [],
  tracking: [],
};

vi.mock("../storage", () => ({
  storage: {
    getEstablishmentsByBusiness: async () => state.establishments,
    getBooks: async () => state.books,
    getComplaintsByBusiness: async () => state.complaints,
    getDataProcessingActivities: async () => state.activities,
    getComplianceTracking: async () => state.tracking,
    getBusiness: async () => ({ businessName: "Demo SAC" }),
  },
}));

const { legalComplianceService } = await import("./legalComplianceService");

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const standard = (report: Awaited<ReturnType<typeof legalComplianceService.buildComplianceReport>>, id: string) => {
  const found = report.standards.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`standard ${id} missing`);
  }
  return found;
};

beforeEach(() => {
  state.establishments = [{ id: "loc-1" }];
  state.books = [{ establishmentId: "loc-1" }];
  state.complaints = [];
  state.activities = [];
  state.tracking = [];
});

describe("legalComplianceService.buildComplianceReport", () => {
  it("does not score the deadline standard while there are no complaints", async () => {
    const report = await legalComplianceService.buildComplianceReport("business-1");

    expect(standard(report, "ds_011").status).toBe("compliant");
    // "Sin datos" is NOT "compliant": this is the fake-67% regression.
    expect(standard(report, "ds_101").status).toBe("not_applicable");
    expect(standard(report, "ds_101").detail).toContain("Aún no hay reclamos");
    expect(standard(report, "ds_101").action).toBeNull();
    expect(standard(report, "ley_29733").status).toBe("pending");
    // The State inscription is a separate duty and starts as unknown/pending.
    expect(standard(report, "rnpd").status).toBe("pending");
    expect(standard(report, "rnpd").external?.href).toContain("gob.pe");

    expect(report.applicableStandards).toBe(3);
    expect(report.compliantStandards).toBe(1);
    expect(report.nextActions).toEqual([
      "Confírmalo en un clic: la plataforma ya conoce los datos que recoge tu Libro, no tienes que escribirlos.",
      "La inscripción la presenta tu empresa en el SIPDP: es gratuita y de aprobación automática. Al terminar obtienes la constancia y el código del banco de datos.",
    ]);
  });

  it("explains a missed deadline and how to fix it", async () => {
    state.complaints = [{ submissionDate: daysAgo(60), responseDate: null }];

    const report = await legalComplianceService.buildComplianceReport("business-1");
    const deadline = standard(report, "ds_101");

    expect(deadline.status).toBe("overdue");
    expect(deadline.detail).toBe("1 de 1 reclamo(s) pasaron el plazo legal.");
    expect(deadline.action).toBe("Responde los 1 reclamo(s) vencido(s).");
    expect(deadline.href).toBe("/reclamos");
    expect(report.nextActions).toContain("Responde los 1 reclamo(s) vencido(s).");
  });

  it("counts a complaint answered within the deadline as compliant", async () => {
    state.complaints = [{ submissionDate: daysAgo(30), responseDate: daysAgo(28) }];

    const report = await legalComplianceService.buildComplianceReport("business-1");

    expect(standard(report, "ds_101").status).toBe("compliant");
    expect(standard(report, "ds_101").detail).toBe("1 reclamo(s) recibidos, ninguno fuera de plazo.");
    expect(report.applicableStandards).toBe(4);
  });

  it("says which locals lack their own register, and how to fix it", async () => {
    state.establishments = [{ id: "loc-1" }, { id: "loc-2" }];

    const report = await legalComplianceService.buildComplianceReport("business-1");
    const ds011 = standard(report, "ds_011");

    expect(ds011.status).toBe("pending");
    expect(ds011.detail).toBe("1 de 2 local(es) no tienen su propio Libro.");
    expect(ds011.action).toBe("Crea el Libro de Reclamaciones de 1 local(es).");
    expect(ds011.href).toBe("/libros");
  });

  it("asks for the first local when the business has none", async () => {
    state.establishments = [];
    state.books = [];

    const report = await legalComplianceService.buildComplianceReport("business-1");
    const ds011 = standard(report, "ds_011");

    expect(ds011.status).toBe("pending");
    expect(ds011.action).toBe("Registra tu primer local para habilitar el Libro de Reclamaciones.");
    expect(ds011.href).toBe("/sucursales");
  });

  it("counts the confirmed internal register as Ley 29733 evidence", async () => {
    state.activities = [{ id: "activity-1" }];

    const report = await legalComplianceService.buildComplianceReport("business-1");
    const ley = standard(report, "ley_29733");

    expect(ley.status).toBe("compliant");
    expect(ley.detail).toBe(
      "Registro interno confirmado: 1 actividad(es) derivadas del Libro de Reclamaciones.",
    );
    expect(ley.action).toBeNull();
    expect(report.compliantStandards).toBe(2);
    expect(report.applicableStandards).toBe(3);
    // Only the State inscription is left: the internal register is not it.
    expect(report.nextActions).toEqual([
      "La inscripción la presenta tu empresa en el SIPDP: es gratuita y de aprobación automática. Al terminar obtienes la constancia y el código del banco de datos.",
    ]);
  });

  it("does NOT treat the internal register as the RNPD inscription", async () => {
    // The regression this pins: one click on the register used to turn the whole
    // Ley 29733 line green, i.e. it implied the State filing was done.
    state.activities = [{ id: "activity-1" }];

    const report = await legalComplianceService.buildComplianceReport("business-1");

    expect(standard(report, "ley_29733").status).toBe("compliant");
    expect(standard(report, "rnpd").status).toBe("pending");
    expect(report.rnpd.registered).toBe(false);
    expect(report.rnpd.answered).toBe(false);
  });

  it("shows the declared RNPD inscription and its code", async () => {
    state.activities = [{ id: "activity-1" }];
    state.tracking = [
      {
        complianceType: "rnpd_registration",
        status: "compliant",
        dueDate: null,
        notes: "Código del banco de datos: BD-2026-001",
        completedDate: new Date("2026-05-01T00:00:00.000Z"),
      },
    ];

    const report = await legalComplianceService.buildComplianceReport("business-1");

    expect(standard(report, "rnpd").status).toBe("compliant");
    expect(standard(report, "rnpd").detail).toContain("BD-2026-001");
    expect(report.rnpd).toEqual({
      registered: true,
      answered: true,
      code: "BD-2026-001",
      completedDate: "2026-05-01T00:00:00.000Z",
    });
    expect(report.nextActions).toEqual([]);
  });
});
