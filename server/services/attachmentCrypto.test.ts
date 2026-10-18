import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

import { describe, expect, it } from "vitest";

import {
  decryptAttachmentPayload,
  encryptAttachmentPayload,
  encryptFileAtRest,
  getAttachmentKey,
  isEncryptedAttachment,
} from "./attachmentCrypto";

/**
 * Los adjuntos de evidencia contienen datos personales (una foto del DNI, una
 * factura con domicilio) y viven en el disco del servidor. Estas pruebas fijan
 * las tres propiedades de las que depende la ficha del encargado:
 *
 *  - el archivo en disco no contiene el contenido original;
 *  - un archivo antiguo (sin cabecera) se sigue leyendo igual;
 *  - una clave equivocada o un byte alterado fallan en vez de devolver basura.
 */

const keyA = crypto.randomBytes(32);
const keyB = crypto.randomBytes(32);
const pdf = Buffer.from("%PDF-1.7\nDNI 12345678\n", "utf8");

describe("attachmentCrypto", () => {
  it("round-trips a file and does not leave the plaintext on disk", () => {
    const sealed = encryptAttachmentPayload(pdf, keyA);

    expect(isEncryptedAttachment(sealed)).toBe(true);
    expect(sealed.subarray(0, 4).toString("ascii")).toBe("LDR1");
    expect(sealed.includes(Buffer.from("12345678"))).toBe(false);
    expect(decryptAttachmentPayload(sealed, keyA).equals(pdf)).toBe(true);
  });

  it("uses a different IV each time (same input, different bytes)", () => {
    const first = encryptAttachmentPayload(pdf, keyA);
    const second = encryptAttachmentPayload(pdf, keyA);

    expect(first.equals(second)).toBe(false);
    expect(decryptAttachmentPayload(second, keyA).equals(pdf)).toBe(true);
  });

  it("rejects a wrong key instead of returning garbage", () => {
    const sealed = encryptAttachmentPayload(pdf, keyA);
    expect(() => decryptAttachmentPayload(sealed, keyB)).toThrow();
  });

  it("rejects a tampered ciphertext (GCM authenticates the content)", () => {
    const sealed = encryptAttachmentPayload(pdf, keyA);
    sealed[sealed.length - 1] ^= 0xff;
    expect(() => decryptAttachmentPayload(sealed, keyA)).toThrow();
  });

  it("serves a legacy plaintext file unchanged", () => {
    expect(isEncryptedAttachment(pdf)).toBe(false);
    expect(decryptAttachmentPayload(pdf, keyA).equals(pdf)).toBe(true);
  });

  it("encrypts a file in place, atomically and idempotently", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ldr-attach-"));
    const file = path.join(directory, "evidence.pdf");
    fs.writeFileSync(file, pdf);

    expect(encryptFileAtRest(file, keyA)).toBe(true);
    const stored = fs.readFileSync(file);
    expect(isEncryptedAttachment(stored)).toBe(true);
    expect(decryptAttachmentPayload(stored, keyA).equals(pdf)).toBe(true);

    // Second run must not double-encrypt the evidence.
    expect(encryptFileAtRest(file, keyA)).toBe(false);
    expect(decryptAttachmentPayload(fs.readFileSync(file), keyA).equals(pdf)).toBe(true);

    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("does nothing when the deployment has no key", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "ldr-attach-"));
    const file = path.join(directory, "evidence.pdf");
    fs.writeFileSync(file, pdf);

    expect(encryptFileAtRest(file, null)).toBe(false);
    expect(fs.readFileSync(file).equals(pdf)).toBe(true);

    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("reads the key from the environment, and rejects a wrong length", () => {
    const previous = process.env.ATTACHMENT_ENCRYPTION_KEY;

    delete process.env.ATTACHMENT_ENCRYPTION_KEY;
    expect(getAttachmentKey()).toBeNull();

    process.env.ATTACHMENT_ENCRYPTION_KEY = keyA.toString("base64");
    expect(getAttachmentKey()?.equals(keyA)).toBe(true);

    process.env.ATTACHMENT_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => getAttachmentKey()).toThrow(/32 bytes/);

    if (previous === undefined) {
      delete process.env.ATTACHMENT_ENCRYPTION_KEY;
    } else {
      process.env.ATTACHMENT_ENCRYPTION_KEY = previous;
    }
  });
});
