import fs from "fs";
import type { Express, Request, Response, NextFunction } from "express";

import { storage } from "../storage";
import { requireAuth, requireStaff } from "../middleware/requireAuth";
import { evidenceUploadLimiter, uploadLimiter } from "../middleware/rateLimits";
import {
  attachmentUpload,
  readAttachment,
  resolveMimeType,
  documentMatches,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from "../services/attachmentService";
import { enforceQuota } from "../services/subscriptionService";

function cleanupUploadedFiles(files: Express.Multer.File[] | undefined): void {
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
        console.error("[attachments] failed to clean up rejected upload:", error);
      }
    }
  }
}

/**
 * Evidence attachments (Phase 1.1).
 *
 * Uploads are public but authenticated by knowledge: the request must carry
 * the consumer's document number, which must match the complaint. This is the
 * same "something only the consumer knows" check the public consultation
 * endpoint uses. Downloads are staff-only (requireAuth + business match).
 */

/**
 * Runs the multer middleware and translates its errors into 400 responses
 * (unsupported type, file too large, too many files) instead of letting them
 * reach the generic 500 error handler.
 */
function uploadFiles(req: Request, res: Response, next: NextFunction) {
  attachmentUpload.array('files', 10)(req, res, (error: any) => {
    if (!error) {
      return next();
    }

    cleanupUploadedFiles(req.files as Express.Multer.File[] | undefined);

    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `Cada archivo debe pesar como máximo ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`
        : error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Se permite un máximo de 10 archivos por reclamación'
          : error.message || 'No se pudieron procesar los archivos';

    return res.status(400).json({ message });
  });
}

export function registerAttachmentsRoutes(app: Express): void {
  // Consumer-side upload, right after the complaint is registered
  app.post(
    '/api/public/complaints/:id/attachments',
    // Per-complaint ceiling first (rejects early, before any file is written),
    // then the per-IP one, then complaint existence check, then multer.
    evidenceUploadLimiter,
    uploadLimiter,
    async (req, res, next) => {
      try {
        const complaint = await storage.getComplaint(req.params.id);
        if (!complaint) {
          return res.status(404).json({ message: "Reclamación no encontrada" });
        }
        (req as any).complaint = complaint;
        return next();
      } catch (error) {
        console.error('Error loading complaint before attachment upload:', error);
        return res.status(500).json({ message: "No se pudieron subir los archivos" });
      }
    },
    uploadFiles,
    async (req, res) => {
      const files = (req.files as Express.Multer.File[]) ?? [];
      try {
        const complaint = (req as any).complaint ?? (await storage.getComplaint(req.params.id));
        if (!complaint) {
          cleanupUploadedFiles(files);
          return res.status(404).json({ message: "Reclamación no encontrada" });
        }

        // Knowledge check: the document number of the consumer who filed it.
        // Compared in constant time so the endpoint is not a timing oracle.
        if (!documentMatches(req.body?.documento, complaint.consumerDocumentNumber)) {
          cleanupUploadedFiles(files);
          return res.status(403).json({ message: "No autorizado para adjuntar archivos a esta reclamación" });
        }

        if (files.length === 0) {
          return res.status(400).json({ message: "No se recibieron archivos" });
        }

        // Plan quota on files per complaint (Phase 2.6)
        const current = await storage.countAttachmentsByComplaint(complaint.id);
        const quota = await enforceQuota(complaint.businessId, null, 'attachmentsPerComplaint', current + files.length);
        if (!quota.allowed) {
          cleanupUploadedFiles(files);
          return res.status(402).json({ message: quota.reason, code: "quota_exceeded" });
        }

        const created = [];
        for (const file of files) {
          const attachment = await storage.createAttachment({
            complaintId: complaint.id,
            // Stored path relative to the uploads root: YYYY/MM/name
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

        await storage.createAuditLog({
          complaintId: complaint.id,
          userId: null,
          action: 'attachments_added',
          oldValues: null,
          newValues: { count: created.length },
          notes: `El consumidor adjuntó ${created.length} archivo(s) de evidencia.`,
          ipAddress: req.ip ?? null,
          userAgent: req.get('User-Agent') ?? null,
        });

        res.status(201).json({ success: true, attachments: created });
      } catch (error) {
        cleanupUploadedFiles(files);
        console.error('Error uploading attachments:', error);
        res.status(500).json({ message: "No se pudieron subir los archivos" });
      }
    },
  );

  // Staff: list the attachments of a complaint
  app.get('/api/complaints/:id/attachments', requireAuth, async (req: any, res) => {
    try {
      const complaint = await storage.getComplaint(req.params.id);
      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Complaint not found" });
      }

      const attachments = await storage.getAttachmentsByComplaint(req.params.id);
      res.json(attachments);
    } catch (error) {
      console.error('Error listing attachments:', error);
      res.status(500).json({ message: "Failed to list attachments" });
    }
  });

  // Staff: download one attachment
  app.get('/api/attachments/:id/file', requireAuth, async (req: any, res) => {
    try {
      const attachment = await storage.getAttachment(req.params.id);
      if (!attachment || attachment.deletedAt) {
        return res.status(404).json({ message: "Archivo no encontrado" });
      }

      const complaint = await storage.getComplaint(attachment.complaintId);
      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Archivo no encontrado" });
      }

      const stream = readAttachment(attachment.fileName);
      if (!stream) {
        return res.status(410).json({ message: "El archivo ya no está disponible (política de retención)" });
      }

      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(attachment.originalName)}"`);
      stream.pipe(res);
    } catch (error) {
      console.error('Error downloading attachment:', error);
      res.status(500).json({ message: "Failed to download attachment" });
    }
  });

  // Staff: remove an attachment (soft delete; the file is unlinked).
  // requireStaff: read-only viewers must not destroy legal evidence.
  app.delete('/api/attachments/:id', requireAuth, requireStaff, async (req: any, res) => {
    try {
      const attachment = await storage.getAttachment(req.params.id);
      if (!attachment || attachment.deletedAt) {
        return res.status(404).json({ message: "Archivo no encontrado" });
      }

      const complaint = await storage.getComplaint(attachment.complaintId);
      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Archivo no encontrado" });
      }

      await storage.softDeleteAttachment(attachment.id);
      const { deleteAttachmentFile } = await import('../services/attachmentService');
      deleteAttachmentFile(attachment.fileName);

      await storage.createAuditLog({
        complaintId: complaint.id,
        userId: req.user.id,
        action: 'attachment_removed',
        oldValues: { originalName: attachment.originalName },
        newValues: null,
        notes: 'Archivo de evidencia eliminado por el personal de la empresa.',
        ipAddress: req.ip ?? null,
        userAgent: req.get('User-Agent') ?? null,
      });

      res.json({ success: true });
    } catch (error) {
      console.error('Error removing attachment:', error);
      res.status(500).json({ message: "Failed to remove attachment" });
    }
  });

  // Upload constraints for the client UI
  app.get('/api/attachments/limits', (_req, res) => {
    res.json({
      maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
      maxFileSizeMB: MAX_FILE_SIZE_BYTES / (1024 * 1024),
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      maxFiles: 10,
    });
  });
}
