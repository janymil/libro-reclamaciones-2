import crypto from "crypto";
import fs from "fs";

/**
 * Cifrado en reposo de los adjuntos de evidencia.
 *
 * Los PDF/JPG/PNG que sube un consumidor pueden contener datos personales (un
 * DNI fotografiado, una factura con domicilio). La base de datos ya está cifrada
 * por el proveedor; estos archivos viven en el disco del servidor, así que se
 * cifran aquí, en la aplicación.
 *
 * Formato del archivo cifrado (todo binario, sin base64 para no inflar el 33%):
 *
 *   "LDR1" | versión (1 byte) | IV (12) | authTag (16) | ciphertext
 *
 * - AES-256-GCM: confidencialidad + integridad (un byte alterado hace fallar la
 *   autenticación al leer, en vez de devolver basura).
 * - IV aleatorio por archivo: nunca se reutiliza con la misma clave.
 * - El prefijo "LDR1" es lo que permite distinguir un archivo cifrado de uno
 *   antiguo en texto plano y servirlo igual: la migración es incremental.
 * - Versión reservada para rotar el formato sin romper lo ya cifrado.
 *
 * La clave se lee de ATTACHMENT_ENCRYPTION_KEY (32 bytes en base64). Sin clave
 * los archivos se guardan como antes: el servidor no puede descifrar lo que no
 * puede cifrar, pero NUNCA devuelve texto cifrado como si fuera un PDF.
 */

const MAGIC = Buffer.from("LDR1", "ascii");
const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HEADER_BYTES = MAGIC.length + 1 + IV_BYTES + TAG_BYTES;

/** Clave de cifrado, o `null` cuando el despliegue no la configuró. */
export function getAttachmentKey(): Buffer | null {
  const raw = process.env.ATTACHMENT_ENCRYPTION_KEY?.trim();
  if (!raw) {
    return null;
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== KEY_BYTES) {
    throw new Error(
      "ATTACHMENT_ENCRYPTION_KEY debe ser de 32 bytes en base64 (44 caracteres). Genérela con: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  return key;
}

/** `true` cuando este despliegue cifra los adjuntos nuevos. */
export function isAttachmentEncryptionEnabled(): boolean {
  return getAttachmentKey() !== null;
}

/** `true` cuando el contenido ya está cifrado con este formato. */
export function isEncryptedAttachment(payload: Buffer): boolean {
  return (
    payload.length >= HEADER_BYTES &&
    payload.subarray(0, MAGIC.length).equals(MAGIC) &&
    payload[MAGIC.length] === VERSION
  );
}

/** Cifra un contenido en memoria y devuelve el sobre listo para disco. */
export function encryptAttachmentPayload(plain: Buffer, key: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);

  return Buffer.concat([
    MAGIC,
    Buffer.from([VERSION]),
    iv,
    cipher.getAuthTag(),
    ciphertext,
  ]);
}

/**
 * Devuelve el contenido en claro. Un archivo antiguo (sin cabecera) se devuelve
 * tal cual; uno cifrado con otra clave o alterado lanza, para que la ruta
 * responda un error en vez de entregar basura.
 */
export function decryptAttachmentPayload(payload: Buffer, key: Buffer): Buffer {
  if (!isEncryptedAttachment(payload)) {
    return payload;
  }

  const ivStart = MAGIC.length + 1;
  const iv = payload.subarray(ivStart, ivStart + IV_BYTES);
  const tag = payload.subarray(ivStart + IV_BYTES, HEADER_BYTES);
  const ciphertext = payload.subarray(HEADER_BYTES);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Cifra un archivo en su sitio, de forma atómica: escribe `.enc` y renombra, así
 * un corte a mitad de proceso nunca deja la evidencia corrupta.
 *
 * Devuelve `true` solo si cifró algo. Es idempotente: un archivo ya cifrado (o un
 * despliegue sin clave) devuelve `false` sin tocarlo.
 */
export function encryptFileAtRest(
  absolutePath: string,
  key: Buffer | null = getAttachmentKey(),
): boolean {
  if (!key) {
    return false;
  }

  const payload = fs.readFileSync(absolutePath);
  if (isEncryptedAttachment(payload)) {
    return false;
  }

  const sealed = encryptAttachmentPayload(payload, key);
  const temporary = `${absolutePath}.enc`;
  // 0600: solo el usuario del proceso puede leer la evidencia.
  fs.writeFileSync(temporary, sealed, { mode: 0o600 });
  fs.renameSync(temporary, absolutePath);
  return true;
}
