import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@/lib/queryClient";
import type { PublicComprobante } from "@shared/comprobantes";
import type { RucVerification } from "@shared/ruc";

/**
 * Comprobantes (Phase 1) hooks.
 *
 * Two audiences, one API surface:
 *   * the customer sees their own documents and the billing defaults;
 *   * the operator console sees every tenant's queue and records the emission.
 *
 * The server owns every rule (RUC checksum, duplicate correlativos, tenant
 * isolation); these hooks only carry the answer to the screen.
 */

export interface BillingProfile {
  docType: "factura" | "boleta";
  docNumber: string;
  name: string;
  address: string;
  email: string;
  /** The company's RUC, shown even when the chosen document is a boleta. */
  ruc: string;
  businessName: string;
}

export function useBillingProfile(enabled = true) {
  return useQuery({
    queryKey: ["/api/billing/profile"],
    enabled,
    queryFn: async () => {
      const response = await fetch("/api/billing/profile", { credentials: "include" });
      if (!response.ok) {
        throw new Error("No se pudieron cargar los datos de facturación");
      }
      return (await response.json()) as BillingProfile;
    },
  });
}

export function useSaveBillingProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (profile: {
      docType: "factura" | "boleta";
      docNumber: string;
      name: string;
      address: string;
      email: string;
    }) => {
      const response = await apiRequest("PUT", "/api/billing/profile", profile);
      return (await response.json()) as { message: string; billing: BillingProfile | null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/billing/profile"] });
    },
  });
}

export function useMyComprobantes() {
  return useQuery({
    queryKey: ["/api/comprobantes"],
    queryFn: async () => {
      const response = await fetch("/api/comprobantes", { credentials: "include" });
      if (!response.ok) {
        throw new Error("No se pudieron cargar los comprobantes");
      }
      return (await response.json()) as PublicComprobante[];
    },
  });
}

/** A row of the operator queue: the row itself plus the buyer's identity. */
export interface AdminComprobanteRow {
  id: string;
  paymentId: string;
  businessId: string;
  docType: "factura" | "boleta";
  status: "pendiente" | "emitido" | "anulado";
  serie: string | null;
  number: string | null;
  issueDate: string | null;
  customerDocType: string;
  customerDocNumber: string;
  customerName: string;
  customerAddress: string | null;
  customerEmail: string | null;
  description: string;
  subtotalCents: number;
  igvCents: number;
  totalCents: number;
  igvRateBps: number;
  currency: string;
  paymentMethod: string | null;
  pdfPath: string | null;
  xmlPath: string | null;
  pdfOriginalName: string | null;
  xmlOriginalName: string | null;
  emittedAt: string | null;
  emailSentAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Joined for the console. */
  businessName: string | null;
  ruc: string | null;
  paymentReference: string | null;
  docTypeLabel: string;
  fullNumber: string | null;
}

export interface AdminComprobantesResponse {
  items: AdminComprobanteRow[];
  counts: { pendiente: number; emitido: number; anulado: number };
  suggestions: {
    factura: { serie: string; number: string; display: string };
    boleta: { serie: string; number: string; display: string };
  };
}

export function useAdminComprobantes(enabled: boolean) {
  return useQuery({
    queryKey: ["/api/admin/comprobantes"],
    enabled,
    queryFn: async () => {
      const response = await fetch("/api/admin/comprobantes", { credentials: "include" });
      if (!response.ok) {
        throw new Error("No se pudo cargar la cola de comprobantes");
      }
      return (await response.json()) as AdminComprobantesResponse;
    },
  });
}

/**
 * Records the emission. Multipart, because the PDF and XML travel with the
 * numbers: the row and its files must be stored in the same step.
 */
export function useEmitComprobante() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      serie: string;
      number: string;
      issueDate: string;
      notes?: string;
      sendEmail: boolean;
      pdf?: File | null;
      xml?: File | null;
    }) => {
      const form = new FormData();
      form.append("serie", input.serie);
      form.append("number", input.number);
      form.append("issueDate", input.issueDate);
      form.append("notes", input.notes ?? "");
      form.append("sendEmail", input.sendEmail ? "true" : "false");
      if (input.pdf) {
        form.append("pdf", input.pdf);
      }
      if (input.xml) {
        form.append("xml", input.xml);
      }

      const response = await fetch(`/api/admin/comprobantes/${input.id}/emit`, {
        method: "POST",
        body: form,
        credentials: "include",
      });

      if (!response.ok) {
        const text = (await response.text()) || response.statusText;
        throw new Error(`${response.status}: ${text}`);
      }

      return (await response.json()) as {
        message: string;
        emailWarning: string | null;
        comprobante: AdminComprobanteRow;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comprobantes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/comprobantes"] });
    },
  });
}

export function useSendComprobanteEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/admin/comprobantes/${id}/email`);
      return (await response.json()) as { message: string; emailSentAt: string | null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comprobantes"] });
    },
  });
}

export function useVoidComprobante() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; note: string }) => {
      const response = await apiRequest("POST", `/api/admin/comprobantes/${input.id}/void`, {
        note: input.note,
      });
      return (await response.json()) as { message: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comprobantes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/comprobantes"] });
    },
  });
}

/**
 * SUNAT check for a factura's RUC.
 *
 * Never throws on a provider outage: returns `{ available: false }` so the form
 * can say "we could not verify it now" and still let the customer continue.
 * The server repeats the check at checkout, so this is feedback, not the guard.
 */
export function useRucVerification(ruc: string, enabled: boolean) {
  const clean = ruc.replace(/\D/g, "");

  return useQuery({
    queryKey: ["/api/billing/ruc", clean],
    enabled: enabled && clean.length === 11,
    retry: false,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const response = await fetch(`/api/billing/ruc/${clean}`, { credentials: "include" });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        return {
          available: false,
          code: typeof body.code === "string" ? body.code : "ruc_lookup_unavailable",
          message:
            typeof body.message === "string"
              ? body.message
              : "No pudimos verificar el RUC ahora. Puedes continuar.",
        } satisfies RucVerification;
      }

      return body as unknown as RucVerification;
    },
  });
}

/**
 * Creates pending rows for paid charges that predate the feature. Idempotent,
 * so an operator can press it again after a deploy.
 */
export function useBackfillComprobantes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/admin/comprobantes/backfill");
      return (await response.json()) as {
        message: string;
        created: number;
        failed: number;
        scanned: number;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/comprobantes"] });
    },
  });
}