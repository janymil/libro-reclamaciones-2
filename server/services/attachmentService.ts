import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

/**
 * Evidence attachments (Phase 1.1).
 *
 * Consumers can attach PDF/JPG/PNG files (max 5 MB each) to their complaint.
 * Files are stored on disk under a configured directory (ATTACHMENTS_DIR,
 * default `uploads/` at the project root) with random names; the database
 * only keeps metadata (see complaint_attachments). The 2-year retention
 * sweep deletes the files (retentionService).
 */

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
] as const;

/** Fallback mapping when the client sends a generic MIME type. */
const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
};

/**
 * Determines the effective MIME type of an uploaded file.
 *
 * Some clients (curl, scripts, certain mobile webviews) send
 * `application/octet-stream` for every part, so when the declared MIME type is
 * not allow-listed we fall back to the file extension. Returns null when the
 * file is neither a PDF nor a JPG/PNG, i.e. it must be rejected.
 */
export function resolveMimeType(file: { originalname: string; mimetype: string }): string | null {
  if ((ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
    return file.mimetype === "image/jpg" ? "image/jpeg" : file.mimetype;
  }

  const extension = file.originalname.slice(file.originalname.lastIndexOf(".")).toLowerCase();
  return EXTENSION_MIME_TYPES[extension] ?? null;
}

const UPLOADS_ROOT =
  process.env.ATTACHMENTS_DIR ||
  path.resolve(import.meta.dirname, "..", "..", "uploads");

/** Multer disk storage with randomized file names (no user-controlled paths). */
const storageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => {
    // YYYY/MM subdirectories keep any single folder from growing unbounded
    const now = new Date();
    const dir = path.join(
      UPLOADS_ROOT,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
    );
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const unique = crypto.randomBytes(16).toString("hex");
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

export const attachmentUpload = multer({
  storage: storageEngine,
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (resolveMimeType(file)) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos PDF, JPG o PNG"));
    }
  },
});

/**
 * Constant-time comparison of the consumer's document number against the one
 * stored on the complaint (the upload authorization "secret").
 *
 * Length is compared first because timingSafeEqual throws on unequal lengths;
 * doing it on digests would be nicer, but the length of a DNI/passport is not
 * meaningful to protect here.
 */
export function documentMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") {
    return false;
  }

  const given = Buffer.from(provided.trim(), "utf8");
  const wanted = Buffer.from(expected, "utf8");

  if (given.length === 0 || given.length !== wanted.length) {
    return false;
  }

  return crypto.timingSafeEqual(given, wanted);
}

/**
 * Resolves the absolute path of a stored attachment, guarding against path
 * traversal (the stored file name must live inside the uploads root).
 */
export function resolveAttachmentPath(fileName: string): string | null {
  const absolute = path.resolve(UPLOADS_ROOT, fileName);
  if (!absolute.startsWith(path.resolve(UPLOADS_ROOT) + path.sep)) {
    return null;
  }
  return absolute;
}

/** Reads a stored attachment for streaming back to the client. */
export function readAttachment(fileName: string): fs.ReadStream | null {
  const absolute = resolveAttachmentPath(fileName);
  if (!absolute || !fs.existsSync(absolute)) {
    return null;
  }
  return fs.createReadStream(absolute);
}

/** Deletes the stored file (used by manual removal and the retention sweep). */
export function deleteAttachmentFile(fileName: string): boolean {
  const absolute = resolveAttachmentPath(fileName);
  if (!absolute || !fs.existsSync(absolute)) {
    return false;
  }
  try {
    fs.unlinkSync(absolute);
    return true;
  } catch (error) {
    console.error("[attachments] failed to delete file:", error);
    return false;
  }
}
