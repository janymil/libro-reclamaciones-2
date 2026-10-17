import { z } from "zod";

import { RETENTION_MONTHS } from "./plans";

/**
 * The privacy policy the public complaint form points at (Ley 29733).
 *
 * The consent checkbox used to link to `#`, i.e. to itself: the consumer read
 * "conforme a la Política de Privacidad … y la Ley N° 29733" and had nothing to
 * open, while the business could not fix it from the console because there was
 * nowhere to paste a URL. A business that already publishes a policy on its own
 * site can now point the link there; a business that has none gets the
 * platform-hosted policy of its book (`/libro/:slug/politica-de-privacidad`)
 * built from the data we already hold.
 *
 * Pure by design (no I/O, no framework), so it is unit-tested
 * (privacy-policy.test.ts): the console validates and previews the same value the
 * public page renders, and the URL is user input that ends up in an `href`, so it
 * is normalized in exactly one place.
 */

export const MAX_PRIVACY_POLICY_URL_LENGTH = 500;

/** Where the platform-hosted policy of a book lives. */
export function privacyPolicyPath(slug: string): string {
  return `/libro/${encodeURIComponent(slug)}/politica-de-privacidad`;
}

/**
 * Accepts an absolute http(s) URL and returns `null` for anything else.
 *
 * A bare domain ("miempresa.pe/politica-de-privacidad") is completed with
 * https:// because that is what an operator types, but `javascript:`, `data:`
 * and protocol-relative values ("//evil.example") are refused: the string is
 * rendered as an `href` on a public page, so the browser must not be the only
 * line of defence. A hostname without a dot is refused too - it is not a
 * consumer-facing website.
 */
export function normalizePrivacyPolicyUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // "//host/path" is protocol-relative: an operator does not mean to publish it,
  // and the URL parser would quietly turn it into https://host/path.
  if (trimmed.startsWith("//")) {
    return null;
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);

  let url: URL;
  try {
    url = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return null;
  }
  if (!url.hostname.includes(".")) {
    return null;
  }

  const normalized = url.toString();
  return normalized.length <= MAX_PRIVACY_POLICY_URL_LENGTH ? normalized : null;
}

/**
 * The value `PATCH /api/libro-configuration` accepts for `privacyPolicyUrl`:
 * an http(s) URL, `""`/`null` to clear it, or nothing at all to leave it alone.
 *
 * The three cases are kept distinct on purpose. Collapsing "absent" into `null`
 * would wipe the link every time the console saved an unrelated field, and
 * silently dropping an unusable value would tell the operator it was saved.
 */
export const privacyPolicyUrlSchema = z
  .union([z.string().max(MAX_PRIVACY_POLICY_URL_LENGTH), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" ? value.trim() : value))
  .superRefine((value, ctx) => {
    if (typeof value !== "string" || value === "") {
      return;
    }

    if (normalizePrivacyPolicyUrl(value) === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Ingrese un enlace http(s) válido (p. ej. https://miempresa.pe/politica-de-privacidad)",
      });
    }
  })
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null || value === "") {
      return null;
    }
    return normalizePrivacyPolicyUrl(value);
  });

/** Everything the hosted policy needs; all of it is already public in the book. */
export interface PrivacyPolicyInput {
  businessName: string;
  commercialName?: string | null;
  ruc: string;
  address: string;
  distrito?: string | null;
  provincia?: string | null;
  departamento?: string | null;
  /** Public consumer contact of the book, when the business configured it. */
  whatsappNumber?: string | null;
  websiteUrl?: string | null;
  /** Overridable so the text and the retention sweep can never disagree. */
  retentionMonths?: number;
}

export interface PrivacyPolicySection {
  title: string;
  paragraphs: string[];
}

export interface PrivacyPolicy {
  /** Who is responsible for the data, as the consumer sees the business. */
  responsible: {
    name: string;
    commercialName: string | null;
    ruc: string;
    address: string;
  };
  retentionMonths: number;
  /** Channels that actually work today, in the order a consumer would try them. */
  arcoChannels: string[];
  sections: PrivacyPolicySection[];
}

/**
 * Renders the policy text of a book.
 *
 * Built from the same data the PDF draft in pdfService uses (razón social, RUC,
 * domicilio, retention window), and just as deliberately *without* the
 * notification inbox: the public endpoints stopped exposing it because it is
 * internal contact data that only attracted spam, and a policy page is no reason
 * to leak it back.
 */
export function buildPrivacyPolicy(input: PrivacyPolicyInput): PrivacyPolicy {
  const retentionMonths = input.retentionMonths ?? RETENTION_MONTHS;

  const address = [input.address, input.distrito, input.provincia, input.departamento]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(", ");

  const whatsapp = input.whatsappNumber?.trim();
  const website = input.websiteUrl?.trim();

  const arcoChannels = [
    `En el domicilio del proveedor: ${address}.`,
    ...(whatsapp ? [`Por WhatsApp al ${whatsapp}.`] : []),
    ...(website ? [`A través de la página web ${website}.`] : []),
  ];

  return {
    responsible: {
      name: input.businessName,
      commercialName: input.commercialName?.trim() || null,
      ruc: input.ruc,
      address,
    },
    retentionMonths,
    arcoChannels,
    sections: [
      {
        title: "1. Marco normativo",
        paragraphs: [
          "La presente política se elabora conforme a la Ley N° 29733, Ley de Protección de Datos " +
            "Personales, y su Reglamento aprobado por DS N° 016-2024-JUS (publicado el 30 de noviembre de 2024).",
        ],
      },
      {
        title: "2. Finalidad del tratamiento",
        paragraphs: [
          "Los datos personales consignados en el Libro de Reclamaciones son tratados con la única " +
            "finalidad de atender y dar respuesta a los reclamos y quejas formulados por los consumidores.",
        ],
      },
      {
        title: "3. Datos recopilados",
        paragraphs: [
          "Nombres y apellidos, tipo y número de documento de identidad, domicilio, teléfono, correo " +
            "electrónico y la información referida al bien o servicio contratado.",
        ],
      },
      {
        title: "4. Consentimiento",
        paragraphs: [
          "El titular otorga su consentimiento libre, previo, expreso e informado para el tratamiento de " +
            "sus datos al momento de registrar la reclamación, salvo en los supuestos de excepción " +
            "previstos por ley.",
        ],
      },
      {
        title: "5. Plazo de conservación",
        paragraphs: [
          `Los datos personales de cada reclamación se conservan durante ${retentionMonths} meses desde su ` +
            "registro, plazo durante el cual el Libro de Reclamaciones debe permanecer a disposición de la " +
            "autoridad de consumo.",
          "Cumplido el plazo, los datos personales son anonimizados automáticamente y los archivos adjuntos " +
            "eliminados, conservándose únicamente los datos agregados exigidos por la normativa.",
        ],
      },
      {
        title: "6. Derechos ARCO",
        paragraphs: [
          "El titular puede ejercer sus derechos de acceso, rectificación, cancelación y oposición (ARCO) " +
            "en cualquier momento, sin costo, por los siguientes canales:",
        ],
      },
      {
        title: "7. Seguridad",
        paragraphs: [
          "Se adoptan medidas técnicas y organizativas razonables para resguardar la confidencialidad, " +
            "integridad y disponibilidad de los datos personales.",
        ],
      },
      {
        title: "8. Transferencias",
        paragraphs: [
          "No se realizan transferencias de datos personales a terceros salvo obligación legal o " +
            "autorización expresa del titular.",
        ],
      },
    ] as PrivacyPolicySection[],
  };
}
