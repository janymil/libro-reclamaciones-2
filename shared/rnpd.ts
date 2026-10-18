/**
 * Inscripción del banco de datos personales en el Registro Nacional de
 * Protección de Datos Personales (RNPD).
 *
 * Fuente única de verdad del trámite, compartida por el servidor (que calcula el
 * estado) y el cliente (que lo explica). Verificado en gob.pe, ficha de la ANPD
 * (MINJUSDH) "Inscribir banco de datos en el Registro Nacional de Protección de
 * Datos Personales", última actualización 22/05/2026:
 *
 *  - es obligatorio para todo titular de un banco de datos personales;
 *  - es gratuito y de aprobación automática, sujeto a fiscalización posterior;
 *  - se presenta por el SIPDP (Sistema Integrado de Protección de Datos
 *    Personales), de forma virtual;
 *  - al terminar se obtienen la constancia de inscripción y el código del banco
 *    de datos.
 *
 * Regla de redacción (la misma de `client/src/lib/legal-norms.ts`): aquí solo se
 * escribe lo que dice la ficha oficial. Si un dato no está publicado, no se
 * escribe.
 */
import { RETENTION_MONTHS } from './plans';

/** Ficha oficial del trámite en gob.pe. */
export const RNPD_PROCEDURE_URL =
  'https://www.gob.pe/8060-inscribir-banco-de-datos-en-el-registro-nacional-de-proteccion-de-datos-personales';

/** Plataforma donde se presenta la inscripción. */
export const SIPDP_URL = 'https://sipdp.minjus.gob.pe/sipdp-virtual/public/login.xhtml';

/** Mesa de ayuda publicada en la ficha del trámite. */
export const RNPD_SUPPORT = {
  phone: '(01) 204 8020, anexo 2410',
  phoneSchedule: 'lunes a viernes de 8:00 a. m. a 4:30 p. m.',
  email: 'registropdp@minjus.gob.pe',
} as const;

/** Fecha de la última revisión de la ficha oficial que respalda estos textos. */
export const RNPD_LAST_REVIEW = '22 de mayo de 2026';

/** Lo que la empresa declara (no lo que la plataforma verifica). */
export interface RnpdDeclaration {
  registered: boolean;
  /** Código del banco de datos que entrega el SIPDP al terminar. */
  code?: string | null;
}

/**
 * Actividad de tratamiento del Libro de Reclamaciones.
 *
 * No se le pide al cliente que la escriba: la plataforma conoce los campos del
 * Anexo I y la retención que aplica, así que la deriva de su propio
 * funcionamiento y él solo la confirma.
 */
export interface LibroProcessingActivity {
  activityName: string;
  purpose: string;
  legalBasis: string;
  retentionPeriod: string;
  dataCategories: string[];
  dataSubjects: string[];
  securityMeasures: string[];
}

export const LIBRO_PROCESSING_ACTIVITY: LibroProcessingActivity = {
  activityName: 'Libro de Reclamaciones',
  purpose:
    'Atender, tramitar y responder reclamos y quejas de consumidores, y conservar la constancia para la fiscalización.',
  // El Libro no se alimenta con consentimiento: el consumidor declara porque la
  // ley lo obliga (Ley N.° 29571, arts. 150-152, y DS N.° 011-2011-PCM).
  legalBasis: 'Obligación legal',
  retentionPeriod: `${RETENTION_MONTHS} meses`,
  dataCategories: [
    'Nombre y apellidos',
    'Documento de identidad',
    'Domicilio',
    'Teléfono',
    'Correo electrónico',
    'Detalle del reclamo',
  ],
  dataSubjects: ['Consumidores', 'Clientes'],
  securityMeasures: [
    'Acceso por roles',
    'Cifrado en tránsito (HTTPS)',
    'Registro de auditoría',
    'Respaldos',
  ],
};

/** `true` cuando la empresa declara tener el banco de datos ya inscrito. */
export const isRnpdRegistered = (row: { status: string } | null | undefined): boolean =>
  row?.status === 'compliant';

/** Texto de `notes` con el código del banco de datos, si se guardó. */
export const rnpdCodeFromNotes = (notes: string | null | undefined): string | null => {
  if (!notes) return null;
  const match = notes.match(/Código del banco de datos:\s*(.+)$/i);
  return match ? match[1].trim() : notes.trim() || null;
};
