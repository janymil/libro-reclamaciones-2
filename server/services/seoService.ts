import type { Express } from "express";

interface SeoArticleMeta {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: string;
  readTime: string;
  publishedTime: string;
  modifiedTime: string;
  author: string;
  image: string;
  keywords: string[];
}

export const SEO_ARTICLES: Record<string, SeoArticleMeta> = {
  "libro-fisico-vs-virtual-2026": {
    slug: "libro-fisico-vs-virtual-2026",
    title: "El libro de reclamaciones físico en 2026: el equivalente a seguir usando un fax",
    subtitle: "Llega el inspector a tu negocio y empieza la expedición debajo del mostrador. Por qué el cuaderno de papel es un riesgo innecesario y cómo resolverlo legalmente.",
    description: "Conoce por qué el Libro de Reclamaciones físico es un riesgo para tu negocio en 2026. Multas de hasta S/ 27,500 de Indecopi, hojas autocopiables y la solución virtual oficial.",
    category: "Fiscalización & MYPEs",
    readTime: "4 min de lectura",
    publishedTime: "2026-10-15T09:00:00-05:00",
    modifiedTime: "2026-10-20T12:00:00-05:00",
    author: "Equipo Editorial LibroDigital.pe",
    image: "https://librodigital.pe/assets/librodigital-promo-poster.webp",
    keywords: [
      "libro de reclamaciones fisico",
      "multas indecopi libro de reclamaciones",
      "libro de reclamaciones virtual peru",
      "ds 011 2011 pcm",
      "hojas autocopiables reclamaciones",
      "librodigital pe",
    ],
  },
  "cuidado-con-estos-5-clientes-libro-reclamaciones": {
    slug: "cuidado-con-estos-5-clientes-libro-reclamaciones",
    title: "Cuidado con estos 5 clientes que piden el libro de reclamaciones (y cómo no dejar que te arruinen el día)",
    subtitle: "Hay clientes que piden el libro de reclamaciones por 10 céntimos de vuelto. Y hay clientes que lo piden por si acaso. Estos son los que más se repiten y la estrategia para resolverlos en 2 minutos.",
    description: "Cómo atender a los 5 perfiles clásicos de clientes que piden el Libro de Reclamaciones en Perú: el del vuelto, el tiktoker, el abogado y cómo el QR digital te protege.",
    category: "Atención al Cliente & Ley",
    readTime: "5 min de lectura",
    publishedTime: "2026-10-18T10:00:00-05:00",
    modifiedTime: "2026-10-20T14:00:00-05:00",
    author: "Equipo Editorial LibroDigital.pe",
    image: "https://librodigital.pe/assets/tipos-clientes-poster.webp",
    keywords: [
      "clientes que piden libro de reclamaciones",
      "como atender reclamos indecopi",
      "atencion al cliente bodegas peruanas",
      "constancia reclamo digital",
      "codigo qr libro de reclamaciones",
    ],
  },
  "nadie-fiscaliza-a-las-mype-historias-reales-multas": {
    slug: "nadie-fiscaliza-a-las-mype-historias-reales-multas",
    title: "Nadie fiscaliza a las MYPE… hasta que sí. Historias reales de multas por el libro de reclamaciones",
    subtitle: "A mí no me van a fiscalizar. Casos reales de bodegas, tiendas online de maquillaje, notarías y restaurantes sancionados por Indecopi por un cartel faltante o un formulario web inexistente.",
    description: "Casos reales de multas de Indecopi: Valeria Basurco (S/ 15,000), Chifa Los Ángeles, notarías y BBVA Puno. Evita multas graves con el checklist de cumplimiento 2026.",
    category: "Jurisprudencia & Multas",
    readTime: "6 min de lectura",
    publishedTime: "2026-10-20T08:00:00-05:00",
    modifiedTime: "2026-10-20T16:00:00-05:00",
    author: "Equipo Editorial LibroDigital.pe",
    image: "https://librodigital.pe/assets/multas-reales-poster.webp",
    keywords: [
      "multas reales indecopi",
      "sanciones libro de reclamaciones",
      "valeria basurco multa indecopi",
      "chifa cajamarca indecopi",
      "cartel libro de reclamaciones obligatorio",
      "fiscalizacion mype indecopi 2026",
    ],
  },
  "vendi-solo-por-instagram-y-mercado-libre-indecopi": {
    slug: "vendi-solo-por-instagram-y-mercado-libre-indecopi",
    title: "Vendí solo por Instagram y Mercado Libre. ¿Por qué me cayó INDECOPI?",
    subtitle: "Spoiler: 'solo vendo por Instagram' no es un escudo anti-INDECOPI. Es, como mucho, un chaleco antibalas de cartón. Las 3 excusas que ya no valen tras la Ley 32495.",
    description: "La Ley 32495 obliga a tiendas de Instagram, WhatsApp y vendedores de Mercado Libre a tener Libro de Reclamaciones propio y exhibir el enlace visible. Evita multas con nuestro test de 60 segundos.",
    category: "Ley 32495 & Ecommerce",
    readTime: "5 min de lectura",
    publishedTime: "2026-10-20T21:00:00-05:00",
    modifiedTime: "2026-10-20T21:45:00-05:00",
    author: "Equipo Editorial LibroDigital.pe",
    image: "https://librodigital.pe/assets/chat-ley-poster.webp",
    keywords: [
      "ley 32495 libro de reclamaciones",
      "libro de reclamaciones instagram peru",
      "libro de reclamaciones mercado libre peru",
      "comercio electronico indecopi",
      "enlace libro reclamaciones bio instagram",
      "librodigital pe",
    ],
  },
};

export function buildArticleHtml(article: SeoArticleMeta, host: string): string {
  const canonicalUrl = `https://${host}/articulos/${article.slug}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    "headline": article.title,
    "description": article.description,
    "image": [article.image],
    "datePublished": article.publishedTime,
    "dateModified": article.modifiedTime,
    "author": {
      "@type": "Organization",
      "name": article.author,
      "url": `https://${host}`,
    },
    "publisher": {
      "@type": "Organization",
      "name": "LibroDigital.pe",
      "logo": {
        "@type": "ImageObject",
        "url": `https://${host}/icon.svg`,
      },
    },
    "keywords": article.keywords.join(", "),
    "articleSection": article.category,
    "inLanguage": "es-PE",
  };

  return `
    <title>${article.title} | LibroDigital.pe</title>
    <meta name="description" content="${article.description}">
    <meta name="keywords" content="${article.keywords.join(", ")}">
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">
    <link rel="canonical" href="${canonicalUrl}">
    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="LibroDigital.pe">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:title" content="${article.title}">
    <meta property="og:description" content="${article.description}">
    <meta property="og:image" content="${article.image}">
    <meta property="og:locale" content="es_PE">
    <meta property="article:published_time" content="${article.publishedTime}">
    <meta property="article:modified_time" content="${article.modifiedTime}">
    <meta property="article:section" content="${article.category}">
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${canonicalUrl}">
    <meta name="twitter:title" content="${article.title}">
    <meta name="twitter:description" content="${article.description}">
    <meta name="twitter:image" content="${article.image}">
    <!-- Schema.org JSON-LD -->
    <script type="application/ld+json">
      ${JSON.stringify(jsonLd)}
    </script>
  `;
}

export function buildHubHtml(host: string): string {
  const canonicalUrl = `https://${host}/articulos`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "name": "Guías, Casos Reales y Normativa del Libro de Reclamaciones",
    "description": "Artículos, análisis de multas de Indecopi y guías prácticas para MYPEs y comercios sobre el Libro de Reclamaciones en Perú.",
    "url": canonicalUrl,
    "publisher": {
      "@type": "Organization",
      "name": "LibroDigital.pe",
      "url": `https://${host}`,
    },
    "inLanguage": "es-PE",
  };

  return `
    <title>Guías, Multas y Normativa del Libro de Reclamaciones 2026 | LibroDigital.pe</title>
    <meta name="description" content="Aprende cómo evitar multas de Indecopi de hasta 5 UIT, gestionar reclamos en 15 días y cumplir la Ley 29571 con nuestras guías y casos reales analizados.">
    <meta name="keywords" content="libro de reclamaciones articulos, multas indecopi, fiscalizacion mype, normativa libro de reclamaciones, librodigital pe">
    <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">
    <link rel="canonical" href="${canonicalUrl}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="LibroDigital.pe">
    <meta property="og:url" content="${canonicalUrl}">
    <meta property="og:title" content="Guías y Casos Reales del Libro de Reclamaciones en el Perú">
    <meta property="og:description" content="Artículos de cumplimiento legal, análisis de sanciones de Indecopi y buenas prácticas para negocios y tiendas online.">
    <meta property="og:image" content="https://${host}/icon.svg">
    <meta property="og:locale" content="es_PE">
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">
      ${JSON.stringify(jsonLd)}
    </script>
  `;
}

export function buildSitemapXml(host: string): string {
  const baseUrl = `https://${host}`;
  const now = new Date().toISOString().split("T")[0];

  const staticRoutes = [
    { loc: `${baseUrl}/`, priority: "1.0", changefreq: "daily" },
    { loc: `${baseUrl}/articulos`, priority: "0.9", changefreq: "daily" },
    { loc: `${baseUrl}/normativa`, priority: "0.8", changefreq: "monthly" },
    { loc: `${baseUrl}/terminos`, priority: "0.5", changefreq: "yearly" },
    { loc: `${baseUrl}/privacidad`, priority: "0.5", changefreq: "yearly" },
    { loc: `${baseUrl}/aviso-legal`, priority: "0.5", changefreq: "yearly" },
    { loc: `${baseUrl}/contacto`, priority: "0.6", changefreq: "monthly" },
    { loc: `${baseUrl}/estado`, priority: "0.5", changefreq: "daily" },
    { loc: `${baseUrl}/accesibilidad`, priority: "0.4", changefreq: "yearly" },
  ];

  const articleRoutes = Object.values(SEO_ARTICLES).map((art) => ({
    loc: `${baseUrl}/articulos/${art.slug}`,
    priority: "0.9",
    changefreq: "weekly",
    lastmod: art.modifiedTime.split("T")[0],
  }));

  const allUrls = [...staticRoutes, ...articleRoutes];

  const xmlEntries = allUrls
    .map(
      (u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${(u as any).lastmod || now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlEntries}
</urlset>`;
}

export function registerSeoRoutes(app: Express): void {
  // sitemap.xml endpoint
  app.get("/sitemap.xml", (req, res) => {
    const host = req.get("host") || "librodigital.pe";
    res.header("Content-Type", "application/xml; charset=utf-8");
    res.send(buildSitemapXml(host));
  });
}
