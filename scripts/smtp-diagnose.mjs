import "./load-env.mjs";
import nodemailer from "nodemailer";

/**
 * Zoho SMTP diagnostic - "I configured it and nothing arrives, why?".
 *
 * Zoho's outgoing server details depend on two things that are invisible from the
 * application side:
 *
 *   * the PLAN: a paid organisation with a domain address (hola@librodigital.pe)
 *     uses `smtppro.zoho.com:465` for SSL, while personal accounts and free
 *     organisations use `smtp.zoho.com:465`;
 *   * the DATA CENTRE the mailbox lives in (`smtp.zoho.com` / `smtp.zoho.eu` /
 *     `smtp.zoho.in`), which is why the same credentials "work for a colleague"
 *     and not for you.
 *
 * Guessing costs an hour of "Error de autenticación". This script tries the
 * documented combinations, in order, and reports the first one that authenticates
 * - so the answer comes from the server instead of from a help page.
 *
 *   npm run email:diagnose                          # connect + authenticate
 *   npm run email:diagnose -- --send tu@correo.com  # ... then deliver a real message
 *
 * Credentials come from the environment or from the env file named by
 * `ENV_FILE` (SMTP_USER / SMTP_PASSWORD). Nothing is printed except the sender
 * and the server, never the password.
 */

const user = (process.env.SMTP_USER || "").trim();

/**
 * Zoho shows the app-specific password with spaces, and pasting it with the
 * spaces into an .env file produces an authentication error that looks exactly
 * like a wrong password. Strip them.
 */
const pass = (process.env.SMTP_PASSWORD || "").replace(/\s+/g, "");
const fromName = process.env.SMTP_FROM_NAME || "LibroDigital.pe";
const fromEmail = (process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || "").trim();
const rejectUnauthorized = process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false";

const sendTo = (() => {
  const index = process.argv.indexOf("--send");
  return index >= 0 ? (process.argv[index + 1] || "").trim() : "";
})();

if (!user) {
  console.error("SMTP_USER no está configurado en .env");
  process.exit(1);
}

if (!pass) {
  console.error(
    [
      "SMTP_PASSWORD está vacío en .env.",
      "",
      "Qué contraseña va aquí, según tu cuenta de Zoho:",
      "  * Sin verificación en dos pasos (2FA/TFA) en la cuenta: la contraseña",
      "    normal del buzón hola@librodigital.pe.",
      "  * Con 2FA/TFA activado: una contraseña específica de aplicación",
      "    (Zoho Accounts -> Seguridad -> Contraseñas de la aplicación ->",
      "     Generar nueva contraseña). Se muestra UNA sola vez.",
      "",
      "  El 2FA se configura en accounts.zoho.com, no dentro de Zoho Mail.",
    ].join("\n"),
  );
  process.exit(1);
}

/** Documented Zoho endpoints, most likely first. */
const candidates = [
  // Works for personal accounts, free organisations AND paid organisations.
  { host: "smtp.zoho.com", port: 587 },
  // Paid organisation with a domain address: implicit SSL.
  { host: "smtppro.zoho.com", port: 465 },
  // Personal account / free organisation: implicit SSL.
  { host: "smtp.zoho.com", port: 465 },
  // Other data centres, in case the mailbox is not in the global one.
  { host: "smtp.zoho.eu", port: 587 },
  { host: "smtppro.zoho.eu", port: 465 },
  { host: "smtp.zoho.in", port: 587 },
  { host: "smtppro.zoho.in", port: 465 },
];

// Whatever .env says is tried first: it is what the app will actually use.
if (process.env.SMTP_HOST) {
  candidates.unshift({
    host: process.env.SMTP_HOST.trim(),
    port: Number(process.env.SMTP_PORT || 465),
  });
}

const seen = new Set();
const toTry = candidates.filter(({ host, port }) => {
  const key = `${host}:${port}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

console.log(`Autenticando como ${user} (remitente: ${fromName} <${fromEmail}>)\n`);

let winner = null;

for (const { host, port } of toTry) {
  const secure = port === 465;
  const label = `${host}:${port} (${secure ? "SSL" : "STARTTLS"})`;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // Zoho answers slowly from some regions; a short timeout keeps the sweep
    // quick without hiding a reachable-but-busy server.
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: { rejectUnauthorized },
  });

  try {
    await transporter.verify();
    console.log(`  OK      ${label}`);
    winner = { transporter, host, port };
    break;
  } catch (error) {
    const code = error?.code || error?.responseCode || "?";
    const message = String(error?.response || error?.message || error).replace(/\s+/g, " ");
    console.log(`  FALLA   ${label} -> ${code}: ${message.slice(0, 160)}`);
  }
}

if (!winner) {
  console.error(
    [
      "",
      "Ninguna combinación autenticó. Qué revisar, en orden:",
      "  1. ¿La contraseña es la correcta para tu caso? Sin 2FA es la del buzón;",
      "     con 2FA es una contraseña específica de aplicación (se muestra una sola vez).",
      "  2. ¿El acceso IMAP/POP/SMTP está habilitado para el usuario? Lo controla el",
      "     administrador de Zoho Mail (admin console -> Usuarios -> el usuario ->",
      "     configuración de correo). Si está restringido, SMTP también falla.",
      "  3. ¿SMTP_FROM_EMAIL es exactamente el buzón autenticado (o un alias suyo)?",
      '     Zoho responde "Transmisión no permitida" si no coinciden.',
      "  4. Copia los datos exactos de tu cuenta: Zoho Mail -> Configuración ->",
      "     Cuentas de correo -> tu dirección -> 'Detalles de configuración del servidor'.",
    ].join("\n"),
  );
  process.exit(1);
}

console.log(
  [
    "",
    "Guardado en .env (y en el secret store de producción):",
    "",
    `  SMTP_HOST=${winner.host}`,
    `  SMTP_PORT=${winner.port}`,
    `  SMTP_USER=${(process.env.SMTP_USER || "").trim()}`,
    // No SMTP_SECURE on purpose: the port already decides the mode (465 = SSL,
    // anything else = STARTTLS), and suggesting a redundant line invites a stale
    // override later.
    "",
    winner.port === 465 ? "  (SSL implícito en el puerto 465)" : "  (STARTTLS por el puerto, sin SMTP_SECURE)",
  ]
    .filter(Boolean)
    .join("\n"),
);

if (!sendTo) {
  console.log("\nConexión y autenticación verificadas. Usa --send <correo> para una prueba real.");
  process.exit(0);
}

try {
  const info = await winner.transporter.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: sendTo,
    subject: `Prueba de correo - ${fromName}`,
    text: `Correo de prueba enviado desde ${fromEmail} vía ${winner.host}:${winner.port}.\n`,
  });

  const rejected = info.rejected ?? [];
  console.log(`\nEnviado a ${sendTo} (id ${info.messageId}).`);
  if (rejected.length) {
    console.error(`El servidor RECHAZÓ: ${rejected.join(", ")}`);
  }
} catch (error) {
  console.error(`\nLa autenticación funciona pero el envío falló: ${error?.message || error}`);
  process.exit(1);
}
