import { describe, it, expect } from "vitest";
import path from "path";
import {
  resolveMimeType,
  resolveAttachmentPath,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "./attachmentService";

describe("attachmentService", () => {
  it("accepts allow-listed MIME types", () => {
    expect(resolveMimeType({ originalname: "photo.png", mimetype: "image/png" })).toBe("image/png");
    expect(resolveMimeType({ originalname: "doc.pdf", mimetype: "application/pdf" })).toBe("application/pdf");
  });

  it("normalizes image/jpg to image/jpeg", () => {
    expect(resolveMimeType({ originalname: "photo.jpg", mimetype: "image/jpg" })).toBe("image/jpeg");
  });

  it("falls back to the extension for generic MIME types", () => {
    // Some clients send application/octet-stream for every part
    expect(resolveMimeType({ originalname: "evidencia.PDF", mimetype: "application/octet-stream" })).toBe(
      "application/pdf",
    );
    expect(resolveMimeType({ originalname: "foto.jpeg", mimetype: "binary/octet-stream" })).toBe("image/jpeg");
  });

  it("rejects files that are neither PDF nor JPG/PNG", () => {
    expect(resolveMimeType({ originalname: "virus.exe", mimetype: "application/octet-stream" })).toBeNull();
    expect(resolveMimeType({ originalname: "script.js", mimetype: "text/javascript" })).toBeNull();
    expect(resolveMimeType({ originalname: "noextension", mimetype: "application/octet-stream" })).toBeNull();
  });

  it("exposes the documented upload constraints", () => {
    expect(MAX_FILE_SIZE_BYTES).toBe(5 * 1024 * 1024);
    expect(ALLOWED_MIME_TYPES).toContain("application/pdf");
    expect(ALLOWED_MIME_TYPES).toContain("image/png");
  });

  it("blocks path traversal when resolving stored files", () => {
    expect(resolveAttachmentPath("../../etc/passwd")).toBeNull();
    expect(resolveAttachmentPath("2026/10/abc.pdf")).toContain(path.join("uploads", "2026", "10", "abc.pdf"));
  });
});
