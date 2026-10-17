import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  business: null as any,
  establishment: null as any,
}));

// The helper under test is pure; the module's data/service dependencies are not
// exercised here, and mocking them keeps the test process off the real DB.
vi.mock("../storage", () => ({
  storage: {
    getBusiness: async () => h.business,
    getEstablishment: async () => h.establishment,
  },
}));
vi.mock("../db", () => ({ db: {}, isLocalDatabase: true }));
vi.mock("./emailService", () => ({ emailService: {} }));
vi.mock("./pdfService", () => ({ pdfService: {} }));

import { nextCorrelativeNumber, intakeComplaint, IntakeError } from "./complaintIntakeService";

/**
 * Correlative-number integrity (F21): the legal folio (DS 011-2011-PCM) must
 * never be duplicated inside a business, even when two submissions race.
 */
describe("nextCorrelativeNumber", () => {
  it("uses the first sequence when nothing is taken", async () => {
    const correlative = await nextCorrelativeNumber(2026, 1, async () => false);
    expect(correlative).toBe("2026-0001");
  });

  it("pads the sequence to four digits", async () => {
    expect(await nextCorrelativeNumber(2026, 42, async () => false)).toBe("2026-0042");
    expect(await nextCorrelativeNumber(2026, 1234, async () => false)).toBe("2026-1234");
  });

  it("skips folios already taken by a concurrent submission", async () => {
    const taken = new Set(["2026-0007", "2026-0008"]);

    const correlative = await nextCorrelativeNumber(2026, 7, async (candidate) => taken.has(candidate));
    expect(correlative).toBe("2026-0009");
  });

  it("probes every candidate in order until one is free", async () => {
    const taken = new Set(["2026-0001", "2026-0002", "2026-0003", "2026-0004"]);
    const probed: string[] = [];

    const correlative = await nextCorrelativeNumber(2026, 1, async (candidate) => {
      probed.push(candidate);
      return taken.has(candidate);
    });

    expect(correlative).toBe("2026-0005");
    expect(probed).toEqual(["2026-0001", "2026-0002", "2026-0003", "2026-0004", "2026-0005"]);
  });

  it("normalizes a nonsense starting sequence instead of emitting a broken folio", async () => {
    expect(await nextCorrelativeNumber(2026, 0, async () => false)).toBe("2026-0001");
    expect(await nextCorrelativeNumber(2026, -5, async () => false)).toBe("2026-0001");
    expect(await nextCorrelativeNumber(2026, Number.NaN, async () => false)).toBe("2026-0001");
  });

  it("refuses (503) rather than issuing a duplicate folio when no slot is free", async () => {
    await expect(nextCorrelativeNumber(2026, 1, async () => true, 5)).rejects.toBeInstanceOf(IntakeError);

    await expect(nextCorrelativeNumber(2026, 1, async () => true, 5)).rejects.toMatchObject({
      status: 503,
    });
  });

  it("keeps the year the caller resolved (Peru calendar, not the host clock)", async () => {
    expect(await nextCorrelativeNumber(2027, 1, async () => false)).toBe("2027-0001");
  });
});

/**
 * Which locals accept complaints.
 *
 * Deactivating a sucursal on /sucursales is the way to close a local that stopped
 * serving the public, and it has to mean something: an old QR or a cached page
 * must not keep filing complaints into a closed local's book.
 */
describe("intakeComplaint - closed locals", () => {
  const submission = {
    businessId: "b1",
    establishmentId: "e1",
  } as any;

  beforeEach(() => {
    h.business = { id: "b1" };
    h.establishment = { id: "e1", businessId: "b1", isActive: true };
  });

  it("refuses a complaint for a deactivated establishment (409)", async () => {
    h.establishment = { id: "e1", businessId: "b1", isActive: false };

    await expect(intakeComplaint(submission)).rejects.toMatchObject({ status: 409 });
  });

  it("still hides an establishment of another tenant (404)", async () => {
    h.establishment = { id: "e1", businessId: "otra-empresa", isActive: true };

    await expect(intakeComplaint(submission)).rejects.toMatchObject({ status: 404 });
  });

  it("still hides an unknown establishment (404)", async () => {
    h.establishment = undefined;

    await expect(intakeComplaint(submission)).rejects.toMatchObject({ status: 404 });
  });
});