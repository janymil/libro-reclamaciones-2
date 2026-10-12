import { PERU_HOLIDAY_DATES } from "@shared/peru-holidays";

export const COMPLAINT_TYPES = {
  reclamo: 'Reclamo',
  queja: 'Queja'
} as const;

export const COMPLAINT_STATUSES = {
  new: 'Nuevo',
  in_progress: 'En Proceso',
  responded: 'Respondido',
  resolved: 'Resuelto',
  overdue: 'Vencido'
} as const;

export const COMPLAINT_PRIORITIES = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente'
} as const;

export const DOCUMENT_TYPES = {
  DNI: 'DNI',
  CE: 'Carné de Extranjería',
  Pasaporte: 'Pasaporte'
} as const;

export const ARCO_REQUEST_TYPES = {
  access: 'Acceso a datos personales',
  rectification: 'Rectificación de datos',
  cancellation: 'Cancelación de datos',
  opposition: 'Oposición al tratamiento'
} as const;

export const COMPLIANCE_STATUSES = {
  compliant: 'Conforme',
  pending: 'Pendiente',
  overdue: 'Vencido',
  not_applicable: 'No Aplica'
} as const;

export const PERU_HOLIDAYS_2024_2026 = PERU_HOLIDAY_DATES;

/**
 * @deprecated Use {@link PERU_HOLIDAY_DATES} instead. Kept as an alias because
 * the list now also covers 2026, so the old "2024_2025" name is misleading.
 */
export const PERUVIAN_HOLIDAYS_2024_2025 = PERU_HOLIDAY_DATES;


export const LEGAL_RESPONSE_TIME_BUSINESS_DAYS = 15;

export const LEGAL_NOTICES = {
  COMPLAINT_DISCLAIMER: 'La presentación de esta hoja de reclamación no limita otras vías de solución ni constituye condición previa para denunciar ante las autoridades competentes.',
  RESPONSE_TIME: 'El proveedor deberá dar respuesta en un plazo no mayor a 15 días hábiles según DS 101-2022-PCM.',
  DATA_PROTECTION: 'Sus datos personales serán tratados conforme a la Ley N° 29733 de Protección de Datos Personales y su nuevo Reglamento DS 016-2024-JUS.'
} as const;

export const CONTACT_INFO = {
  INDECOPI_EMAIL: 'libroreclamaciones@indecopi.gob.pe',
  INDECOPI_PHONE: '224-7777',
  INDECOPI_WEBSITE: 'www.consumidor.gob.pe'
} as const;
