import { describe, expect, it } from "vitest";

import type { Complaint } from "@shared/schema";

import { renderComplaintAIContext } from "./complaintAIContext";

/**
 * The AI must receive the real, server-loaded complaint - not just the text the
 * browser typed - and never the consumer's personal contact data.
 */

const complaint = {
  id: "c1",
  businessId: "b1",
  correlativeNumber: "2026-0010",
  complaintType: "queja",
  status: "in_progress",
  priority: "high",
  submissionDate: new Date("2026-10-15T15:00:00.000Z"),
  productServiceName: "Servicio de Soporte Cloud",
  consumerRequest: "Solicito una disculpa y la reposición del servicio.",
  complaintDetail: "La atención del canal de soporte fue déspota.",
  consumerFullName: "Ana Pérez",
  consumerDocumentNumber: "12345678",
  consumerEmail: "ana@example.com",
  consumerPhone: "999888777",
  consumerAddress: "Av. Siempre Viva 123",
} as unknown as Complaint;

describe("renderComplaintAIContext", () => {
  it("describes the stored record, including facts the textarea does not carry", () => {
    const context = renderComplaintAIContext(complaint);

    expect(context).toContain("[Ficha del reclamo registrado]");
    expect(context).toContain("N° correlativo: 2026-0010");
    expect(context).toContain("Tipo: Queja");
    expect(context).toContain("Estado: En proceso");
    expect(context).toContain("Prioridad: Alta");
    expect(context).toContain("Fecha de presentación: 2026-10-15");
    expect(context).toContain("Producto/servicio: Servicio de Soporte Cloud");
    expect(context).toContain("Pedido del consumidor: Solicito una disculpa");
  });

  it("never sends the consumer's personal contact data to the provider", () => {
    const context = renderComplaintAIContext(complaint);

    expect(context).not.toContain("Ana Pérez");
    expect(context).not.toContain("12345678");
    expect(context).not.toContain("ana@example.com");
    expect(context).not.toContain("999888777");
    expect(context).not.toContain("Av. Siempre Viva");
  });

  it("omits the request when the consumer did not state one", () => {
    const context = renderComplaintAIContext({ ...complaint, consumerRequest: null });

    expect(context).not.toContain("Pedido del consumidor");
  });
});
