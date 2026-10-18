import fs from "fs";
import type { Express } from "express";

import {
  formatComprobanteNumber,
  getComprobanteDocType,
  isValidRuc,
  normalizeBilling,
  validateBilling,
} from "@shared/comprobantes";

import { storage } from "../storage";
import {
  requireAdmin,
  requireAuth,
  requireNonDemo,
  requirePlatformAdmin,
} from "../middleware/requireAuth";
import { rucLookupLimiter } from "../middleware/rateLimits";
import {
  COMPROBANTE_MAX_FILE_SIZE_BYTES,
  comprobanteUpload,
  deleteComprobanteFile,
  resolveComprobantePath,
  toStoredComprobantePath,
} from "../services/comprobanteFileService";
import { lookupRucRecord } from "../ruc-lookup";
import {
  getBillingDefaults,
  getNextNumberSuggestion,
  markComprobanteEmitted,
  saveBillingDefaults,
  sendComprobanteToCustomer,
  toPublicComprobante,
  voidComprobante,
  backfillPendingComprobantes,
} from "../services/comprobanteService";

/**
 * Comprobantes (Phase 1: emisión manual).
 *
 *   GET  /api/billing/profile              - defaults prefilled at checkout
 *   PUT  /api/billing/profile              - remember the choice for next time
 *   GET  /api/comprobantes                 - the customer's own documents
 *   GET  /api/comprobantes/:id/file/:kind  - download the PDF/XML
 *
 * Operator console (`requirePlatformAdmin`):
 *   GET  /api/admin/comprobantes           - emission queue, counts, next numbers
 *   POST /api/admin/comprobantes/:id/emit  - record serie/correlativo + files
 *   POST /api/admin/comprobantes/:id/email - resend the PDF/XML
 *   POST /api/admin/comprobantes/:id/void  - record the nota de crédito
 *
 * The emit route is the only multipart one, so multer errors are translated
 * into 400s (wrong type / too large) instead of reaching the generic handler.
 */

function uploadComprobanteFiles(req: any, res: any, next: any) {
  comprobanteUpload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "xml", maxCount: 1 },
  ])(req, res, (error: any) => {
    if (!error) {
      return next();
    }

    for (const files of Object.values(
      (req.files as Record<string, Express.Multer.File[]>) ?? {},
    )) {
      for (const file of files) {
        deleteComprobanteFile(file.path);
      }
    }

    const message =
      error.code === "LIMIT_FILE_SIZE"
        ? `Cada archivo debe pesar como máximo ${COMPROBANTE_MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`
        : error.code === "LIMIT_UNEXPECTED_FILE" || error.code === "LIMIT_FILE_COUNT"
          ? "Adjunte un único PDF y un único XML"
          : error.message || "No se pudieron procesar los archivos";

    return res.status(400).json({ message });
  });
}

function uploaded(
  req: any,
  name: "pdf" | "xml",
): { fileName: string; originalName: string } | null {
  const file = (req.files as Record<string, Express.Multer.File[]> | undefined)?.[name]?.[0];
  if (!file) {
    return null;
  }
  return { fileName: toStoredComprobantePath(file.path), originalName: file.originalname };
}

/** Parses YYYY-MM-DD as local noon, so the printed date cannot slip a day. */
function parseIssueDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function registerComprobantesRoutes(app: Express): void {
  // ---- Customer billing preferences -----------------------------------------

  app.get("/api/billing/profile", requireAuth, async (req: any, res) => {
    try {
      if (!req.user.businessId) {
        return res.status(404).json({ message: "La cuenta aún no tiene una empresa configurada" });
      }
      const defaults = await getBillingDefaults(req.user.businessId);
      if (!defaults) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }
      res.json(defaults);
    } catch (error) {
      console.error("Error reading billing defaults:", error);
      res.status(500).json({ message: "No se pudieron cargar los datos de facturación" });
    }
  });

  app.put(
    "/api/billing/profile",
    requireAuth,
    requireNonDemo,
    requireAdmin,
    async (req: any, res) => {
      try {
        if (!req.user.businessId) {
          return res.status(404).json({ message: "La cuenta aún no tiene una empresa configurada" });
        }

        const billing = normalizeBilling(req.body);
        const errors = validateBilling(billing);
        if (errors.length > 0) {
          return res.status(400).json({ message: errors[0], errors });
        }

        await saveBillingDefaults(req.user.businessId, billing);
        const defaults = await getBillingDefaults(req.user.businessId);
        res.json({ message: "Datos de facturación guardados.", billing: defaults });
      } catch (error) {
        console.error("Error saving billing defaults:", error);
        res.status(500).json({ message: "No se pudieron guardar los datos de facturación" });
      }
    },
  );

  /**
   * SUNAT check for the checkout: does the RUC exist, is it active/habido, and
   * what razón social does SUNAT have? The browser cannot call the provider
   * directly (CORS, token); this authenticated proxy reuses the same cache as
   * the public registration lookup.
   *
   * A provider outage answers `available:false`, never "invalid RUC": the
   * customer must be able to finish a payment when a third party is down.
   */
  app.get("/api/billing/ruc/:ruc", requireAuth, requireNonDemo, rucLookupLimiter, async (req: any, res) => {
    const ruc = String(req.params.ruc ?? "").replace(/\D/g, "");
    if (!isValidRuc(ruc)) {
      return res.status(400).json({
        available: false,
        code: "invalid_ruc",
        message: "El RUC no es válido (11 dígitos y dígito verificador).",
      });
    }

    try {
      const result = await lookupRucRecord(ruc);

      if (!result.ok) {
        const notFound = result.failure === "not_found";
        return res.status(notFound ? 404 : 503).json({
          available: false,
          code: notFound ? "ruc_not_found" : "ruc_lookup_unavailable",
          message: notFound
            ? "SUNAT no reconoce este RUC. Verifícalo antes de continuar."
            : "No pudimos verificar el RUC ahora. Puedes continuar; lo revisaremos al emitir.",
        });
      }

      const record = result.record;
      return res.json({
        available: true,
        ruc,
        razonSocial: record.razon_social,
        estado: record.estado,
        condicion: record.condicion,
        suggestedAddress: [
          record.direccion,
          record.distrito,
          record.provincia,
          record.departamento,
        ]
          .filter(Boolean)
          .join(", "),
        source: record.source,
      });
    } catch (error) {
      console.error("Error verifying a RUC for billing:", error);
      return res.status(503).json({
        available: false,
        code: "ruc_lookup_unavailable",
        message: "No pudimos verificar el RUC ahora. Puedes continuar; lo revisaremos al emitir.",
      });
    }
  });

  // ---- Customer documents ----------------------------------------------------

  app.get("/api/comprobantes", requireAuth, async (req: any, res) => {
    try {
      if (!req.user.businessId) {
        return res.status(404).json({ message: "La cuenta aún no tiene una empresa configurada" });
      }
      const rows = await storage.getComprobantesByBusiness(req.user.businessId);
      res.json(rows.map(toPublicComprobante));
    } catch (error) {
      console.error("Error listing comprobantes:", error);
      res.status(500).json({ message: "No se pudieron cargar los comprobantes" });
    }
  });

  app.get("/api/comprobantes/:id/file/:kind", requireAuth, async (req: any, res) => {
    try {
      const row = await storage.getComprobante(req.params.id);
      if (!row) {
        return res.status(404).json({ message: "Comprobante no encontrado" });
      }

      // Tenant isolation, except for platform staff (they issue the documents).
      if (!req.user.isPlatformAdmin && row.businessId !== req.user.businessId) {
        return res.status(403).json({ message: "No tiene acceso a este comprobante" });
      }

      const kind = req.params.kind === "xml" ? "xml" : req.params.kind === "pdf" ? "pdf" : null;
      if (!kind) {
        return res.status(400).json({ message: "Formato no válido" });
      }

      const absolute = resolveComprobantePath(kind === "xml" ? row.xmlPath : row.pdfPath);
      if (!absolute || !fs.existsSync(absolute)) {
        return res.status(404).json({ message: `El ${kind.toUpperCase()} no está adjunto` });
      }

      const doc = getComprobanteDocType(row.docType);
      const name =
        row.serie && row.number
          ? `${formatComprobanteNumber(row.serie, row.number)}.${kind}`
          : `${doc.shortLabel.toLowerCase()}-${row.id}.${kind}`;

      res.download(absolute, name);
    } catch (error) {
      console.error("Error downloading a comprobante file:", error);
      res.status(500).json({ message: "No se pudo descargar el archivo" });
    }
  });

  // ---- Operator console ------------------------------------------------------

  /**
   * Creates the pending rows for charges paid before this feature existed.
   * Registered before the `:id` routes so the literal path always wins.
   */
  app.post(
    "/api/admin/comprobantes/backfill",
    requireAuth,
    requireNonDemo,
    requirePlatformAdmin,
    async (_req, res) => {
      try {
        const result = await backfillPendingComprobantes();
        res.json({
          message:
            result.created === 0
              ? "No había pagos sin comprobante pendiente."
              : `${result.created} comprobante(s) pendiente(s) generado(s).`,
          ...result,
        });
      } catch (error) {
        console.error("Error backfilling comprobantes:", error);
        res.status(500).json({ message: "No se pudieron generar los comprobantes pendientes" });
      }
    },
  );

  app.get(
    "/api/admin/comprobantes",
    requireAuth,
    requireNonDemo,
    requirePlatformAdmin,
    async (_req, res) => {
      try {
        const [rows, counts, facturaNext, boletaNext] = await Promise.all([
          storage.listAllComprobantesWithBusiness(500),
          storage.countComprobantesByStatus(),
          getNextNumberSuggestion("factura"),
          getNextNumberSuggestion("boleta"),
        ]);

        res.json({
          items: rows.map(({ comprobante, businessName, ruc, paymentReference }) => {
            const doc = getComprobanteDocType(comprobante.docType);
            return {
              ...comprobante,
              businessName,
              ruc,
              paymentReference,
              docTypeLabel: doc.label,
              fullNumber:
                comprobante.serie && comprobante.number
                  ? formatComprobanteNumber(comprobante.serie, comprobante.number)
                  : null,
            };
          }),
          counts: {
            pendiente: counts.pendiente ?? 0,
            emitido: counts.emitido ?? 0,
            anulado: counts.anulado ?? 0,
          },
          // What to type next in SUNAT, per document type. A suggestion only:
          // the operator can override it with the number SUNAT actually gave.
          suggestions: { factura: facturaNext, boleta: boletaNext },
        });
      } catch (error) {
        console.error("Error listing the comprobante queue:", error);
        res.status(500).json({ message: "No se pudo cargar la cola de comprobantes" });
      }
    },
  );

  app.post(
    "/api/admin/comprobantes/:id/emit",
    requireAuth,
    requireNonDemo,
    requirePlatformAdmin,
    uploadComprobanteFiles,
    async (req: any, res) => {
      const pdf = uploaded(req, "pdf");
      const xml = uploaded(req, "xml");

      try {
        const updated = await markComprobanteEmitted(req.params.id, {
          serie: req.body?.serie,
          number: req.body?.number,
          issueDate: parseIssueDate(req.body?.issueDate),
          notes: typeof req.body?.notes === "string" ? req.body.notes : null,
          pdf,
          xml,
          actorUserId: req.user.id,
        });

        // Sending is best effort: the emission is already recorded, and the
        // operator can retry from the same row.
        let emailWarning: string | null = null;
        if (String(req.body?.sendEmail ?? "true") !== "false") {
          try {
            await sendComprobanteToCustomer(updated.id);
          } catch (error) {
            emailWarning =
              error instanceof Error ? error.message : "No se pudo enviar el correo";
          }
        }

        const doc = getComprobanteDocType(updated.docType);
        res.json({
          message: `Comprobante ${formatComprobanteNumber(updated.serie ?? doc.defaultSerie, updated.number ?? "")} registrado.`,
          comprobante: {
            ...updated,
            docTypeLabel: doc.label,
            fullNumber:
              updated.serie && updated.number
                ? formatComprobanteNumber(updated.serie, updated.number)
                : null,
          },
          emailWarning,
        });
      } catch (error) {
        // The row was not updated, so the uploaded files must not stay orphaned.
        if (pdf) {
          deleteComprobanteFile(pdf.fileName);
        }
        if (xml) {
          deleteComprobanteFile(xml.fileName);
        }

        const message = error instanceof Error ? error.message : "No se pudo registrar";
        if (/no encontrado/i.test(message)) {
          return res.status(404).json({ message });
        }
        if (/ya está registrado|debe|no es válida|no se puede volver/i.test(message)) {
          return res.status(400).json({ message });
        }
        console.error("Error recording a comprobante:", error);
        res.status(500).json({ message: "No se pudo registrar el comprobante" });
      }
    },
  );

  app.post(
    "/api/admin/comprobantes/:id/email",
    requireAuth,
    requireNonDemo,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const updated = await sendComprobanteToCustomer(req.params.id);
        res.json({
          message: `Comprobante enviado a ${updated.customerEmail}.`,
          emailSentAt: updated.emailSentAt,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo enviar";
        if (/no encontrado/i.test(message)) {
          return res.status(404).json({ message });
        }
        if (/no está emitido|no tiene correo/i.test(message)) {
          return res.status(400).json({ message });
        }
        console.error("Error resending a comprobante:", error);
        res.status(500).json({ message: "No se pudo enviar el comprobante" });
      }
    },
  );

  app.post(
    "/api/admin/comprobantes/:id/void",
    requireAuth,
    requireNonDemo,
    requirePlatformAdmin,
    async (req: any, res) => {
      try {
        const note = typeof req.body?.note === "string" ? req.body.note : null;
        const updated = await voidComprobante(req.params.id, note, req.user.id);
        res.json({
          message:
            "Comprobante marcado como anulado. Recuerde emitir la nota de crédito en SUNAT si ya estaba emitido.",
          comprobante: updated,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "No se pudo anular";
        if (/no encontrado/i.test(message)) {
          return res.status(404).json({ message });
        }
        console.error("Error voiding a comprobante:", error);
        res.status(500).json({ message: "No se pudo anular el comprobante" });
      }
    },
  );
}
