/**
 * Identidad legal del operador de LibroDigital.pe y catálogo de sus documentos.
 *
 * Todo lo que un visitante puede saber sobre quién presta el servicio vive aquí:
 * el pie de la portada, la página de aviso legal, los términos y la política de
 * privacidad leen estos mismos valores, así que no hay forma de que se
 * contradigan entre sí. Cambiar el nombre del negocio, el RUC o el teléfono es
 * una sola línea.
 *
 * El servicio opera bajo el nombre de negocio "Servicios SAAS" (RUC
 * 10411592982). Solo se publica ese nombre de negocio a propósito: la web no
 * expone la condición del titular ante SUNAT, porque no es información que el
 * visitante necesite para contratar ni para reclamar. Si más adelante se
 * requiere publicar el nombre completo del titular, se agrega aquí y aparece en
 * todas las páginas a la vez.
 */

export interface OperatorIdentity {
  /** Nombre del negocio con el que opera la plataforma. */
  businessName: string;
  /** RUC del operador. */
  ruc: string;
  /** Teléfono tal como se publica (con espacios, para leerlo). */
  phone: string;
  /** El mismo teléfono en formato `tel:` (E.164, sin espacios). */
  phoneHref: string;
  /** Buzón público del servicio. Es también el canal de derechos ARCO. */
  email: string;
  /** Dominio público del servicio, sin protocolo. */
  website: string;
  /**
   * Domicilio del operador. Hoy queda vacío a propósito: el pie y las páginas
   * legales omiten la línea mientras esté vacío y la publican en cuanto se
   * complete. El Código de Protección y Defensa del Consumidor (Ley N.° 29571,
   * art. 2.1) pide el domicilio del proveedor en la contratación a distancia,
   * así que conviene completarlo antes de la campaña de marketing.
   */
  address: string;
}

export const OPERATOR: OperatorIdentity = {
  businessName: 'Servicios SAAS',
  ruc: '10411592982',
  phone: '+51 965 403 196',
  phoneHref: '+51965403196',
  email: 'hola@librodigital.pe',
  website: 'librodigital.pe',
  address: '',
};

/**
 * Libro de Reclamaciones del propio operador (art. 150 del Código y DS
 * 011-2011-PCM). Es un libro real alojado en la plataforma, con su slug público
 * `servicios-saas`; por eso la URL es absoluta: el aviso que exige el Anexo II y
 * los enlaces del pie deben funcionar igual desde cualquier dominio.
 *
 * Si algún día hubiera que retirarlo, basta con volver a `'#'`: la interfaz
 * muestra entonces el aviso de "enlace próximamente" (ver la constante de abajo)
 * en lugar de ofrecer un enlace roto.
 */
// `: string` on purpose: keeps the comparison below valid (a literal type would
// make `=== '#'` a compile error) so the "coming soon" switch still works if the
// URL is ever taken down.
export const LIBRO_DE_RECLAMACIONES_URL: string =
  'https://librodigital.pe/libro/servicios-saas';

/**
 * `true` mientras {@link LIBRO_DE_RECLAMACIONES_URL} siga siendo el marcador de
 * posición, para que la interfaz pueda avisarlo sin repetir la comparación. Hoy
 * apunta al libro real, así que ningún aviso de "próximamente" se muestra.
 */
export const LIBRO_DE_RECLAMACIONES_PENDING = LIBRO_DE_RECLAMACIONES_URL === '#';

/** Fecha de la última revisión de los documentos legales (texto ya formateado). */
export const LEGAL_LAST_UPDATED = '18 de octubre de 2026';

export interface LegalDocumentLink {
  href: string;
  label: string;
  /** `data-testid` del enlace, para las pruebas de extremo a extremo. */
  testId: string;
}

/**
 * Documentos públicos del servicio. Se usan en el pie de la portada y en la
 * navegación al final de cada documento legal, para que el visitante siempre
 * llegue desde cualquier página al resto sin volver a la portada.
 */
export const LEGAL_DOCUMENTS: LegalDocumentLink[] = [
  { href: '/terminos', label: 'Términos y condiciones', testId: 'link-terminos' },
  { href: '/privacidad', label: 'Política de privacidad', testId: 'link-privacidad' },
  { href: '/aviso-legal', label: 'Aviso legal', testId: 'link-aviso-legal' },
  { href: '/comprobantes', label: 'Boletas y facturas electrónicas', testId: 'link-comprobantes' },
  { href: '/normativa', label: 'Marco normativo', testId: 'link-normativa' },
  { href: '/encargado', label: 'Ficha del encargado', testId: 'link-encargado' },
  { href: '/accesibilidad', label: 'Accesibilidad y cookies', testId: 'link-accesibilidad' },
  { href: '/estado', label: 'Estado del servicio', testId: 'link-estado' },
];
