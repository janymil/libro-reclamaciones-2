import fs from "fs";
import path from "path";

import {
  encryptFileAtRest,
  getAttachmentKey,
  isEncryptedAttachment,
} from "../server/services/attachmentCrypto";

/**
 * Cifra los adjuntos que se guardaron antes de configurar la clave.
 *
 * Las subidas nuevas ya se cifran al guardarse; este script existe para el
 * despliegue que activa ATTACHMENT_ENCRYPTION_KEY con archivos antiguos en disco.
 * Es idempotente: los archivos ya cifrados se dejan intactos, así que se puede
 * ejecutar tantas veces como haga falta.
 *
 *   npm run attachments:encrypt
 *
 * Usa el mismo ENV_FILE que el servidor (ver scripts/load-env.mjs).
 */

const envFile = (process.env.ENV_FILE || "").trim()
  ? path.resolve(process.env.ENV_FILE as string)
  : path.resolve(import.meta.dirname, "..", ".env");
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const root =
  process.env.ATTACHMENTS_DIR ||
  path.resolve(import.meta.dirname, "..", "uploads");

const key = getAttachmentKey();
if (!key) {
  console.error(
    "ATTACHMENT_ENCRYPTION_KEY no está configurada: no hay nada que cifrar.\n" +
      "Genere una con: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
  );
  process.exit(1);
}

if (!fs.existsSync(root)) {
  console.log(`No existe ${root}: no hay adjuntos que cifrar.`);
  process.exit(0);
}

/**
 * Todas las rutas de adjunto bajo el directorio de subidas.
 *
 * Solo `AAAA/MM/...`, que es exactamente donde multer guarda la evidencia de una
 * reclamación. `uploads/logos/` queda fuera a propósito: son imágenes públicas
 * de marca, no datos personales, y se sirven en claro.
 */
function walk(directory: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolute, found);
    } else if (!entry.name.endsWith(".enc") && !entry.name.endsWith(".tmp")) {
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (/^\d{4}\/\d{2}\//.test(relative)) {
        found.push(absolute);
      }
    }
  }
  return found;
}

const files = walk(root);
let encrypted = 0;
let already = 0;
let failed = 0;

for (const file of files) {
  try {
    if (isEncryptedAttachment(fs.readFileSync(file))) {
      already += 1;
      continue;
    }
    if (encryptFileAtRest(file, key)) {
      encrypted += 1;
    } else {
      already += 1;
    }
  } catch (error) {
    failed += 1;
    console.error(`No se pudo cifrar ${file}:`, error);
  }
}

console.log(
  `Adjuntos: ${files.length} · cifrados ahora: ${encrypted} · ya cifrados: ${already} · errores: ${failed}`,
);

if (failed > 0) {
  process.exit(1);
}
