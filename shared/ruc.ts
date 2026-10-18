/**
 * SUNAT RUC verification helpers (pure).
 *
 * The checkout asks SUNAT (through the existing RUC lookup proxy) whether the
 * RUC is active and whether the razón social the customer typed is the one
 * SUNAT has. The comparison cannot be a raw string equality: customers write
 * "Empresa SAC", SUNAT stores "EMPRESA SOCIEDAD ANONIMA CERRADA", and accents
 * and punctuation vary. Rejecting those would block legitimate invoices; the
 * normalizer below strips legal suffixes and compares token by token.
 *
 * Framework-free so the browser (instant feedback) and the server (the actual
 * guard) use exactly the same rule.
 */

const LEGAL_SUFFIX_TOKENS = new Set([
  "SA",
  "SAC",
  "SRL",
  "EIRL",
  "SAA",
  "SCRL",
  "SCS",
  "SOCIEDAD",
  "ANONIMA",
  "CERRADA",
  "COMERCIAL",
  "RESPONSABILIDAD",
  "LIMITADA",
  "INDIVIDUAL",
  // Punctuation removal turns "S.A.C." into the tokens S A C, so the initials
  // of the legal forms have to be recognized too.
  "S",
  "A",
  "C",
  "R",
  "L",
  "E",
  "I",
]);

/** Uppercase, no accents, no punctuation, single spaces. */
export function normalizeCompanyName(value: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drops the legal form at the end: "ACME S.A.C." -> "ACME". */
export function stripLegalSuffix(value: string): string {
  const tokens = normalizeCompanyName(value).split(" ").filter(Boolean);
  while (tokens.length > 1 && LEGAL_SUFFIX_TOKENS.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

/**
 * Whether the name the customer typed is recognizably the SUNAT razón social.
 *
 * Rules, in order:
 *   * equal after normalization and suffix removal;
 *   * the shorter name appears as whole words inside the longer one
 *     ("SUPERMERCADOS PERUANOS" vs "... SOCIEDAD ANONIMA");
 *   * every word of the shorter name (at least two) appears in the longer one.
 *
 * A one-word fragment ("SAN", "PERU") is not enough on its own, which is what
 * keeps "EMPRESA X" from matching "EMPRESA Y".
 */
export function companyNamesMatch(provided: string, sunat: string): boolean {
  const a = stripLegalSuffix(provided);
  const b = stripLegalSuffix(sunat);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }

  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const shortTokens = short.split(" ");

  // A single word is only trusted when it is a distinctive brand that opens
  // the SUNAT name ("RIMAC SEGUROS" is handled below; "PERU" is not a company).
  if (shortTokens.length === 1) {
    return short.length >= 6 && long.startsWith(`${short} `);
  }

  if (` ${long} `.includes(` ${short} `)) {
    return true;
  }

  const longTokens = new Set(long.split(" "));
  return shortTokens.every((token) => longTokens.has(token));
}

/**
 * SUNAT usability check. An explicit "BAJA" or "NO HABIDO" blocks the factura;
 * a provider that returns no estado/condición must not block a payment (the
 * lookup would be the problem, not the customer).
 */
export function isRucActive(
  estado?: string | null,
  condicion?: string | null,
): boolean {
  const estadoText = (estado ?? "").toUpperCase();
  const condicionText = (condicion ?? "").toUpperCase();

  if (!estadoText && !condicionText) {
    return true;
  }

  // "NO HABIDO" contains "HABIDO": a plain `.includes` would read it as usable.
  const estadoActivo =
    !estadoText || (estadoText.includes("ACTIVO") && !estadoText.startsWith("NO "));
  const condicionHabida =
    !condicionText || (condicionText.includes("HABIDO") && !condicionText.startsWith("NO "));

  return estadoActivo && condicionHabida;
}

/** One verified company, as the checkout receives it. */
export interface RucVerificationRecord {
  available: true;
  ruc: string;
  razonSocial: string;
  estado: string | null;
  condicion: string | null;
  suggestedAddress: string;
  source: string;
}

/** The lookup could not answer; the checkout may continue manually. */
export interface RucVerificationUnavailable {
  available: false;
  code: string;
  message: string;
}

export type RucVerification = RucVerificationRecord | RucVerificationUnavailable;
