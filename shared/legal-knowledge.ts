/**
 * Curated, article-indexed knowledge base of the Peruvian rules that govern the
 * Libro de Reclamaciones and INDECOPI consumer protection.
 *
 * This is the retrieval corpus of the compliance co-pilot
 * (`server/services/agentService.ts`, tool `buscar_normativa`). It is plain data
 * plus a deterministic keyword search, so the model never invents the law: it can
 * only cite what a human reviewer wrote down here.
 *
 * Sources (keep aligned with `attached_assets/Pasted-Base-legal-*.txt`):
 *  - Ley N.° 29571 (Código de Protección y Defensa del Consumidor), arts. 24 y 152,
 *    modificados por la Ley N.° 31435 (15 días hábiles improrrogables).
 *  - DS 011-2011-PCM (Reglamento del Libro de Reclamaciones) y sus modificatorias
 *    DS 006-2014-PCM (avisos) y DS 101-2022-PCM (adecuación y Anexo 1).
 *  - Ley N.° 29733 y su nuevo Reglamento DS 016-2024-JUS (protección de datos).
 */

export interface LegalKnowledgeEntry {
  id: string;
  /** The norm the rule comes from, e.g. "DS 011-2011-PCM". */
  norm: string;
  /** The specific article, annex or section. */
  article: string;
  title: string;
  /** Extra search tokens (single words or short phrases). */
  keywords: string[];
  summary: string;
}

export interface LegalCitation {
  id: string;
  norm: string;
  article: string;
  title: string;
}

export interface LegalKnowledgeMatch {
  entry: LegalKnowledgeEntry;
  score: number;
  citation: LegalCitation;
}

export const LEGAL_KNOWLEDGE: LegalKnowledgeEntry[] = [
  {
    id: 'ley29571-arts-24-152',
    norm: 'Ley N.° 29571 (Código de Protección y Defensa del Consumidor)',
    article: 'Arts. 24 y 152',
    title: 'Reclamos y quejas: definición y obligación de atenderlos',
    keywords: ['reclamo', 'queja', 'definicion', 'respuesta', 'atender', 'consumidor', 'libro'],
    summary:
      'El reclamo es la disconformidad con el producto o servicio (no con la atención); la queja es el ' +
      'malestar respecto de la atención recibida. Todo proveedor está obligado a atender y dar respuesta a ' +
      'reclamos y quejas, dejando constancia en el Libro de Reclamaciones.',
  },
  {
    id: 'ley31435-plazo-15',
    norm: 'Ley N.° 31435 (modifica los arts. 24 y 152 del Código)',
    article: 'Plazo de respuesta',
    title: 'Plazo de respuesta: 15 días hábiles improrrogables',
    keywords: ['plazo', '15', 'dias', 'habiles', 'improrrogable', 'respuesta', 'vencimiento'],
    summary:
      'El proveedor debe dar respuesta a reclamos y quejas en un máximo de 15 días hábiles, improrrogables. ' +
      'Este plazo reemplazó al anterior de 30 días calendario con posibilidad de prórroga.',
  },
  {
    id: 'ds011-2011-pcm-anexo1',
    norm: 'DS 011-2011-PCM (Reglamento del Libro de Reclamaciones)',
    article: 'Anexo 1',
    title: 'Campos obligatorios de la Hoja de Reclamación',
    keywords: ['anexo', 'campos', 'hoja', 'denominacion', 'correlativo', 'identificacion', 'fecha', 'dni', 'detalle'],
    summary:
      'La Hoja (física o virtual) debe contener como mínimo: denominación, numeración correlativa y código de ' +
      'identificación, fecha, nombre y dirección del proveedor, datos del consumidor (nombre, domicilio, DNI/CE, ' +
      'teléfono y correo), datos del padre o representante si es menor de edad, identificación del producto o ' +
      'servicio, detalle de la reclamación, espacio para las acciones del proveedor y firma (o el mecanismo que la ' +
      'reemplace en el Libro virtual).',
  },
  {
    id: 'ds011-copia-constancia',
    norm: 'DS 011-2011-PCM',
    article: 'Copia al consumidor',
    title: 'Copia y constancia gratuita al consumidor',
    keywords: ['copia', 'constancia', 'imprimir', 'correo', 'gratuita', 'consumidor', 'email'],
    summary:
      'El Libro virtual debe permitir imprimir gratuitamente la constancia de la reclamación y, si el consumidor lo ' +
      'solicita, enviarla por correo electrónico.',
  },
  {
    id: 'ds011-conservacion',
    norm: 'DS 011-2011-PCM',
    article: 'Conservación y remisión a INDECOPI',
    title: 'Conservación por 2 años y entrega a INDECOPI',
    keywords: ['conservacion', 'retencion', 'anos', 'indecopi', 'copias', 'requerimiento', 'expediente', 'archivo'],
    summary:
      'El proveedor debe conservar las Hojas (físicas o virtuales) durante 2 años desde el registro. INDECOPI puede ' +
      'requerir copias en cualquier momento: el plazo del requerimiento no es menor a 3 días hábiles, o la entrega ' +
      'es inmediata en una verificación in situ.',
  },
  {
    id: 'ds011-varios-locales',
    norm: 'DS 011-2011-PCM',
    article: 'Varios establecimientos',
    title: 'Un Libro por establecimiento y código de identificación',
    keywords: ['establecimiento', 'local', 'sucursal', 'codigo', 'identificacion', 'consolidado', 'correlativo'],
    summary:
      'Debe existir un Libro por cada establecimiento. Si hay varios Libros físicos se usa un código de ' +
      'identificación para consolidar un registro único a nivel nacional. La numeración correlativa y el código ' +
      'deben aplicarse también al Libro virtual y a las exportaciones.',
  },
  {
    id: 'ds006-2014-aviso',
    norm: 'DS 006-2014-PCM',
    article: 'Anexo II y Anexo III',
    title: 'Aviso obligatorio del Libro (medidas y aviso web)',
    keywords: ['aviso', 'anexo', 'medidas', 'letras', 'web', 'visible', 'indecopi', 'portal'],
    summary:
      'El aviso obligatorio es de tamaño mínimo A4: la frase "Libro de Reclamaciones" con letras mínimas de 1x1 cm ' +
      'y el resto del texto con un mínimo de 0.5x0.5 cm. En portales web debe incluirse un aviso visible que enlace ' +
      'al Libro virtual (Anexo III), con la línea de ayuda de INDECOPI.',
  },
  {
    id: 'ds101-2022-pcm',
    norm: 'DS 101-2022-PCM',
    article: 'Adecuación del Reglamento',
    title: 'Adecuación a 15 días hábiles y nuevo Anexo 1',
    keywords: ['adecuacion', '15', 'dias', 'habiles', 'anexo', 'formato', 'reglamento', 'plazo'],
    summary:
      'El DS 101-2022-PCM adecúa el Reglamento del Libro de Reclamaciones al plazo de 15 días hábiles ' +
      'improrrogables introducido por la Ley 31435 y actualiza el formato del Anexo 1.',
  },
  {
    id: 'respuesta-escrita',
    norm: 'Código de Protección y Defensa del Consumidor',
    article: 'Art. 152',
    title: 'La respuesta debe constar por escrito',
    keywords: ['respuesta', 'escrita', 'carta', 'correo', 'acuse', 'recibo', 'evidencia'],
    summary:
      'La respuesta al consumidor debe constar por escrito (carta y/o correo electrónico, según lo solicitado por ' +
      'el consumidor). Mantenga evidencia y sello temporal del envío.',
  },
  {
    id: 'tipo-incorrecto',
    norm: 'DS 011-2011-PCM / Código',
    article: 'Calificación reclamo/queja',
    title: 'Si el consumidor marcó mal reclamo o queja',
    keywords: ['calificacion', 'tipo', 'reclamo', 'queja', 'error', 'tramite', 'corregir'],
    summary:
      'Si el consumidor marcó mal "queja" o "reclamo" pero del detalle se desprende que corresponde la otra figura, ' +
      'el proveedor debe tramitarlo conforme corresponda.',
  },
  {
    id: 'ley29733-datos',
    norm: 'Ley N.° 29733 (Protección de Datos Personales)',
    article: 'Principios y derechos ARCO',
    title: 'Protección de los datos personales del consumidor',
    keywords: ['datos', 'personales', 'privacidad', 'arco', 'acceso', 'rectificacion', 'cancelacion', 'oposicion', 'consentimiento', 'seguridad'],
    summary:
      'Los datos del consumidor en el Libro son datos personales: aplique los principios de finalidad, ' +
      'proporcionalidad y seguridad. El titular puede ejercer sus derechos ARCO (acceso, rectificación, ' +
      'cancelación y oposición) y el proveedor debe atenderlos en los plazos del Reglamento.',
  },
  {
    id: 'ds016-2024-jus',
    norm: 'DS 016-2024-JUS (nuevo Reglamento de la Ley 29733)',
    article: 'RNPD, ARCO e incidentes',
    title: 'Obligaciones del nuevo Reglamento de protección de datos',
    keywords: ['rnpd', 'registro', 'banco', 'datos', 'oficial', 'odp', 'incidentes', 'notificacion', 'reglamento'],
    summary:
      'El DS 016-2024-JUS (vigente desde el 30/03/2025) exige, según corresponda, la inscripción del banco de datos ' +
      'en el Registro Nacional de Protección de Datos Personales (RNPD), la designación del Oficial de Datos ' +
      'Personales (ODP) y la notificación de incidentes de seguridad.',
  },
  {
    id: 'sectores-regulados',
    norm: 'DS 011-2011-PCM',
    article: 'Sectores regulados',
    title: 'Sectores supervisados por SBS u organismos reguladores',
    keywords: ['sbs', 'regulado', 'servicios', 'publicos', 'supervisado', 'sectorial', 'osinergmin', 'osef'],
    summary:
      'Los sectores regulados o supervisados (por ejemplo SBS y servicios públicos regulados) pueden considerar sus ' +
      'propios sistemas de quejas y reclamos como implementación del Libro si dejan constancia, regulan plazos y ' +
      'permiten copia; se rigen por su normativa sectorial.',
  },
  {
    id: 'sla-d15-operativo',
    norm: 'Regla operativa (DS 101-2022-PCM)',
    article: 'Cómputo de días hábiles',
    title: 'Cómputo del plazo legal en la aplicación',
    keywords: ['plazo', 'dias', 'habiles', 'computo', 'feriados', 'vencimiento', 'calendario', 'alerta'],
    summary:
      'El plazo se computa desde la fecha de presentación de la reclamación. Los días hábiles excluyen sábados, ' +
      'domingos y feriados nacionales del Perú. Todo vencimiento debe calcularse con la calculadora de días ' +
      'hábiles de la aplicación, nunca "a mano".',
  },
  {
    id: 'libro-virtual',
    norm: 'DS 011-2011-PCM',
    article: 'Libro virtual',
    title: 'Libro virtual y venta por Internet',
    keywords: ['virtual', 'online', 'internet', 'web', 'portal', 'widget', 'constancia', 'venta'],
    summary:
      'Todo proveedor con establecimiento abierto al público debe contar con Libro físico o virtual; si vende por ' +
      'Internet, además debe ofrecer un Libro virtual accesible desde ese mismo medio.',
  },
  {
    id: 'venta-redes-sociales',
    norm: 'DS 011-2011-PCM',
    article: 'Libro virtual (venta por Internet)',
    title: 'Venta por Internet y redes sociales: el Libro virtual va en el mismo medio',
    keywords: ['instagram', 'whatsapp', 'tiktok', 'facebook', 'redes', 'sociales', 'marketplace', 'tienda', 'online', 'influencer', 'youtuber', 'streamer', 'creador', 'virtual'],
    summary:
      'La obligación no distingue el soporte: todo proveedor que vende por Internet (incluidas las redes sociales) debe ofrecer un Libro virtual ' +
      'accesible desde ese mismo medio y publicar el aviso del Anexo III con un enlace visible. Un chat no reemplaza al Libro: la hoja exige los ' +
      'campos del Anexo 1, la constancia gratuita al consumidor y la respuesta por escrito en 15 días hábiles.',
  },
];

/** Reduces an entry to the citation shape the agent reports back to the UI. */
export function citationOf(entry: LegalKnowledgeEntry): LegalCitation {
  return { id: entry.id, norm: entry.norm, article: entry.article, title: entry.title };
}

const STOPWORDS = new Set([
  'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'u', 'en', 'con', 'por', 'para',
  'que', 'del', 'al', 'se', 'lo', 'su', 'sus', 'mi', 'mis', 'me', 'te', 'le', 'les', 'es', 'son', 'esta',
  'este', 'esto', 'como', 'mas', 'pero', 'sobre', 'desde', 'hasta', 'cuando', 'donde', 'hay', 'han', 'ha',
  'he', 'ser', 'the', 'and', 'cual', 'cuales', 'cuanto', 'cuantos', 'cuanta', 'cuantas', 'debo', 'puedo',
]);

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function tokenize(text: string): string[] {
  return (normalize(text).match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length > 2 && !STOPWORDS.has(token),
  );
}

/**
 * Deterministic keyword search over {@link LEGAL_KNOWLEDGE}.
 *
 * Scoring weights matches in keywords (3) over the title/norm/article (2) over
 * the summary (1), and rewards exact multi-word keyword phrases. This is
 * intentionally simple and dependency-free: the corpus is small and the result
 * must be reproducible and auditable.
 */
export function searchLegalKnowledge(query: string, limit = 4): LegalKnowledgeMatch[] {
  const tokens = tokenize(query);
  const normalizedQuery = normalize(query);
  if (tokens.length === 0) return [];

  const scored = LEGAL_KNOWLEDGE.map((entry) => {
    const haystackMeta = normalize(`${entry.title} ${entry.norm} ${entry.article}`);
    const haystackKeywords = normalize(entry.keywords.join(' '));
    const haystackSummary = normalize(entry.summary);

    let score = 0;
    for (const token of tokens) {
      if (haystackKeywords.includes(token)) score += 3;
      if (haystackMeta.includes(token)) score += 2;
      if (haystackSummary.includes(token)) score += 1;
    }
    for (const keyword of entry.keywords) {
      if (keyword.includes(' ') && normalizedQuery.includes(normalize(keyword))) score += 4;
    }

    return { entry, score };
  });

  return scored
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((match) => ({ ...match, citation: citationOf(match.entry) }));
}
