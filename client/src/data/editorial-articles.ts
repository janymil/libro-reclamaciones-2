import type { LucideIcon } from 'lucide-react';
import {
  FileText,
  AlertTriangle,
  Scale,
  Sparkles,
  BookOpen,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Printer,
  QrCode,
} from 'lucide-react';

export interface EditorialArticle {
  slug: string;
  badge: string;
  category: string;
  readTime: string;
  publishedAt: string;
  title: string;
  subtitle: string;
  summary: string;
  heroVisual: 'coffee-notebook' | 'multas-scale' | 'qr-compliance';
  author: {
    name: string;
    role: string;
  };
  keyTakeaway: string;
}

export const EDITORIAL_ARTICLES: EditorialArticle[] = [
  {
    slug: 'libro-fisico-vs-virtual-2026',
    badge: 'Crónica & Realidad 2026',
    category: 'Fiscalización & MYPEs',
    readTime: '4 min de lectura',
    publishedAt: 'Octubre 2026',
    title: 'El libro de reclamaciones físico en 2026: el equivalente a seguir usando un fax',
    subtitle:
      'Llega el inspector a tu negocio y empieza la expedición debajo del mostrador. Por qué el cuaderno de papel es un riesgo innecesario y cómo resolverlo legalmente.',
    summary:
      'Una mirada franca a lo que pasa de verdad con el libro físico en bodegas, minimarkets y consultorios peruanos: multas desde S/ 2,750 hasta S/ 27,500, hojas rotas, manchas de café y la alternativa virtual con IA de LibroDigital.pe.',
    heroVisual: 'coffee-notebook',
    author: {
      name: 'Equipo Editorial LibroDigital.pe',
      role: 'Guías de cumplimiento normativo INDECOPI',
    },
    keyTakeaway:
      'El libro físico no es cualquier cuaderno: exige hojas autocopiables y numeradas. Perderlo o no mostrarlo cuesta hasta S/ 27,500 (5 UIT).',
  },
  {
    slug: 'cuidado-con-estos-5-clientes-libro-reclamaciones',
    badge: 'Atención al Cliente & Ley',
    category: 'MYPEs & Comercio',
    readTime: '5 min de lectura',
    publishedAt: 'Octubre 2026',
    title: 'Cuidado con estos 5 clientes que piden el libro de reclamaciones (y cómo no dejar que te arruinen el día)',
    subtitle:
      'Hay clientes que piden el libro de reclamaciones por 10 céntimos de vuelto. Y hay clientes que lo piden “por si acaso”. Estos son los que más se repiten y la estrategia para resolverlos en 2 minutos.',
    summary:
      'Del tiktoker en vivo al nostálgico del lapicero: cómo gestionar a los 5 perfiles clásicos de clientes con calma, sin discusiones y con un código QR que entrega constancia digital inmediata.',
    heroVisual: 'qr-compliance',
    author: {
      name: 'Equipo Editorial LibroDigital.pe',
      role: 'Guías de atención y resolución MYPE',
    },
    keyTakeaway:
      'El libro no es para pelear: con un QR visible que genera constancia en 1 minuto, el proceso es siempre el mismo para cualquier cliente y te protege de fiscalización.',
  },
  {
    slug: 'nadie-fiscaliza-a-las-mype-historias-reales-multas',
    badge: 'Casos Reales Indecopi',
    category: 'Jurisprudencia & Multas',
    readTime: '6 min de lectura',
    publishedAt: 'Octubre 2026',
    title: 'Nadie fiscaliza a las MYPE… hasta que sí. Historias reales de multas por el libro de reclamaciones',
    subtitle:
      '“A mí no me van a fiscalizar”. Casos reales de bodegas, tiendas online de maquillaje, notarías y restaurantes sancionados por Indecopi por un cartel faltante o un formulario web inexistente.',
    summary:
      'Desde la multa de S/ 15,000 a una influencer de maquillaje hasta sanciones a notarías por no tener el cartel visible: análisis de resoluciones oficiales de Indecopi y checklist de cumplimiento mínimo viable para 2026.',
    heroVisual: 'multas-scale',
    author: {
      name: 'Equipo Editorial LibroDigital.pe',
      role: 'Análisis de Jurisprudencia y Resoluciones INDECOPI',
    },
    keyTakeaway:
      'Arreglarlo después de que te llega la carta de Indecopi no borra la infracción. El libro debe estar publicado y operativo antes de cualquier reclamo o inspección.',
  },
  {
    slug: 'vendi-solo-por-instagram-y-mercado-libre-indecopi',
    badge: 'Comercio Online & Redes',
    category: 'Ley 32495 & Ecommerce',
    readTime: '5 min de lectura',
    publishedAt: 'Octubre 2026',
    title: 'Vendí solo por Instagram y Mercado Libre. ¿Por qué me cayó INDECOPI?',
    subtitle:
      'Spoiler: “solo vendo por Instagram” no es un escudo anti-INDECOPI. Es, como mucho, un chaleco antibalas de cartón. Las 3 excusas que ya no valen tras la Ley 32495.',
    summary:
      'Toda persona o negocio con RUC que vende habitualmente por Instagram, WhatsApp o marketplaces debe tener Libro de Reclamaciones propio y exhibir el enlace visible según la Ley 32495. Mini test de 60 segundos y guía práctica.',
    heroVisual: 'qr-compliance',
    author: {
      name: 'Equipo Editorial LibroDigital.pe',
      role: 'Especialistas en Ecommerce y Ley 32495',
    },
    keyTakeaway:
      'Vender por Instagram, DM o Mercado Libre no te exonera: si tienes RUC y vendes habitualmente a consumidores finales, necesitas tu propio libro y el enlace visible.',
  },
];
