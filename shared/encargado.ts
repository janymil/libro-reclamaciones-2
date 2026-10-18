/**
 * Ficha del encargado del tratamiento.
 *
 * Es lo que un cliente necesita para declarar a LibroDigital como encargado
 * ante la ANPD: quién trata los datos por su cuenta, dónde se alojan y con qué
 * medidas. Sin esto, la declaración del banco de datos queda incompleta.
 *
 * Datos verificados del despliegue:
 *  - Base de datos: Neon (PostgreSQL serverless) en AWS South America East 1
 *    (São Paulo, Brasil) -> hay flujo transfronterizo y el país es Brasil.
 *  - Adjuntos de evidencia: disco del servidor de aplicaciones (VPS),
 *    alojado en Estados Unidos (`ATTACHMENTS_DIR`, ver
 *    services/attachmentService.ts).
 *
 * Regla: si un dato no está confirmado, se deja vacío y la página omite la
 * línea. Nunca se publica una ubicación supuesta (mismo criterio que
 * `OPERATOR.address` en lib/platform-legal.ts).
 */
import { RETENTION_MONTHS } from './plans';

export interface HostingLocation {
  /** Qué se guarda ahí. */
  what: string;
  /** Proveedor o soporte técnico. */
  provider: string;
  /** Región tal como la publica el proveedor. Vacío = no confirmada. */
  region: string;
  /** País del alojamiento, para la declaración de flujo transfronterizo. */
  country: string;
  /** `true` cuando el dato sale del Perú. */
  abroad: boolean;
}

export const HOSTING_LOCATIONS: HostingLocation[] = [
  {
    what: 'Base de datos del Libro de Reclamaciones',
    provider: 'Neon (PostgreSQL serverless)',
    region: 'AWS South America East 1 (São Paulo)',
    country: 'Brasil',
    abroad: true,
  },
  {
    what: 'Archivos adjuntos de las reclamaciones (PDF, JPG, PNG)',
    provider: 'Servidor de aplicaciones de LibroDigital (VPS)',
    // Proveedor/ciudad no documentados en el repositorio: se publica el país,
    // que es lo que exige la declaración de flujo transfronterizo.
    region: '',
    country: 'Estados Unidos',
    abroad: true,
  },
];

/** Países de destino del flujo transfronterizo, sin repetir. */
export const HOSTING_COUNTRIES = Array.from(
  new Set(HOSTING_LOCATIONS.map((location) => location.country).filter(Boolean)),
);

/** Medidas que la plataforma aplica sobre los datos de sus clientes. */
export const ENCARGADO_SECURITY = [
  'Cifrado en reposo (AES-256) del almacenamiento de la base de datos, a cargo de Neon, el proveedor de la base.',
  'Cifrado en tránsito (SSL/TLS): la base de datos exige TLS en todas las conexiones, y el navegador se comunica con la aplicación por HTTPS.',
  'Acceso por roles: cada empresa ve solo sus propios reclamos, y solo un administrador puede escribir en el registro de actividades.',
  'Registro de auditoría de los cambios sobre los datos críticos.',
  'Respaldos de la base de datos y del volumen de adjuntos según el runbook de operación.',
  'Borrado automático al vencer la retención de ' + RETENTION_MONTHS + ' meses.',
  'Cifrado en reposo (AES-256-GCM) de los adjuntos de evidencia, con una clave propia del servicio que no se guarda junto a los archivos.',
  'Los adjuntos se guardan con nombres aleatorios fuera de la carpeta pública y solo los descarga un usuario autenticado de la empresa.',
  'El proveedor de la base de datos cuenta con SOC 2 Type 2 e ISO 27001/ISO 27701.',
];

/** Usos que el encargado NO puede dar a los datos del cliente. */
export const ENCARGADO_LIMITS = [
  'No usa los reclamos para marketing propio, análisis comerciales ni venta a terceros.',
  'No comparte los datos con otras empresas de la plataforma: cada cuenta está aislada.',
  'Solo trata los datos siguiendo las instrucciones de la empresa responsable y para el funcionamiento del servicio.',
];

/** Lo que la empresa debe declarar al inscribir su banco de datos. */
export const ENCARGADO_DECLARATION_HINTS = [
  'Que el tratamiento se apoya en un encargado: LibroDigital (Servicios SAAS).',
  'Que la base de datos se aloja fuera del Perú (Brasil y Estados Unidos), es decir, hay flujo transfronterizo.',
  'Que la finalidad es la gestión del Libro de Reclamaciones y la conservación para fiscalización.',
];
