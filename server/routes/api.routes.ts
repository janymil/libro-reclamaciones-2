import fs from "fs";
import type { Express, Request, RequestHandler } from "express";
import { z } from "zod";

import { complaintSubmissionSchema } from "@shared/schema";
import { storage } from "../storage";
import {
  apiV1IpLimiter,
  apiV1ReadLimiter,
  apiV1WriteLimiter,
} from "../middleware/rateLimits";
import { authenticateApiKey, getApiKeyContext, type ApiKeyContext } from "../services/apiKeyAuth";
import { intakeComplaint, IntakeError } from "../services/complaintIntakeService";
import { enforceQuota, enforceComplaintType } from "../services/subscriptionService";
import { isBusinessPublished } from "../services/verificationService";
import { enqueueWebhookEvent } from "../services/webhookService";
import { emailService } from "../services/emailService";
import { emailIdentityForBusiness } from "../services/emailIdentity";
import {
  attachmentUpload,
  readAttachmentBytes,
  encryptStoredAttachment,
  resolveMimeType,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from "../services/attachmentService";
import { buildOpenApiDocument } from "../openapi";

/**
 * Public REST API v1 (Phase 3.12) for CRM/ERP integrations.
 *
 *   POST   /api/v1/complaints                  - register a complaint
 *   GET    /api/v1/complaints                  - paginated list (safe fields)
 *   GET    /api/v1/complaints/:id              - detail (includes consumer data)
 *   PATCH  /api/v1/complaints/:id              - status / priority
 *   POST   /api/v1/complaints/:id/response     - record + email the response
 *   GET    /api/v1/complaints/:id/attachments  - evidence metadata
 *   POST   /api/v1/complaints/:id/attachments  - upload evidence
 *   GET    /api/v1/attachments/:id/file        - download evidence
 *   GET    /api/v1/establishments              - active locations (for the required id)
 *   GET    /api/v1/ping                        - health probe
 *   GET    /api/v1/openapi.json                - machine-readable specification
 *
 * Auth: `Authorization: Bearer ld_...`.
 *
 * Guards are applied in this order:
 *   1. per-IP ceiling (protects the 401 path),
 *   2. API-key authentication + live plan check (`api` feature),
 *   3. per-key ceiling (read or write).
 */

const readGuards: RequestHandler[] = [apiV1IpLimiter, authenticateApiKey, apiV1ReadLimiter];
const writeGuards: RequestHandler[] = [apiV1IpLimiter, authenticateApiKey, apiV1WriteLimiter];

const statusValues = ['new', 'in_progress', 'responded', 'resolved', 'overdue'] as const;
const priorityValues = ['low', 'normal', 'high', 'urgent'] as const;

/** Safe projection for list responses (no consumer PII). */
function toSummary(complaint: any) {
  return {
    id: complaint.id,
    correlativeNumber: complaint.correlativeNumber,
    complaintType: complaint.complaintType,
    status: complaint.status,
    priority: complaint.priority,
    productServiceName: complaint.productServiceName,
    establishmentId: complaint.establishmentId,
    submissionDate: complaint.submissionDate,
    dueDate: complaint.dueDate,
    responseDate: complaint.responseDate,
    isOverdue: complaint.isOverdue,
    createdAt: complaint.createdAt,
  };
}

/** Detail projection: the caller already owns the complaint (tenant-scoped key). */
async function toDetail(complaint: any) {
  const attachments = await storage.getAttachmentsByComplaint(complaint.id);
  return {
    ...toSummary(complaint),
    productServiceDescription: complaint.productServiceDescription,
    purchaseAmount: complaint.purchaseAmount,
    purchaseDate: complaint.purchaseDate,
    receiptNumber: complaint.receiptNumber,
    complaintDetail: complaint.complaintDetail,
    consumerRequest: complaint.consumerRequest,
    providerActions: complaint.providerActions,
    providerResponse: complaint.providerResponse,
    responseMethod: complaint.responseMethod,
    guardian: complaint.guardianFullName
      ? {
          fullName: complaint.guardianFullName,
          documentType: complaint.guardianDocumentType,
          documentNumber: complaint.guardianDocumentNumber,
          relationship: complaint.guardianRelationship,
        }
      : null,
    consumer: {
      fullName: complaint.consumerFullName,
      documentType: complaint.consumerDocumentType,
      documentNumber: complaint.consumerDocumentNumber,
      address: complaint.consumerAddress,
      phone: complaint.consumerPhone,
      email: complaint.consumerEmail,
    },
    attachments: attachments
      .filter((attachment) => !attachment.deletedAt)
      .map((attachment) => ({
        id: attachment.id,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        fileSize: attachment.fileSize,
        uploadedAt: attachment.uploadedAt,
        downloadUrl: `/api/v1/attachments/${attachment.id}/file`,
      })),
  };
}

async function findTenantComplaint(id: string, businessId: string) {
  const complaint = await storage.getComplaint(id);
  if (!complaint || complaint.businessId !== businessId) {
    return null;
  }
  return complaint;
}

async function writeAudit(
  req: Request,
  apiKey: ApiKeyContext,
  complaintId: string,
  action: string,
  notes: string,
  newValues: Record<string, unknown> | null,
): Promise<void> {
  await storage.createAuditLog({
    complaintId,
    userId: null,
    action,
    oldValues: null,
    newValues,
    notes: `${notes} (API: ${apiKey.name}, ${apiKey.keyPrefix}…)`,
    ipAddress: req.ip ?? null,
    userAgent: req.get('User-Agent') ?? null,
  });
}

export function registerApiV1Routes(app: Express): void {
  // API health probe (also used by the status page)
  app.get('/api/v1/ping', apiV1IpLimiter, (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString(), version: '1' });
  });

  /**
   * Public, machine-readable contract. No key required: a developer needs the
   * spec before an administrator can issue one.
   */
  app.get('/api/v1/openapi.json', apiV1IpLimiter, (req, res) => {
    const origin = `${req.protocol}://${req.get('host')}`;
    res.json(buildOpenApiDocument(origin));
  });

  // ---- Establishments ---------------------------------------------------------

  app.get('/api/v1/establishments', ...readGuards, async (req, res) => {
    try {
      const apiKey = getApiKeyContext(req);
      const establishments = await storage.getEstablishmentsByBusiness(apiKey.businessId);

      res.json(
        establishments.map((establishment) => ({
          id: establishment.id,
          name: establishment.name,
          address: establishment.address,
          phone: establishment.phone,
          email: establishment.email,
          identificationCode: establishment.identificationCode,
          isActive: establishment.isActive,
        })),
      );
    } catch (error) {
      console.error('API v1 establishment listing failed:', error);
      res.status(500).json({ error: 'internal_error', message: 'Error interno' });
    }
  });

  // ---- Complaints: list -------------------------------------------------------

  const listQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
    status: z.enum(statusValues).optional(),
    type: z.enum(['reclamo', 'queja']).optional(),
    priority: z.enum(priorityValues).optional(),
    establishmentId: z.string().uuid().optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
  });

  app.get('/api/v1/complaints', ...readGuards, async (req, res) => {
    try {
      const apiKey = getApiKeyContext(req);
      const parsed = listQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Parámetros inválidos',
          details: parsed.error.errors.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        });
      }

      const { limit, offset, ...filters } = parsed.data;
      const { items, total } = await storage.getComplaintsPage(
        apiKey.businessId,
        {
          status: filters.status,
          type: filters.type,
          priority: filters.priority,
          establishmentId: filters.establishmentId,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
        },
        limit,
        offset,
      );

      res.setHeader('X-Total-Count', String(total));
      res.setHeader('X-Page-Limit', String(limit));
      res.setHeader('X-Page-Offset', String(offset));
      res.json(items.map(toSummary));
    } catch (error) {
      console.error('API v1 complaint listing failed:', error);
      res.status(500).json({ error: 'internal_error', message: 'Error interno' });
    }
  });

  // ---- Complaints: detail -----------------------------------------------------

  app.get('/api/v1/complaints/:id', ...readGuards, async (req, res) => {
    try {
      const apiKey = getApiKeyContext(req);
      const complaint = await findTenantComplaint(req.params.id, apiKey.businessId);
      if (!complaint) {
        return res.status(404).json({ error: 'complaint_not_found', message: 'Reclamación no encontrada' });
      }

      res.json(await toDetail(complaint));
    } catch (error) {
      console.error('API v1 complaint detail failed:', error);
      res.status(500).json({ error: 'internal_error', message: 'Error interno' });
    }
  });

  // ---- Complaints: create -----------------------------------------------------

  app.post('/api/v1/complaints', ...writeGuards, async (req, res) => {
    try {
      const apiKey = getApiKeyContext(req);
      const data = complaintSubmissionSchema.parse({ ...req.body, businessId: apiKey.businessId });

      // Same publication gate as the public form: a tenant whose administrator
      // never confirmed the notification mailbox must not start a legal clock
      // it cannot hear.
      if (!(await isBusinessPublished(apiKey.businessId))) {
        return res.status(403).json({
          error: 'libro_not_published',
          message:
            'Este Libro de Reclamaciones aún no está publicado. La empresa debe confirmar su correo de notificaciones antes de recibir reclamos.',
        });
      }

      const quota = await enforceQuota(apiKey.businessId, null, 'complaintsThisMonth');
      if (!quota.allowed) {
        return res.status(402).json({ error: 'quota_exceeded', message: quota.reason });
      }

      // Complaint-type gate: the Gratis plan accepts Reclamos only.
      const typeCheck = await enforceComplaintType(apiKey.businessId, data.complaintType);
      if (!typeCheck.allowed) {
        return res.status(402).json({ error: 'complaint_type_not_allowed', message: typeCheck.reason });
      }

      // Lifetime gate: Gratis includes 5 complaints in total, not per month.
      const lifetime = await enforceQuota(apiKey.businessId, null, 'complaintsTotal');
      if (!lifetime.allowed) {
        return res.status(402).json({ error: 'quota_exceeded', message: lifetime.reason });
      }

      const { complaint } = await intakeComplaint(data);

      res.status(201).json({
        id: complaint.id,
        correlativeNumber: complaint.correlativeNumber,
        dueDate: complaint.dueDate,
        status: complaint.status,
      });
    } catch (error) {
      if (error instanceof IntakeError) {
        return res.status(error.status).json({ error: 'intake_failed', message: error.message });
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Datos inválidos',
          details: error.errors.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        });
      }
      console.error('API v1 complaint creation failed:', error);
      res.status(400).json({ error: 'invalid_request', message: 'Solicitud inválida' });
    }
  });

  // ---- Complaints: workflow update -------------------------------------------

  const updateSchema = z
    .object({
      status: z.enum(statusValues).optional(),
      priority: z.enum(priorityValues).optional(),
    })
    .strict()
    .refine((data) => data.status !== undefined || data.priority !== undefined, {
      message: 'Envíe status y/o priority',
    });

  app.patch('/api/v1/complaints/:id', ...writeGuards, async (req, res) => {
    try {
      const apiKey = getApiKeyContext(req);
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Datos inválidos',
          details: parsed.error.errors.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        });
      }

      const complaint = await findTenantComplaint(req.params.id, apiKey.businessId);
      if (!complaint) {
        return res.status(404).json({ error: 'complaint_not_found', message: 'Reclamación no encontrada' });
      }

      const updated = await storage.updateComplaint(complaint.id, parsed.data);
      await writeAudit(req, apiKey, complaint.id, 'complaint_updated', 'Reclamación actualizada vía API.', parsed.data);

      void enqueueWebhookEvent(apiKey.businessId, 'complaint.updated', updated).catch(() => {});

      res.json(toSummary(updated));
    } catch (error) {
      console.error('API v1 complaint update failed:', error);
      res.status(500).json({ error: 'internal_error', message: 'Error interno' });
    }
  });

  // ---- Complaints: response ---------------------------------------------------

  const responseSchema = z
    .object({
      providerResponse: z.string().trim().min(1).max(20000),
      providerActions: z.string().max(5000).optional(),
      responseMethod: z.enum(['email', 'letter', 'phone']).default('email'),
    })
    .strict();

  app.post('/api/v1/complaints/:id/response', ...writeGuards, async (req, res) => {
    try {
      const apiKey = getApiKeyContext(req);
      const parsed = responseSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'invalid_request',
          message: 'Datos inválidos',
          details: parsed.error.errors.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
        });
      }

      const complaint = await findTenantComplaint(req.params.id, apiKey.businessId);
      if (!complaint) {
        return res.status(404).json({ error: 'complaint_not_found', message: 'Reclamación no encontrada' });
      }

      const updated = await storage.updateComplaint(complaint.id, {
        providerResponse: parsed.data.providerResponse,
        providerActions: parsed.data.providerActions ?? null,
        responseMethod: parsed.data.responseMethod,
        responseDate: new Date(),
        status: 'responded',
      });

      await writeAudit(
        req,
        apiKey,
        complaint.id,
        'complaint_responded',
        'Respuesta registrada vía API.',
        { responseMethod: parsed.data.responseMethod },
      );

      // The legal record is already saved; a transient SMTP failure must not
      // turn the API call into a 500 (the caller can retry the email or notify
      // the consumer through another channel).
      let emailSent = false;
      if (updated.consumerEmail) {
        try {
          const config = await storage.getLibroConfiguration(complaint.businessId);
          await emailService.sendComplaintResponse(
            updated.consumerEmail,
            updated,
            parsed.data.providerResponse,
            {
              subjectPrefix: config?.emailSubjectPrefix ?? null,
              headerText: config?.emailHeaderText ?? null,
              footerText: config?.emailFooterText ?? null,
              identity: await emailIdentityForBusiness(complaint.businessId),
            },
          );
          emailSent = true;
        } catch (error) {
          console.error('API v1 response email failed:', error);
        }
      }

      void enqueueWebhookEvent(apiKey.businessId, 'complaint.responded', updated).catch(() => {});

      res.json({
        id: updated.id,
        correlativeNumber: updated.correlativeNumber,
        status: updated.status,
        responseDate: updated.responseDate,
        responseMethod: updated.responseMethod,
        emailSent,
      });
    } catch (error) {
      console.error('API v1 complaint response failed:', error);
      res.status(500).json({ error: 'internal_error', message: 'Error interno' });
    }
  });

  // ---- Evidence attachments ---------------------------------------------------

  function cleanupApiFiles(files: Express.Multer.File[] | undefined): void {
    if (!files) {
      return;
    }
    for (const file of files) {
      if (file?.path) {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (error) {
          console.error('[api] failed to clean up rejected upload:', error);
        }
      }
    }
  }

  function uploadApiFiles(req: Request, res: any, next: any) {
    attachmentUpload.array('files', 10)(req, res, (error: any) => {
      if (!error) {
        return next();
      }

      cleanupApiFiles(req.files as Express.Multer.File[] | undefined);

      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `Cada archivo debe pesar como máximo ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`
          : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
            ? 'Se permite un máximo de 10 archivos por reclamación'
            : error.message || 'No se pudieron procesar los archivos';

      return res.status(400).json({ error: 'invalid_request', message });
    });
  }

  app.get('/api/v1/attachments/limits', ...readGuards, (_req, res) => {
    res.json({
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      maxFileSizeMB: MAX_FILE_SIZE_BYTES / (1024 * 1024),
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      maxFiles: 10,
      fieldName: 'files',
    });
  });

  app.get('/api/v1/complaints/:id/attachments', ...readGuards, async (req, res) => {
    try {
      const apiKey = getApiKeyContext(req);
      const complaint = await findTenantComplaint(req.params.id, apiKey.businessId);
      if (!complaint) {
        return res.status(404).json({ error: 'complaint_not_found', message: 'Reclamación no encontrada' });
      }

      const attachments = await storage.getAttachmentsByComplaint(complaint.id);
      res.json(
        attachments
          .filter((attachment) => !attachment.deletedAt)
          .map((attachment) => ({
            id: attachment.id,
            originalName: attachment.originalName,
            mimeType: attachment.mimeType,
            fileSize: attachment.fileSize,
            uploadedAt: attachment.uploadedAt,
            downloadUrl: `/api/v1/attachments/${attachment.id}/file`,
          })),
      );
    } catch (error) {
      console.error('API v1 attachment listing failed:', error);
      res.status(500).json({ error: 'internal_error', message: 'Error interno' });
    }
  });

  app.post(
    '/api/v1/complaints/:id/attachments',
    ...writeGuards,
    async (req, res, next) => {
      try {
        const apiKey = getApiKeyContext(req);
        const complaint = await findTenantComplaint(req.params.id, apiKey.businessId);
        if (!complaint) {
          return res.status(404).json({ error: 'complaint_not_found', message: 'Reclamación no encontrada' });
        }
        (req as any).apiComplaint = complaint;
        return next();
      } catch (error) {
        console.error('API v1 attachment pre-check failed:', error);
        return res.status(500).json({ error: 'internal_error', message: 'Error interno' });
      }
    },
    uploadApiFiles,


    async (req, res) => {
      const files = (req.files as Express.Multer.File[]) ?? [];
      try {
        const apiKey = getApiKeyContext(req);
        const complaint = (req as any).apiComplaint ?? (await findTenantComplaint(req.params.id, apiKey.businessId));

        if (!complaint) {
          cleanupApiFiles(files);
          return res.status(404).json({ error: 'complaint_not_found', message: 'Reclamación no encontrada' });
        }

        if (files.length === 0) {
          return res.status(400).json({ error: 'invalid_request', message: 'No se recibieron archivos' });
        }

        const current = await storage.countAttachmentsByComplaint(complaint.id);
        const quota = await enforceQuota(
          complaint.businessId,
          null,
          'attachmentsPerComplaint',
          current + files.length,
        );
        if (!quota.allowed) {
          cleanupApiFiles(files);
          return res.status(402).json({ error: 'quota_exceeded', message: quota.reason });
        }

        // Encrypt before recording: a row must never point at plaintext.
        for (const file of files) {
          encryptStoredAttachment(file);
        }

        const created = [];
        for (const file of files) {
          const attachment = await storage.createAttachment({
            complaintId: complaint.id,
            fileName: file.path.split(/[\\/]/).slice(-3).join('/'),
            originalName: file.originalname,
            mimeType: resolveMimeType(file) ?? file.mimetype,
            fileSize: file.size,
          });
          created.push({
            id: attachment.id,
            originalName: attachment.originalName,
            fileSize: attachment.fileSize,
            mimeType: attachment.mimeType,
          });
        }

        await writeAudit(
          req,
          apiKey,
          complaint.id,
          'attachments_added',
          `Se adjuntaron ${created.length} archivo(s) de evidencia vía API.`,
          { count: created.length },
        );

        res.status(201).json({ success: true, attachments: created });
      } catch (error) {
        cleanupApiFiles(files);
        console.error('API v1 attachment upload failed:', error);
        res.status(500).json({ error: 'internal_error', message: 'No se pudieron subir los archivos' });
      }
    },
  );

  app.get('/api/v1/attachments/:id/file', ...readGuards, async (req, res) => {
    try {
      const apiKey = getApiKeyContext(req);
      const attachment = await storage.getAttachment(req.params.id);
      if (!attachment || attachment.deletedAt) {
        return res.status(404).json({ error: 'attachment_not_found', message: 'Archivo no encontrado' });
      }

      const complaint = await storage.getComplaint(attachment.complaintId);
      if (!complaint || complaint.businessId !== apiKey.businessId) {
        return res.status(404).json({ error: 'attachment_not_found', message: 'Archivo no encontrado' });
      }

      const bytes = readAttachmentBytes(attachment.fileName);
      if (!bytes) {
        return res.status(410).json({
          error: 'attachment_expired',
          message: 'El archivo ya no está disponible (política de retención)',
        });
      }

      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalName)}"`);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(bytes);
    } catch (error) {
      console.error('API v1 attachment download failed:', error);
      res.status(500).json({ error: 'internal_error', message: 'Error interno' });
    }
  });
}
