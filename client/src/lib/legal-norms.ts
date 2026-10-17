/**
 * Las normas que gobiernan el Libro de Reclamaciones, con su enlace oficial.
 *
 * Cada entrada se verificó contra el repositorio oficial de normas del Estado
 * (gob.pe) antes de publicarse: el enlace del pie y de `/normativa` sale de aquí,
 * así que no hay forma de que un enlace apunte a la portada genérica de INDECOPI
 * mientras el texto habla de un artículo concreto.
 *
 * Dos leyes (31435 y 32495) no tienen página de norma propia en gob.pe: para
 * ellas se enlaza la nota oficial de INDECOPI que las explica (31435) o el
 * buscador de normas del Estado (32495). Nunca se inventa una URL de El Peruano.
 *
 * Regla de redacción: aquí solo se escribe lo que dice el texto de la norma. Si
 * un dato no está en la norma, no se publica.
 */

export interface LegalNorm {
  id: string;
  /** Etiqueta corta para el pie y las tarjetas. */
  label: string;
  /** Qué regula, en una línea. */
  summary: string;
  /** Artículos o anexos concretos que toca la aplicación. */
  articles: string;
  /** Fecha de publicación oficial. */
  published: string;
  href: string;
  /** Cómo se llama el enlace en la interfaz. */
  hrefLabel: string;
  /** `true` cuando `href` es la norma misma y no una nota o un buscador. */
  isPrimarySource: boolean;
}

export const LEGAL_NORMS: LegalNorm[] = [
  {
    id: 'ley-29571',
    label: 'Ley N.° 29571 · Código de Protección y Defensa del Consumidor',
    summary:
      'Crea el Libro de Reclamaciones (art. 150), obliga a exhibir el aviso o enlace (art. 151) y fija el plazo de respuesta (art. 152). Define además las cláusulas abusivas (arts. 49 y 50) y la escala de multas (art. 110).',
    articles: 'Arts. 24, 49-50, 110, 150, 151 y 152',
    published: '2 de setiembre de 2010',
    href: 'https://www.gob.pe/institucion/indecopi/normas-legales/1244218-29571',
    hrefLabel: 'Texto vigente (INDECOPI)',
    isPrimarySource: true,
  },
  {
    id: 'ley-31435',
    label: 'Ley N.° 31435 · Plazo de 15 días hábiles',
    summary:
      'Modifica los arts. 24 y 152 del Código: el proveedor debe atender y responder reclamos y quejas en un máximo de 15 días hábiles improrrogables. Rige desde el 21 de mayo de 2022.',
    articles: 'Arts. 24 y 152 del Código',
    published: '2022 (vigente desde el 21/05/2022)',
    href: 'https://www.gob.pe/institucion/indecopi/noticias/641594-modifican-reglamento-del-libro-de-reclamaciones-para-que-proveedores-atiendan-reclamos-y-quejas-de-clientes-en-15-dias-habiles',
    hrefLabel: 'Nota oficial de INDECOPI',
    isPrimarySource: false,
  },
  {
    id: 'ley-32495',
    label: 'Ley N.° 32495 · Plataformas digitales de comercio electrónico',
    summary:
      'Incorpora a las plataformas digitales de comercio electrónico a la obligación del Libro de Reclamaciones y al aviso o enlace visible, modificando los arts. 150 y 151 del Código. Su adecuación reglamentaria está pendiente (proyecto publicado en julio de 2026).',
    articles: 'Arts. 150 y 151 del Código',
    published: 'Ley vigente (adecuación reglamentaria pendiente)',
    href: 'https://www.gob.pe/busquedas?contenido%5B%5D=normas&term=Ley%2032495',
    hrefLabel: 'Buscar en gob.pe',
    isPrimarySource: false,
  },
  {
    id: 'ds-011-2011-pcm',
    label: 'DS N.° 011-2011-PCM · Reglamento del Libro de Reclamaciones',
    summary:
      'Aprueba el Reglamento (15 artículos y 2 anexos): quién está obligado, el formato de la hoja, la constancia gratuita al consumidor, la conservación de las hojas por 2 años y el aviso obligatorio.',
    articles: 'Reglamento, arts. 1-15 y Anexos I y II',
    published: '18 de febrero de 2011',
    href: 'https://www.gob.pe/institucion/indecopi/normas-legales/3462732-decreto-supremo-n-011-2011-pcm',
    hrefLabel: 'Texto (INDECOPI)',
    isPrimarySource: true,
  },
  {
    id: 'ds-006-2014-pcm',
    label: 'DS N.° 006-2014-PCM · Modifica el Reglamento',
    summary:
      'Modifica los arts. 2, 3.2, 4, 5, 6, 9, 11 y 12 y los Anexos I y II del Reglamento: aviso en tamaño A4 (título de 1x1 cm y texto de 0.5x0.5 cm), aviso web y reglas del libro virtual.',
    articles: 'Reglamento, arts. 2-6, 9, 11, 12 y Anexos I-II',
    published: '23 de enero de 2014',
    href: 'https://www.gob.pe/institucion/indecopi/normas-legales/5585125-006-2014-pcm',
    hrefLabel: 'Texto (INDECOPI)',
    isPrimarySource: true,
  },
  {
    id: 'ds-101-2022-pcm',
    label: 'DS N.° 101-2022-PCM · Adecuación a la Ley N.° 31435',
    summary:
      'Adecúa el Reglamento al plazo de 15 días hábiles de la Ley N.° 31435: modifica el numeral 3.4 del art. 6 y el literal b) del numeral 6-A.2, y aprueba el nuevo formato del Anexo I. No crea el plazo: lo traslada al Reglamento.',
    articles: 'Reglamento, arts. 6.3.4, 6-A.2.b y Anexo I',
    published: '15 de agosto de 2022',
    href: 'https://www.gob.pe/institucion/pcm/normas-legales/3346742-101-2022-pcm',
    hrefLabel: 'Texto y Anexo I (PCM)',
    isPrimarySource: true,
  },
  {
    id: 'ley-29733',
    label: 'Ley N.° 29733 · Protección de Datos Personales',
    summary:
      'Regula el tratamiento de los datos personales que el Libro recoge (nombre, documento, domicilio, teléfono, correo) y los derechos ARCO del titular.',
    articles: 'Ley completa y su Reglamento',
    published: '3 de julio de 2011',
    href: 'https://www.gob.pe/institucion/anpd/normas-legales/2018427-29733-2011',
    hrefLabel: 'Texto (ANPD)',
    isPrimarySource: true,
  },
  {
    id: 'ds-016-2024-jus',
    label: 'DS N.° 016-2024-JUS · Reglamento de Protección de Datos',
    summary:
      'Nuevo Reglamento de la Ley N.° 29733 (deroga el DS N.° 003-2013-JUS): principios, consentimiento, medidas de seguridad, derechos ARCO y obligaciones del responsable y del encargado.',
    articles: 'Reglamento completo',
    published: '30 de noviembre de 2024',
    href: 'https://www.gob.pe/institucion/anpd/normas-legales/6554453-16-2024-jus',
    hrefLabel: 'Texto (ANPD)',
    isPrimarySource: true,
  },
];


/** Las cinco normas que se muestran en el pie de la portada. */
export const FOOTER_NORM_IDS = [
  'ley-29571',
  'ley-31435',
  'ds-011-2011-pcm',
  'ds-101-2022-pcm',
  'ley-29733',
] as const;

export const FOOTER_NORMS: LegalNorm[] = FOOTER_NORM_IDS.map(
  (id) => LEGAL_NORMS.find((norm) => norm.id === id)!,
);

/**
 * Proyecto de Decreto Supremo que adecúa el Reglamento a la Ley N.° 32495.
 * Publicado para comentarios el 18/07/2026: **no está vigente**. Se muestra en
 * /normativa para que el cliente sepa que el Reglamento puede cambiar, sin
 * presentarlo como obligación actual.
 */
export const PENDING_BOOK_REGULATION = {
  label: 'Proyecto de DS que modifica el Reglamento (Ley N.° 32495)',
  summary:
    'Publicado para comentarios por la Resolución Ministerial N.° 244-2026-PCM. Aún no es norma vigente; cuando se apruebe, el Reglamento incorporará el aviso o enlace de las plataformas digitales de comercio electrónico.',
  published: '18 de julio de 2026',
  href: 'https://www.gob.pe/institucion/indecopi/normas-legales/8402939-244-2026-pcm',
} as const;

/**
 * UIT 2026 = S/ 5 500,00 (DS N.° 301-2025-EF, publicado el 17/12/2025). Es el
 * valor con el que se convierten las multas expresadas en UIT.
 */
export const UIT_2026 = 5500;
export const UIT_2026_NORM = {
  label: 'DS N.° 301-2025-EF · Valor de la UIT 2026 (S/ 5 500)',
  href: 'https://www.gob.pe/institucion/mef/normas-legales/7540449-301-2025-ef',
} as const;

/**
 * Topes de multa por gravedad (art. 110 del Código). Son topes: la norma dice
 * "hasta", y la multa concreta se calcula con los factores del propio artículo.
 */
export const FINE_CAPS = [
  { label: 'Infracción leve', uit: 50 },
  { label: 'Infracción grave', uit: 150 },
  { label: 'Infracción muy grave', uit: 450 },
] as const;
