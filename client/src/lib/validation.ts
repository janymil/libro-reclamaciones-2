import { z } from "zod";
import {
  addPeruBusinessDays,
  countPeruBusinessDaysRemaining,
  isPeruBusinessDay,
} from "@shared/peru-holidays";

// Validation schemas for forms

export const complaintFormSchema = z.object({
  // Consumer data (mandatory fields from Anexo 1)
  consumerFullName: z.string().min(1, "Nombres y apellidos son obligatorios"),
  consumerDocumentType: z.enum(["DNI", "CE", "Pasaporte"], {
    required_error: "Tipo de documento es obligatorio",
  }),
  consumerDocumentNumber: z.string().min(1, "Número de documento es obligatorio"),
  consumerAddress: z.string().min(1, "Domicilio es obligatorio"),
  consumerPhone: z.string().min(1, "Teléfono es obligatorio"),
  consumerEmail: z.string().email("Email inválido"),
  
  // Guardian data (optional, for minors)
  guardianFullName: z.string().optional(),
  guardianDocumentType: z.enum(["DNI", "CE", "Pasaporte"]).optional(),
  guardianDocumentNumber: z.string().optional(),
  guardianRelationship: z.string().optional(),
  
  // Product/Service identification (mandatory)
  productServiceName: z.string().min(1, "Nombre del producto/servicio es obligatorio"),
  productServiceDescription: z.string().optional(),
  purchaseAmount: z.number().optional(),
  purchaseDate: z.string().optional(),
  receiptNumber: z.string().optional(),
  
  // Complaint details (mandatory)
  complaintType: z.enum(["reclamo", "queja"], {
    required_error: "Tipo de solicitud es obligatorio",
  }),
  complaintDetail: z.string().min(1, "Detalle de la reclamación es obligatorio"),
  consumerRequest: z.string().optional(),
  
  // Response method preference
  responseMethod: z.enum(["email", "letter"]).optional(),
  
  // Data protection consent (mandatory)
  consentGiven: z.boolean().refine((val) => val === true, {
    message: "Debe aceptar el tratamiento de datos personales",
  }),
});

export const establishmentFormSchema = z.object({
  name: z.string().min(1, "Nombre del establecimiento es obligatorio"),
  address: z.string().min(1, "Dirección es obligatoria"),
  phone: z.string().optional(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  identificationCode: z.string().min(1, "Código de identificación es obligatorio"),
});

export const arcoRequestSchema = z.object({
  requestType: z.enum(["access", "rectification", "cancellation", "opposition"], {
    required_error: "Tipo de solicitud es obligatorio",
  }),
  requesterName: z.string().min(1, "Nombre del solicitante es obligatorio"),
  requesterEmail: z.string().email("Email inválido"),
  requesterDocumentType: z.enum(["DNI", "CE", "Pasaporte"], {
    required_error: "Tipo de documento es obligatorio",
  }),
  requesterDocumentNumber: z.string().min(1, "Número de documento es obligatorio"),
  requestDetail: z.string().min(1, "Detalle de la solicitud es obligatorio"),
});

export const complaintResponseSchema = z.object({
  providerResponse: z.string().min(1, "Respuesta es obligatoria"),
  providerActions: z.string().optional(),
  responseMethod: z.enum(["email", "letter"]).default("email"),
});

// Validation functions

export function validateRuc(ruc: string): boolean {
  // Basic RUC validation for Peru (11 digits)
  if (!/^\d{11}$/.test(ruc)) {
    return false;
  }
  
  // Additional RUC validation logic could be added here
  return true;
}

export function validateDni(dni: string): boolean {
  // Basic DNI validation for Peru (8 digits)
  return /^\d{8}$/.test(dni);
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhone(phone: string): boolean {
  // Basic phone validation for Peru
  const cleanPhone = phone.replace(/\D/g, '');
  return cleanPhone.length >= 7 && cleanPhone.length <= 15;
}

// Business day validation.
//
// Delegates to `@shared/peru-holidays`, the single source of truth also used by
// the server's `businessDayCalculator`. The list that used to live here was
// missing 2024-07-23 and 2025-07-23 and stopped at 2025, so the deadline this
// module reported could disagree with the one the backend enforced.
export function isBusinessDay(date: Date): boolean {
  return isPeruBusinessDay(date);
}

// Business day maths: delegates to `@shared/peru-holidays`, the same code the
// server uses to compute the legally binding deadline. These wrappers are kept
// so existing form components keep their imports.
export function addBusinessDays(startDate: Date, businessDays: number): Date {
  return addPeruBusinessDays(startDate, businessDays);
}

export function getBusinessDaysRemaining(dueDate: Date, currentDate: Date = new Date()): number {
  return countPeruBusinessDaysRemaining(dueDate, currentDate);
}

export type ComplaintFormData = z.infer<typeof complaintFormSchema>;
export type EstablishmentFormData = z.infer<typeof establishmentFormSchema>;
export type ArcoRequestFormData = z.infer<typeof arcoRequestSchema>;
export type ComplaintResponseFormData = z.infer<typeof complaintResponseSchema>;
