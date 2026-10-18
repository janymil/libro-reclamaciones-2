import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

/**
 * Storage for the comprobante files an operator uploads (Phase 1).
 *
 * Same discipline as evidence attachments: random file names (never the user's),
 * YYYY/MM subdirectories, a size ceiling, and a path-traversal guard on every
 * read. A PDF and an XML per comprobante; both are optional at the storage layer
 * because a comprobante can be recorded before its files are ready.
 */

export const COMPROBANTE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const UPLOADS_ROOT =
  process.env.COMPROBANTES_DIR ||
  path.join(
    process.env.ATTACHMENTS_DIR ||
      path.resolve(import.meta.dirname, "..", "..", "uploads"),
    "comprobantes",
  );

type Kind = "pdf" | "xml";

/** Decides the effective kind from the MIME type, falling back to the extension. */
export function resolveComprobanteKind(file: {
  originalname: string;
  mimetype: string;
}): Kind | null {
  const extension = path.extname(file.originalname).toLowerCase();
  if (extension === ".pdf") {
    return "pdf";
  }
  if (extension === ".xml") {
    return "xml";
  }

  if (file.mimetype === "application/pdf") {
    return "pdf";
  }
  if (file.mimetype === "application/xml" || file.mimetype === "text/xml") {
    return "xml";
  }
  return null;
}

const storageEngine = multer.diskStorage({
  destination: (_req, _file, cb) => {
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
    const extension = path.extname(file.originalname).toLowerCase() === ".xml" ? ".xml" : ".pdf";
    cb(null, `${unique}${extension}`);
  },
});

export const comprobanteUpload = multer({
  storage: storageEngine,
  limits: { fileSize: COMPROBANTE_MAX_FILE_SIZE_BYTES, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (resolveComprobanteKind(file)) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten el PDF y el XML del comprobante"));
    }
  },
});

/**
 * Absolute path of a stored file, refusing anything that escapes the uploads
 * root. Returns null for empty/unknown names so callers can answer 404.
 */
export function resolveComprobantePath(fileName: string | null | undefined): string | null {
  if (!fileName) {
    return null;
  }
  const absolute = path.resolve(UPLOADS_ROOT, fileName);
  const root = path.resolve(UPLOADS_ROOT);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    return null;
  }
  return absolute;
}

/**
 * Turns the absolute path multer wrote into the relative one stored in the
 * database, with forward slashes so the value does not depend on the platform.
 */
export function toStoredComprobantePath(absolutePath: string): string {
  const root = path.resolve(UPLOADS_ROOT);
  const absolute = path.resolve(absolutePath);
  if (!absolute.startsWith(root + path.sep)) {
    return absolute;
  }
  return absolute.slice(root.length + 1).split(path.sep).join("/");
}

/** Removes a previously uploaded file, best effort (a missing file is fine). */
export function deleteComprobanteFile(fileName: string | null | undefined): void {
  const absolute = resolveComprobantePath(fileName);
  if (!absolute) {
    return;
  }
  try {
    if (fs.existsSync(absolute)) {
      fs.unlinkSync(absolute);
    }
  } catch (error) {
    console.error("[comprobantes] no se pudo borrar el archivo anterior:", error);
  }
}
