import { describe, it, expect } from "vitest";

import {
  MAX_LOGO_SIZE_BYTES,
  deleteLogo,
  logoContentType,
  readLogoBuffer,
  resolveLogoMimeType,
  resolveLogoPath,
  saveLogo,
} from "./logoService";

/**
 * The business logo: what a consumer sees on the public book, in the
 * confirmation email and on the constancia.
 *
 * Pinned here: only images both mail clients and PDFKit can render are
 * accepted, the stored name is random (a tenant can never steer the path) and
 * nothing outside the logos directory can be addressed.
 */
describe("logoService", () => {
  it("accepts PNG and JPEG only", () => {
    expect(resolveLogoMimeType({ originalname: "logo.png", mimetype: "image/png" })).toBe("image/png");
    // Some clients declare every part as octet-stream: fall back to the extension.
    expect(resolveLogoMimeType({ originalname: "logo.jpeg", mimetype: "application/octet-stream" })).toBe("image/jpeg");

    // SVG is executable text and WebP cannot be embedded in the PDF.
    expect(resolveLogoMimeType({ originalname: "logo.svg", mimetype: "image/svg+xml" })).toBeNull();
    expect(resolveLogoMimeType({ originalname: "logo.webp", mimetype: "image/webp" })).toBeNull();
    expect(resolveLogoMimeType({ originalname: "hoja.pdf", mimetype: "application/pdf" })).toBeNull();
  });

  it("stores the upload under a random name and reads it back", () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const stored = saveLogo({ buffer, originalname: "mi-logo.png", mimetype: "image/png" });

    expect(stored).not.toBeNull();
    // Random name: the original file name never reaches the disk.
    expect(stored!.fileName).toMatch(/^[0-9a-f]{32}\.png$/);
    expect(stored!.size).toBe(buffer.length);
    expect(logoContentType(stored!.fileName)).toBe("image/png");
    expect(readLogoBuffer(stored!.fileName)?.equals(buffer)).toBe(true);

    expect(deleteLogo(stored!.fileName)).toBe(true);
    expect(readLogoBuffer(stored!.fileName)).toBeNull();
  });

  it("never resolves a path outside the logos directory", () => {
    expect(resolveLogoPath("../../.env")).toBeNull();
    expect(resolveLogoPath("..\\..\\.env")).toBeNull();

    const inside = resolveLogoPath("abc123.png");
    expect(inside).not.toBeNull();
    expect(inside!.endsWith("abc123.png")).toBe(true);
  });

  it("refuses a file that is not an accepted image", () => {
    expect(saveLogo({ buffer: Buffer.from("<svg/>"), originalname: "evil.svg", mimetype: "image/svg+xml" })).toBeNull();
    expect(saveLogo({ buffer: Buffer.from("x"), originalname: "evil.exe", mimetype: "application/octet-stream" })).toBeNull();
  });

  it("caps the upload at 1 MB", () => {
    expect(MAX_LOGO_SIZE_BYTES).toBe(1024 * 1024);
  });
});
