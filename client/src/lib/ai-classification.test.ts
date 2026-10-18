import { describe, expect, it } from "vitest";

import {
  buildComplaintAIText,
  complaintOptionLabel,
  filterComplaints,
  normalizeSearch,
  type ComplaintForClassification,
} from "./ai-classification";

/**
 * The complaint picker must produce the same text a customer would paste, so
 * classifying a stored reclamo is one click instead of a copy-paste job - and
 * it must stay usable when the tenant has thousands of complaints.
 */

const base: ComplaintForClassification = {
  complaintType: "reclamo",
  productServiceName: "Internet fibra 200 Mbps",
  complaintDetail: "El servicio se interrumpió tres días y no hubo respuesta.",
  consumerRequest: "Solicito el descuento de los días sin servicio.",
};

describe("buildComplaintAIText", () => {
  it("includes the type, the product/service, the detail and the request", () => {
    const text = buildComplaintAIText(base);

    expect(text).toContain("Reclamo sobre: Internet fibra 200 Mbps");
    expect(text).toContain("Detalle: El servicio se interrumpió tres días");
    expect(text).toContain("Pedido del consumidor: Solicito el descuento");
  });

  it("labels a queja as Queja, not Reclamo", () => {
    const text = buildComplaintAIText({ ...base, complaintType: "queja" });

    expect(text.startsWith("Queja sobre:")).toBe(true);
    expect(text).not.toContain("Reclamo sobre:");
  });

  it("omits the request when the consumer did not state one", () => {
    const text = buildComplaintAIText({ ...base, consumerRequest: null });
    expect(text).not.toContain("Pedido del consumidor");

    const blank = buildComplaintAIText({ ...base, consumerRequest: "   " });
    expect(blank).not.toContain("Pedido del consumidor");
  });
});

describe("complaintOptionLabel", () => {
  it("shows the correlative, the type and the consumer", () => {
    expect(
      complaintOptionLabel({
        correlativeNumber: "2026-0010",
        complaintType: "reclamo",
        consumerFullName: "Ana Pérez",
      }),
    ).toBe("#2026-0010 · Reclamo · Ana Pérez");
  });

  it("shows Queja for a queja", () => {
    expect(
      complaintOptionLabel({
        correlativeNumber: "2026-0011",
        complaintType: "queja",
        consumerFullName: "Luis Gómez",
      }),
    ).toBe("#2026-0011 · Queja · Luis Gómez");
  });
});

const searchable = [
  {
    correlativeNumber: "2026-0010",
    consumerFullName: "María Elena García",
    complaintType: "queja",
    productServiceName: "Delivery de comida",
  },
  {
    correlativeNumber: "2026-0009",
    consumerFullName: "José Luis Pérez",
    complaintType: "reclamo",
    productServiceName: "Internet fibra",
  },
  {
    correlativeNumber: "001-0001",
    consumerFullName: "Ana Sofía López",
    complaintType: "reclamo",
    productServiceName: "Plan móvil",
  },
];

describe("filterComplaints", () => {
  it("returns every complaint when the search is empty", () => {
    const result = filterComplaints(searchable, "");

    expect(result.matches).toHaveLength(3);
    expect(result.truncated).toBe(false);
  });

  it("finds by correlative number", () => {
    expect(filterComplaints(searchable, "0010").matches.map((c) => c.correlativeNumber)).toEqual([
      "2026-0010",
    ]);
  });

  it("ignores accents and case in consumer names", () => {
    expect(filterComplaints(searchable, "MARIA").matches[0].consumerFullName).toBe("María Elena García");
    expect(filterComplaints(searchable, "jose").matches[0].consumerFullName).toBe("José Luis Pérez");
  });

  it("finds by type and by product/service", () => {
    expect(filterComplaints(searchable, "queja").matches.map((c) => c.correlativeNumber)).toEqual([
      "2026-0010",
    ]);
    expect(filterComplaints(searchable, "internet").matches.map((c) => c.correlativeNumber)).toEqual([
      "2026-0009",
    ]);
  });

  it("caps the rendered rows and reports that it is showing a subset", () => {
    const result = filterComplaints(searchable, "", 2);

    expect(result.matches).toHaveLength(2);
    expect(result.totalMatches).toBe(3);
    expect(result.truncated).toBe(true);
  });

  it("returns nothing when there is no match", () => {
    expect(filterComplaints(searchable, "zzz").matches).toEqual([]);
  });

  it("normalizes accents before comparing", () => {
    expect(normalizeSearch("  María José  ")).toBe("maria jose");
  });
});
