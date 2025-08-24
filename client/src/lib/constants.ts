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

export const PERUVIAN_HOLIDAYS_2024_2025 = [
  // 2024
  '2024-01-01', // Año Nuevo
  '2024-03-28', // Jueves Santo
  '2024-03-29', // Viernes Santo
  '2024-05-01', // Día del Trabajador
  '2024-06-29', // San Pedro y San Pablo
  '2024-07-23', // Día del Trabajador
  '2024-07-28', // Independencia del Perú
  '2024-07-29', // Independencia del Perú
  '2024-08-30', // Santa Rosa de Lima
  '2024-10-08', // Combate de Angamos
  '2024-11-01', // Todos los Santos
  '2024-12-08', // Inmaculada Concepción
  '2024-12-25', // Navidad
  
  // 2025
  '2025-01-01', // Año Nuevo
  '2025-04-17', // Jueves Santo
  '2025-04-18', // Viernes Santo
  '2025-05-01', // Día del Trabajador
  '2025-06-29', // San Pedro y San Pablo
  '2025-07-23', // Día del Trabajador
  '2025-07-28', // Independencia del Perú
  '2025-07-29', // Independencia del Perú
  '2025-08-30', // Santa Rosa de Lima
  '2025-10-08', // Combate de Angamos
  '2025-11-01', // Todos los Santos
  '2025-12-08', // Inmaculada Concepción
  '2025-12-25', // Navidad
];

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
