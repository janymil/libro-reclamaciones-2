import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { BrandMark, StampMark, QrGlyph } from '@/components/landing/brand';
import BackToTop from '@/components/layout/back-to-top';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  HelpCircle,
  Lightbulb,
  Mail,
  Phone,
  QrCode,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Timer,
} from 'lucide-react';
import {
  CoffeeStainVisual,
  FinesVisual,
  ModernLibroVisual,
  PromotionalCallout,
  PromoVideoCard,
} from '@/components/blog/article-visuals';
import { EDITORIAL_ARTICLES } from '@/data/editorial-articles';
import { OPERATOR, LEGAL_DOCUMENTS } from '@/lib/platform-legal';
import { SeoHead } from '@/components/seo/seo-head';

export default function ArticlePage() {
  const article = EDITORIAL_ARTICLES[0];
  const [copied, setCopied] = useState(false);

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="landing-root landing-paper min-h-screen">
      <SeoHead
        title={article.title}
        description={article.summary}
        type="article"
        publishedTime="2026-10-15T09:00:00-05:00"
        author={article.author.name}
        ogImage="https://librodigital.pe/assets/librodigital-promo-poster.webp"
        keywords={[
          'libro de reclamaciones fisico',
          'multas indecopi libro de reclamaciones',
          'libro de reclamaciones virtual peru',
          'ds 011 2011 pcm',
          'hojas autocopiables reclamaciones',
          'librodigital pe',
        ]}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          'headline': article.title,
          'description': article.summary,
          'image': ['https://librodigital.pe/assets/librodigital-promo-poster.webp'],
          'datePublished': '2026-10-15T09:00:00-05:00',
          'dateModified': '2026-10-20T12:00:00-05:00',
          'author': {
            '@type': 'Organization',
            'name': article.author.name,
          },
          'publisher': {
            '@type': 'Organization',
            'name': 'LibroDigital.pe',
            'logo': {
              '@type': 'ImageObject',
              'url': 'https://librodigital.pe/icon.svg',
            },
          },
          'inLanguage': 'es-PE',
        }}
      />

      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-[#e3d9c6] bg-[#f7f2e8]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Ir a la portada">
            <BrandMark />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/articulos"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#5c5246] hover:text-[#c02b0a]"
            >
              <BookOpenCheck className="h-4 w-4" />
              Guías & Artículos
            </Link>
            <Link href="/acceso?modo=registro">
              <Button size="sm" className="bg-[#c02b0a] hover:bg-[#9c2107] text-white font-medium text-xs">
                Probar LibroDigital.pe gratis
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Article Content */}
      <main id="main-content" className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        {/* Navigation Breadcrumb */}
        <nav aria-label="Miga de pan" className="mb-6 flex items-center gap-2 text-xs font-mono text-[#8a7a67]">
          <Link href="/" className="hover:text-[#c02b0a] flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Inicio
          </Link>
          <span>/</span>
          <Link href="/articulos" className="hover:text-[#c02b0a]">
            Artículos
          </Link>
          <span>/</span>
          <span className="text-[#1b1611] font-semibold truncate max-w-[200px] sm:max-w-none">
            El libro físico en 2026
          </span>
        </nav>

        {/* Article Metadata Header */}
        <header className="border-b border-[#e3d9c6] pb-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#c02b0a] px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-white">
              {article.badge}
            </span>
            <span className="rounded-full bg-[#e8deca] px-3 py-1 font-mono text-[11px] font-medium text-[#5c5246]">
              {article.category}
            </span>
            <span className="flex items-center gap-1 font-mono text-xs text-[#8a7a67] ml-auto">
              <Clock className="h-3.5 w-3.5" /> {article.readTime}
            </span>
          </div>

          <h1 className="mt-5 text-balance font-display text-3xl font-extrabold tracking-tight text-[#1b1611] sm:text-4xl md:text-5xl leading-[1.15]">
            {article.title}
          </h1>

          <p className="mt-4 text-pretty text-lg leading-relaxed text-[#5c5246] font-medium">
            {article.subtitle}
          </p>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#e3d9c6]/60 text-xs text-[#5c5246]">
            <div>
              <span className="font-semibold text-[#1b1611] block">{article.author.name}</span>
              <span className="text-[11px]">{article.author.role} · {article.publishedAt}</span>
            </div>

            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#d6c7b0] bg-white px-3 py-1.5 text-xs font-mono text-[#1b1611] hover:bg-[#fbf7ed] transition-colors"
            >
              <Share2 className="h-3.5 w-3.5" />
              {copied ? '¡Enlace copiado!' : 'Compartir artículo'}
            </button>
          </div>
        </header>

        {/* Key Takeaway Box */}
        <div className="my-8 rounded-xl border-l-4 border-[#c02b0a] bg-[#fbf7ed] p-4 text-sm shadow-sm">
          <div className="flex items-start gap-2.5">
            <Flame className="h-5 w-5 text-[#c02b0a] shrink-0 mt-0.5" />
            <div>
              <strong className="font-mono text-xs uppercase tracking-wider text-[#c02b0a] block mb-1">
                Punto Clave para todo negocio peruano
              </strong>
              <p className="text-[#3d2f21] font-medium leading-relaxed">
                {article.keyTakeaway}
              </p>
            </div>
          </div>
        </div>

        {/* Article Body - Preserving EXACT text requested by user */}
        <article className="prose prose-stone max-w-none text-[#1b1611] leading-relaxed">
          {/* Paragraph 1 */}
          <p className="text-lg leading-relaxed">
            Llega el inspector a tu bodega, tu minimarket o tu consultorio. Saluda, sonríe, y te pide lo de siempre:
          </p>

          <blockquote className="my-4 border-l-2 border-[#8a7258] pl-4 italic text-[#4a3b2c] bg-[#f4ece1]/40 py-2 rounded-r">
            <p className="font-semibold text-[#1b1611]">- Buenas. ¿Me muestra su Libro de Reclamaciones?</p>
            <p className="mt-2">Tú, con la confianza de quien lo vio por última vez en la gestión anterior:</p>
            <p className="mt-1 font-semibold text-[#1b1611]">- Eh… sí, sí, está por ahí.</p>
            <p className="mt-2 font-semibold text-[#1b1611]">- ¿Por ahí dónde?</p>
          </blockquote>

          <p className="text-base leading-relaxed">
            Empieza la expedición. Debajo del mostrador, detrás de las cajas de gaseosa, en el cajón donde guardas los cargadores que no sirven. Lo encuentras. Tiene una mancha de café con forma de Bolivia, y alguien arrancó una hoja para anotar un pedido.
          </p>

          {/* VISUAL 1: The Coffee Stain and Lost Notebook */}
          <CoffeeStainVisual />

          <p className="text-base leading-relaxed">
            Felicidades: acabas de descubrir por qué el libro físico es el fax de los negocios peruanos. Todo el mundo sabe que existe, nadie lo quiere, y cuando falla, falla en el peor momento.
          </p>

          <p className="text-base leading-relaxed">
            Vamos a ver qué pasa de verdad con el libro físico, qué cambia con el virtual y, sobre todo, cómo no pagar una multa por un cuaderno.
          </p>

          {/* Section: Lo que el libro físico te exige */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Lo que el libro físico te exige (y casi nadie recuerda)
          </h2>

          <p className="text-base leading-relaxed mt-4">
            El libro físico no es cualquier cuaderno de tapa dura que compraste en el mercado. Según el Anexo del DS 011-2011-PCM, necesita hojas numeradas y auto copiables. Es decir, hojas con numeración y copia incorporada, para que el cliente se lleve la suya.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Traducción: es un objeto con reglas. Y los objetos con reglas, guardados bajo un mostrador, tienden a incumplirlas todas.
          </p>

          {/* Promotional Bridge 1 */}
          <PromotionalCallout
            badge="¿Sabías esto?"
            title="Con LibroDigital.pe no tienes que vigilar hojas numeradas"
            description="Cada reclamo genera automáticamente su código correlativo único oficial y entrega constancia digital inmediata al correo de tu cliente. Cero papeles, cero carbón y 100% legal."
            buttonText="Ver cómo funciona"
            buttonHref="/#como-funciona"
          />

          {/* Section: La multa */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            La multa: lo que cuesta no tener el libro (o no mostrarlo)
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Aquí no te voy a asustar con cifras inventadas. Solo con las reales.
          </p>

          <p className="text-base leading-relaxed mt-3">
            No contar con un libro válido, o no tener visible el aviso que informa que lo tienes, puede significar una multa desde 0.5 hasta 5 UIT, según el tamaño de la empresa. La UIT 2026 es de S/ 5,500. Hagamos la cuenta:
          </p>

          {/* Exact table from text with enhanced styling */}
          <div className="my-6 overflow-x-auto rounded-xl border border-[#d6c7b0] bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#f2ebdc] text-[#1b1611] font-mono text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3.5 border-b border-[#d6c7b0]">Concepto</th>
                  <th className="p-3.5 border-b border-[#d6c7b0]">UIT</th>
                  <th className="p-3.5 border-b border-[#d6c7b0]">En soles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e3d9c6]">
                <tr className="hover:bg-[#fbf7ed]">
                  <td className="p-3.5 font-medium text-[#1b1611]">Multa mínima posible</td>
                  <td className="p-3.5 font-mono">0.5 UIT</td>
                  <td className="p-3.5 font-mono font-bold text-red-700">S/ 2,750</td>
                </tr>
                <tr className="hover:bg-[#fbf7ed] bg-red-50/30">
                  <td className="p-3.5 font-medium text-[#1b1611]">Multa máxima posible</td>
                  <td className="p-3.5 font-mono">5 UIT</td>
                  <td className="p-3.5 font-mono font-bold text-red-800">S/ 27,500</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* VISUAL 2: Fines Visual Graphic */}
          <FinesVisual />

          <p className="text-base leading-relaxed">
            Cuál te toca dentro de ese rango depende del tamaño de tu empresa. Pero incluso el extremo bajo da para varios meses de gaseosas, pan y paciencia.
          </p>

          <p className="text-base leading-relaxed mt-3 font-semibold text-[#8a2c12]">
            Y todo por un libro. Uno de papel.
          </p>

          {/* Section: Físico vs. virtual */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Físico vs. virtual: qué pasa en la práctica
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Olvidemos la teoría. Esto es lo que vive un negocio de verdad:
          </p>

          {/* Exact table comparing Physical vs Virtual */}
          <div className="my-6 overflow-x-auto rounded-xl border border-[#d6c7b0] bg-white shadow-sm">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-[#1b1611] text-[#f7f2e8] font-mono text-xs uppercase tracking-wider">
                <tr>
                  <th className="p-3.5">Situación</th>
                  <th className="p-3.5 text-amber-200">Libro físico</th>
                  <th className="p-3.5 text-emerald-300">Libro virtual (LibroDigital.pe)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e3d9c6]">
                <tr className="hover:bg-[#fbf7ed]">
                  <td className="p-3.5 font-semibold text-[#1b1611]">Dónde está</td>
                  <td className="p-3.5 text-red-800">“Por ahí”, bajo el mostrador</td>
                  <td className="p-3.5 text-[#1e6b4a] font-medium">
                    En un enlace o sistema, siempre ubicable{' '}
                    <Link href="/#producto" className="text-[#c02b0a] underline text-xs ml-1">
                      (ver portal)
                    </Link>
                  </td>
                </tr>
                <tr className="hover:bg-[#fbf7ed]">
                  <td className="p-3.5 font-semibold text-[#1b1611]">Hojas</td>
                  <td className="p-3.5 text-red-800">Numeradas y auto copiables; si falta una, hay problema</td>
                  <td className="p-3.5 text-[#1e6b4a] font-medium">
                    Cada reclamo genera su código correlativo único automáticamente
                  </td>
                </tr>
                <tr className="hover:bg-[#fbf7ed]">
                  <td className="p-3.5 font-semibold text-[#1b1611]">Copia para el cliente</td>
                  <td className="p-3.5 text-[#5c5246]">La hoja auto copiable</td>
                  <td className="p-3.5 text-[#1e6b4a] font-medium">
                    Por correo o impresión con constancia en PDF
                  </td>
                </tr>
                <tr className="hover:bg-[#fbf7ed]">
                  <td className="p-3.5 font-semibold text-[#1b1611]">Café, humedad, gatos</td>
                  <td className="p-3.5 text-red-800">Todos son una amenaza</td>
                  <td className="p-3.5 text-[#1e6b4a] font-medium">
                    Ninguno te afecta (alojado en la nube con respaldo)
                  </td>
                </tr>
                <tr className="hover:bg-[#fbf7ed] bg-amber-50/50">
                  <td className="p-3.5 font-semibold text-[#1b1611]">Si hay apagón o se cae el internet</td>
                  <td className="p-3.5 text-[#5c5246]">Es tu plan A</td>
                  <td className="p-3.5 text-[#1b1611] font-medium">
                    Necesitas un respaldo físico (hojas impresas de contingencia)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-base leading-relaxed">
            Fíjate en la última fila, porque es donde mucha gente se confunde. Aunque uses libro virtual, necesitas un libro físico de respaldo para cuando el sistema falle: apagón, internet caído, lo que sea. O sea, lo virtual no te libra del papel por completo.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Pero cambia algo importante: el papel pasa de ser tu herramienta diaria a ser un salvavidas que casi nunca vas a usar. Como el extintor. Está ahí, esperas no necesitarlo, y duerme tranquilo.
          </p>

          {/* Section: Las tres formas estúpidas en que falla el libro físico */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Las tres formas estúpidas en que falla el libro físico
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Hemos visto suficientes negocios con problemas como para armar el podio.
          </p>

          {/* Podio 1 */}
          <div className="mt-6 rounded-xl border border-[#d6c7b0] bg-white p-5 shadow-sm">
            <h3 className="font-display text-lg font-bold text-[#c02b0a] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#c02b0a] text-white font-mono text-sm">
                1
              </span>
              “Está por ahí” (el libro que no aparece)
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#5c5246]">
              Nadie sabe dónde está. El dueño cree que lo tiene el encargado. El encargado cree que lo tiene el dueño. Mientras tanto, el inspector espera y tu cara va cambiando de color.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#1b1611] font-medium">
              Recuerda: no tener un libro válido, o no tener el aviso visible, es justo lo que puede costarte entre 0.5 y 5 UIT. El libro que existe pero no aparece, para efectos prácticos, no existe.
            </p>
            <div className="mt-3 pt-3 border-t border-[#e3d9c6] text-xs text-[#1e6b4a] font-semibold flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              <span>Con LibroDigital.pe: El cartel con código QR está siempre visible en tu pared o mostrador. Imposible perderlo.</span>
            </div>
          </div>

          {/* Podio 2 */}
          <div className="mt-6 rounded-xl border border-[#d6c7b0] bg-white p-5 shadow-sm">
            <h3 className="font-display text-lg font-bold text-[#c02b0a] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#c02b0a] text-white font-mono text-sm">
                2
              </span>
              La hoja que falta (o que se arruinó)
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#5c5246]">
              Alguien arrancó una hoja para anotar un pedido. Otro la usó de servilleta. Otro la dejó junto a la lonchera y ahora tiene una mancha de aceite en el centro.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#1b1611] font-medium">
              Y aquí viene lo que duele: si falta una hoja, igual te pueden multar. Un libro con hojas numeradas es justo para eso: que se note cuando falta una. El papel no perdona y tampoco olvida.
            </p>
            <p className="mt-2 text-sm italic text-[#6e5d4a]">
              Pregúntate: ¿tu negocio realmente cuida cada hoja de un libro que nadie quiere abrir?
            </p>
            <div className="mt-3 pt-3 border-t border-[#e3d9c6] text-xs text-[#1e6b4a] font-semibold flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              <span>Con LibroDigital.pe: Los folios son registros digitales inmutables con trazabilidad garantizada por 24 meses.</span>
            </div>
          </div>

          {/* Podio 3 */}
          <div className="mt-6 rounded-xl border border-[#d6c7b0] bg-white p-5 shadow-sm">
            <h3 className="font-display text-lg font-bold text-[#c02b0a] flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#c02b0a] text-white font-mono text-sm">
                3
              </span>
              La copia que no es copia
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-[#5c5246]">
              El sistema auto copiable es genial en teoría. En la práctica, es un papel que depende de que alguien lo llene bien, lo separe bien y se lo entregue al cliente bien. Con una cola de diez personas y un solo encargado. A las seis de la tarde. Un viernes.
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#1b1611] font-medium">
              Cuando el proceso depende de la buena voluntad de alguien con apuro, ya sabes cómo termina.
            </p>
            <div className="mt-3 pt-3 border-t border-[#e3d9c6] text-xs text-[#1e6b4a] font-semibold flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4" />
              <span>Con LibroDigital.pe: El consumidor llena el formulario desde su propio teléfono y recibe su constancia oficial por correo de inmediato.</span>
            </div>
          </div>

          {/* VISUAL 3: Modern Solution visual & CTA */}
          <ModernLibroVisual />

          {/* Section: ¿Y el virtual? */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            ¿Y el virtual? ¿Entonces ya está, todo resuelto?
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Casi. Pero no cualquier sistema vale. Si vas a pasarte al virtual, que sea uno que cumpla lo básico. Aquí va el checklist, para que lo uses con cualquier proveedor (incluyéndonos a nosotros).
          </p>

          {/* Checklist box */}
          <div className="my-6 rounded-2xl border-2 border-[#1e6b4a] bg-[#fdfaf3] p-6 shadow-sm">
            <h3 className="font-display text-lg font-bold text-[#1b1611] flex items-center gap-2 mb-4">
              <CheckCircle2 className="h-5 w-5 text-[#1e6b4a]" />
              Checklist: lo que un libro virtual válido debe hacer en 2026
            </h3>
            <ul className="space-y-3.5 text-sm text-[#1b1611]">
              <li className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1e6b4a] text-white text-xs font-bold">
                  ✓
                </span>
                <span>
                  <strong>Generar un código correlativo único</strong> para cada reclamo o queja. Sin excepciones y sin repetirse.
                  <span className="block text-xs text-[#1e6b4a] font-semibold mt-0.5">
                    → LibroDigital.pe lo genera en el instante según el formato oficial INDECOPI.
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1e6b4a] text-white text-xs font-bold">
                  ✓
                </span>
                <span>
                  <strong>Permitir que el consumidor reciba una copia</strong>, ya sea por correo electrónico o impresa.
                  <span className="block text-xs text-[#1e6b4a] font-semibold mt-0.5">
                    → LibroDigital.pe envía un correo automático con la constancia oficial en PDF y permite impresión directa.
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1e6b4a] text-white text-xs font-bold">
                  ✓
                </span>
                <span>
                  <strong>Estar accesible para el cliente.</strong> Si necesita un manual de instrucciones para usarlo, ya falló.
                  <span className="block text-xs text-[#1e6b4a] font-semibold mt-0.5">
                    → LibroDigital.pe funciona directo escaneando un QR con el celular o haciendo un clic, sin crear cuentas ni descargar apps.
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1e6b4a] text-white text-xs font-bold">
                  ✓
                </span>
                <span>
                  <strong>Tener el aviso visible</strong> de que cuentas con libro de reclamaciones. Recuerda que no tenerlo visible también cuenta para la multa.
                  <span className="block text-xs text-[#1e6b4a] font-semibold mt-0.5">
                    → LibroDigital.pe te genera el cartel oficial listo para imprimir en tamaño A4 con el aviso normativo legal.
                  </span>
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1e6b4a] text-white text-xs font-bold">
                  ✓
                </span>
                <span>
                  <strong>Tener un respaldo físico disponible</strong> para cuando se caiga el sistema (apagón, internet caído).
                  <span className="block text-xs text-[#1e6b4a] font-semibold mt-0.5">
                    → En tu panel de LibroDigital.pe descargas gratis las hojas impresas de contingencia para tu carpeta de respaldo.
                  </span>
                </span>
              </li>
            </ul>
          </div>

          <p className="text-base leading-relaxed font-semibold text-[#8a2c12]">
            Si tu proveedor no hace alguna de estas cinco cosas, no tienes un libro virtual: tienes un problema con otra URL.
          </p>

          {/* TikTok-format Promo Video Demo (2-column showcase) */}
          <PromoVideoCard />

          {/* Section: Las preguntas que deberías hacerte hoy */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Las preguntas que deberías hacerte hoy
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Sin drama, solo cuentas claras:
          </p>

          <div className="my-5 space-y-2.5 rounded-xl border border-[#d6c7b0] bg-[#fbf7ed] p-5">
            {[
              '¿Sé exactamente dónde está mi libro ahora mismo, sin buscarlo?',
              '¿Cada hoja está numerada y en su lugar?',
              '¿El aviso está a la vista, o está en el mismo lugar que el libro: “por ahí”?',
              'Si se va la luz o el internet, ¿tengo un libro físico de respaldo que sirva?',
              '¿Mi sistema genera código correlativo y entrega copia al cliente?',
            ].map((pregunta, idx) => (
              <div key={idx} className="flex items-start gap-3 text-sm text-[#1b1611]">
                <HelpCircle className="h-4 w-4 text-[#c02b0a] shrink-0 mt-0.5" />
                <span>{pregunta}</span>
              </div>
            ))}
          </div>

          <p className="text-base leading-relaxed font-semibold text-[#1b1611]">
            Si dudaste en más de una, ya sabes por dónde empezar.
          </p>

          {/* Section: Cierre */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Cierre: no es magia, es sacarte un dolor de cabeza
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Nadie abre un negocio para pelearse con un cuaderno con hojas numeradas. Abriste para vender, atender, crecer. El libro de reclamaciones es una obligación, no tu pasión.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Un libro virtual bien hecho se encarga de lo aburrido por ti: el código correlativo, la copia por correo al cliente, el orden, el registro siempre a la mano. Solo te queda el respaldo físico para los apagones, guardado donde sí lo encuentres.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Eso es justo lo que intentamos hacer en{' '}
            <Link href="/" className="font-bold text-[#c02b0a] hover:underline">
              LibroDigital.pe
            </Link>
            : una herramienta simple, de precio bajo, pensada para MYPEs y personas naturales, que te deja cumplir sin estudiar normativa y con ayuda de IA cuando tengas dudas. Si quieres{' '}
            <Link href="/#precios" className="font-bold text-[#c02b0a] hover:underline">
              echarle un vistazo
            </Link>
            , ahí estamos. Y si prefieres seguir con tu libro de papel, al menos ponle un forro al cafecito.
          </p>

          <p className="text-base leading-relaxed mt-4">
            Y la próxima vez que llegue el inspector, que lo único que tengas que decir sea:
          </p>

          <blockquote className="my-5 border-l-4 border-[#1e6b4a] bg-[#1e6b4a]/10 p-4 rounded-r text-[#1b1611] font-display text-lg font-bold">
            “Claro, aquí está. ¿Le mando una copia al correo?”
          </blockquote>

          {/* FINAL CTA BOX TO BUY / START LIBRODIGITAL */}
          <div className="mt-12 rounded-3xl border-2 border-[#c02b0a] bg-gradient-to-br from-[#1b1611] via-[#2a221b] to-[#1b1611] p-8 text-white shadow-xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-3 text-center md:text-left">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c02b0a] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-white">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Cero Riesgo de Multas
                </span>
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-[#f7f2e8]">
                  Tu Libro de Reclamaciones listo en 3 minutos
                </h3>
                <p className="text-sm text-[#f7f2e8]/80 max-w-lg leading-relaxed">
                  Genera tu cartel QR imprimible oficial, recibe constancias con folios correlativos y responde con IA dentro de los 15 días hábiles.
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#f7f2e8]/70 pt-1 font-mono">
                  <span>✓ 15 días de prueba gratis</span>
                  <span>✓ Sin tarjeta de crédito</span>
                  <span>✓ Boleta o Factura con IGV</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 w-full sm:w-auto shrink-0">
                <Link href="/acceso?modo=registro">
                  <Button size="lg" className="w-full sm:w-auto bg-[#c02b0a] hover:bg-[#d6320d] text-white font-bold text-sm px-6 py-6 shadow-lg shadow-[#c02b0a]/30">
                    Comenzar Gratis Ahora
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/#precios">
                  <Button variant="outline" size="sm" className="w-full sm:w-auto border-[#f7f2e8]/20 bg-white/5 hover:bg-white/10 text-[#f7f2e8] text-xs">
                    Ver planes desde S/ 199/año
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </article>

        {/* Back navigation & related */}
        <div className="mt-12 pt-6 border-t border-[#e3d9c6] flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#5c5246] hover:text-[#c02b0a]"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver a la portada de LibroDigital.pe
          </Link>
          <Link
            href="/articulos"
            className="text-sm font-medium text-[#c02b0a] hover:underline"
          >
            Ver más guías y artículos →
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-[#e3d9c6] bg-[#fdfaf3] py-8 text-center text-xs text-[#5c5246]">
        <div className="mx-auto max-w-4xl px-5 space-y-2">
          <p translate="no">© 2026 LibroDigital.pe · {OPERATOR.businessName} · RUC {OPERATOR.ruc}</p>
          <p className="text-[11px] text-[#8a7a67]">
            Plataforma oficial de gestión del Libro de Reclamaciones conforme al Código de Protección y Defensa del Consumidor (Ley N.° 29571).
          </p>
        </div>
      </footer>

      <BackToTop />
    </div>
  );
}
