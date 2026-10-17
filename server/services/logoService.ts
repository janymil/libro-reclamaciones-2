import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

/**
 * The business's own logo.
 *
 * A consumer must recognize who holds their complaint, so the logo shows up in
 * three places: the public Libro de Reclamaciones, the confirmation email and
 * the constancia PDF. Files live on disk with a random name (never a
 * user-controlled path); the database keeps the metadata on
 * `libro_configuration` (logo_url, logo_file_name, logo_file_size,
 * logo_mime_type). The bytes are served by `GET /api/public/logos/:fileName`,
 * because an email client - and the public book - cannot authenticate.
 */

export const MAX_LOGO_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB

/**
 * PNG and JPEG only, on purpose: both render in every mail client AND are the
 * two formats PDFKit can embed in the constancia, so a single upload serves the
 * email, the public book and the printed receipt. SVG is executable text and
 * WebP cannot be embedded in the PDF.
 */
export const ALLOWED_LOGO_MIME_TYPES = ["image/png", "image/jpeg"] as const;

const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

/**
 * Effective MIME type of an upload (some clients send
 * `application/octet-stream` for every part, hence the extension fallback).
 * Returns null when the file is neither a PNG nor a JPEG, i.e. it must be
 * rejected.
 */
export function resolveLogoMimeType(file: { originalname: string; mimetype: string }): string | null {
  if ((ALLOWED_LOGO_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
    return file.mimetype;
  }

  const extension = file.originalname.slice(file.originalname.lastIndexOf(".")).toLowerCase();
  return EXTENSION_MIME_TYPES[extension] ?? null;
}

const LOGOS_DIR =
  process.env.ATTACHMENTS_DIR
    ? path.join(process.env.ATTACHMENTS_DIR, "logos")
    : path.resolve(import.meta.dirname, "..", "..", "uploads", "logos");

/** Multer in-memory upload: the validated bytes are written by `saveLogo`. */
export const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOGO_SIZE_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (resolveLogoMimeType(file)) {
      cb(null, true);
    } else {
      cb(new Error("El logo debe ser un archivo PNG o JPG"));
    }
  },
});

export interface StoredLogo {
  fileName: string;
  size: number;
  mimeType: string;
}

/**
 * Writes the validated upload to disk and returns its stored metadata, or null
 * when the file is not an accepted image type.
 */
export function saveLogo(file: { buffer: Buffer; originalname: string; mimetype: string }): StoredLogo | null {
  const mimeType = resolveLogoMimeType(file);
  if (!mimeType) {
    return null;
  }

  const extension = mimeType === "image/png" ? ".png" : ".jpg";
  const fileName = `${crypto.randomBytes(16).toString("hex")}${extension}`;

  fs.mkdirSync(LOGOS_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOGOS_DIR, fileName), file.buffer);

  return { fileName, size: file.buffer.length, mimeType };
}

/**
 * Absolute path of a stored logo, guarding against path traversal (the stored
 * name must live inside the logos directory).
 */
export function resolveLogoPath(fileName: string): string | null {
  const absolute = path.resolve(LOGOS_DIR, fileName);
  if (!absolute.startsWith(path.resolve(LOGOS_DIR) + path.sep)) {
    return null;
  }
  return absolute;
}

/** Content type for a stored logo, derived from the stored name (never input). */
export function logoContentType(fileName: string): string {
  return EXTENSION_MIME_TYPES[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";
}

/** Reads a stored logo for streaming back to a client (public route). */
export function readLogo(fileName: string): fs.ReadStream | null {
  const absolute = resolveLogoPath(fileName);
  if (!absolute || !fs.existsSync(absolute)) {
    return null;
  }
  return fs.createReadStream(absolute);
}

/** Reads a stored logo for a PDF (the constancia embeds the same file). */
export function readLogoBuffer(fileName: string): Buffer | null {
  const absolute = resolveLogoPath(fileName);
  if (!absolute || !fs.existsSync(absolute)) {
    return null;
  }
  try {
    return fs.readFileSync(absolute);
  } catch (error) {
    console.error("[logo] failed to read file:", error);
    return null;
  }
}

/** Deletes the stored file (used when the logo is replaced or removed). */
export function deleteLogo(fileName: string): boolean {
  const absolute = resolveLogoPath(fileName);
  if (!absolute || !fs.existsSync(absolute)) {
    return false;
  }
  try {
    fs.unlinkSync(absolute);
    return true;
  } catch (error) {
    console.error("[logo] failed to delete file:", error);
    return false;
  }
}
