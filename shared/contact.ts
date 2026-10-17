import { z } from "zod";

/**
 * Formulario de contacto del sitio público.
 *
 * Vive en `shared/` porque lo usan los dos lados: la página `/contacto` para
 * mostrar los errores campo por campo y `POST /api/contact` para rechazar lo que
 * no cumpla. Una sola definición evita el clásico "el navegador lo aceptó y el
 * servidor lo rechazó".
 *
 * El límite de 4000 caracteres no es una preferencia estética: el cuerpo se
 * convierte en un correo, y un texto sin tope es la forma más barata de llenar
 * el buzón de la empresa.
 */

export const CONTACT_SUBJECTS = [
  { id: "consulta", label: "Consulta general" },
  { id: "demo", label: "Quiero ver una demostración" },
  { id: "soporte", label: "Soporte con mi cuenta" },
  { id: "facturacion", label: "Facturación y pagos" },
  { id: "alianza", label: "Alianzas o prensa" },
  { id: "otro", label: "Otro tema" },
] as const;

export type ContactSubjectId = (typeof CONTACT_SUBJECTS)[number]["id"];

const SUBJECT_IDS = CONTACT_SUBJECTS.map((subject) => subject.id) as [
  ContactSubjectId,
  ...ContactSubjectId[],
];

export function contactSubjectLabel(id: ContactSubjectId): string {
  return CONTACT_SUBJECTS.find((subject) => subject.id === id)?.label ?? id;
}

export const contactMessageSchema = z.object({
  name: z
    .string({ required_error: "Escriba su nombre" })
    .trim()
    .min(2, "Escriba su nombre")
    .max(120, "El nombre es demasiado largo"),
  email: z
    .string({ required_error: "Escriba su correo" })
    .trim()
    .min(3, "Escriba su correo")
    .max(254, "El correo es demasiado largo")
    .email("Escriba un correo válido"),
  // Opcional: el visitante puede preferir que lo llamemos, pero no se lo exigimos.
  phone: z.string().trim().max(30, "El teléfono es demasiado largo").optional(),
  subject: z.enum(SUBJECT_IDS, { errorMap: () => ({ message: "Elija un motivo" }) }),
  message: z
    .string({ required_error: "Escriba su mensaje" })
    .trim()
    .min(10, "Cuéntenos un poco más (mínimo 10 caracteres)")
    .max(4000, "El mensaje es demasiado largo (máximo 4000 caracteres)"),
  // Consentimiento informado (Ley N.° 29733): sin él no se trata el dato.
  consent: z.literal(true, {
    errorMap: () => ({ message: "Debe aceptar el tratamiento de sus datos" }),
  }),
  /** Honeypot: invisible para las personas, lo llenan los bots. */
  website: z.string().max(0).optional(),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
