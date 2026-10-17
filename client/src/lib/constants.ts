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
  // Art. 13 del Reglamento (DS 011-2011-PCM): el Libro no limita otras vías ni
  // es requisito previo para denunciar ante INDECOPI.
  COMPLAINT_DISCLAIMER:
    'La formulación de esta queja o reclamo no supone limitación alguna para utilizar otros mecanismos de solución de controversias ni constituye una vía previa necesaria para denunciar ante INDECOPI.',
  // El plazo nace en el art. 152 del Código, modificado por la Ley N.° 31435
  // (vigente desde el 21/05/2022); el DS 101-2022-PCM solo adecúa el Reglamento.
  RESPONSE_TIME:
    'El proveedor debe dar respuesta por escrito en un plazo no mayor a 15 días hábiles improrrogables (art. 152 del Código de Protección y Defensa del Consumidor, modificado por la Ley N.° 31435).',
  DATA_PROTECTION:
    'Sus datos personales serán tratados conforme a la Ley N.° 29733, Ley de Protección de Datos Personales, y su Reglamento aprobado por DS N.° 016-2024-JUS.',
} as const;

export const CONTACT_INFO = {
  INDECOPI_EMAIL: 'libroreclamaciones@indecopi.gob.pe',
  INDECOPI_PHONE: '224-7777',
  INDECOPI_WEBSITE: 'www.consumidor.gob.pe'
} as const;
