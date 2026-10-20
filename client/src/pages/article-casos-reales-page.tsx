import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/landing/brand';
import BackToTop from '@/components/layout/back-to-top';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  FileWarning,
  Flame,
  Gavel,
  HelpCircle,
  Landmark,
  Scale,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  GoogleFormComparisonVisual,
  LandscapeVideoCard,
  ModernLibroVisual,
  PromotionalCallout,
  RealCasesVisual,
} from '@/components/blog/article-visuals';
import { EDITORIAL_ARTICLES } from '@/data/editorial-articles';
import { OPERATOR } from '@/lib/platform-legal';
import { SeoHead } from '@/components/seo/seo-head';

export default function ArticleCasosRealesPage() {
  const article = EDITORIAL_ARTICLES[2];
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
        publishedTime="2026-10-20T08:00:00-05:00"
        author={article.author.name}
        ogImage="https://librodigital.pe/assets/multas-reales-poster.webp"
        keywords={[
          'multas reales indecopi',
          'sanciones libro de reclamaciones',
          'valeria basurco multa indecopi',
          'chifa cajamarca indecopi',
          'cartel libro de reclamaciones obligatorio',
          'fiscalizacion mype indecopi 2026',
        ]}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          'headline': article.title,
          'description': article.summary,
          'image': ['https://librodigital.pe/assets/multas-reales-poster.webp'],
          'datePublished': '2026-10-20T08:00:00-05:00',
          'dateModified': '2026-10-20T16:00:00-05:00',
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

      {/* Header */}
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

      {/* Main Container */}
      <main id="main-content" className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        {/* Breadcrumb */}
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
            Historias reales de multas
          </span>
        </nav>

        {/* Article Metadata */}
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
                La Gran Lección Legal
              </strong>
              <p className="text-[#3d2f21] font-medium leading-relaxed">
                {article.keyTakeaway}
              </p>
            </div>
          </div>
        </div>

        {/* Article Body - EXACT original text */}
        <article className="prose prose-stone max-w-none text-[#1b1611] leading-relaxed">
          <h2 className="text-2xl font-display font-bold tracking-tight text-[#1b1611] mt-8 mb-4 border-b border-[#e3d9c6] pb-2">
            “A mí no me van a fiscalizar”
          </h2>

          <p className="text-lg leading-relaxed">
            Seguro lo has pensado, o lo has escuchado en la mesa de al lado: “Indecopi tiene cosas más grandes que revisar. ¿Quién va a venir a mi bodega, a mi tienda online, a mi consultorio de dos sillas?”
          </p>

          <p className="text-base leading-relaxed mt-3">
            Tiene lógica. Y es justo lo que hace que tanta gente lo deje para después.
          </p>

          <p className="text-base leading-relaxed mt-3">
            El problema es que la norma no tiene un asterisco que diga “salvo que seas chiquito”. Si atiendes al público, eres MYPE, persona natural con RUC o una tienda que solo vive en Instagram, la obligación es la misma. Y como vas a ver, no hace falta que llegue un inspector con casaca para que te caiga un expediente. A veces basta un cliente molesto y un celular.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Vamos a los casos. Todos reales, todos publicados.
          </p>

          {/* Visual Cards of Real Sanctions */}
          <RealCasesVisual />

          {/* Historia 1 */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Historia 1: la emprendedora de maquillaje y la multa de S/15,000
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Valeria Basurco tiene un pequeño negocio de maquillaje y belleza. En 2025 contó en TikTok que Indecopi la había sancionado con S/15,000. ¿La razón? Su página web no tenía libro de reclamaciones virtual: ni link a un formulario, ni el ícono que corresponde.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Según ella, le llegó una denuncia de 40 páginas (“parecía que yo había asesinado a alguien”, dijo). Agregó el libro de reclamaciones y respondió la carta, pero igual le impusieron la multa. Lo que la salvó de pagar todo fue reconocer la falta (el famoso allanamiento) y pagar dentro de los primeros 15 días hábiles para acceder al 25% de descuento. Terminó pagando unos S/4,000 y tanto, que para un negocio chiquito sigue siendo un golpe.
          </p>

          <div className="my-4 rounded-xl border-l-4 border-amber-500 bg-amber-50/70 p-4 text-sm">
            <p className="font-bold text-amber-950">
              La lección: arreglarlo después de que te llega la carta no borra la infracción. Al libro hay que tenerlo antes.
            </p>
          </div>

          {/* Promotional Bridge 1 */}
          <PromotionalCallout
            badge="Protege tu tienda online hoy"
            title="LibroDigital.pe te da el enlace y el widget oficial para tu web o redes"
            description="Agrega el ícono oficial y el acceso a tu Libro de Reclamaciones virtual en 3 minutos. Cumple con la Ley 32495 y evita multas de S/ 15,000 por no tener el enlace visible."
            buttonText="Proteger mi tienda online"
            buttonHref="/acceso?modo=registro"
          />

          {/* Historia 2 */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Historia 2: el chifa, la demora y el cliente que pidió el libro
          </h2>

          <p className="text-base leading-relaxed mt-4">
            El 4 de julio de 2025, cerca de las 10 de la noche, un cliente fue a comer a un chifa en Cajamarca. El pedido se demoró. Hasta ahí, un lunes cualquiera en cualquier restaurante del Perú.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Lo que cambió el rumbo fue que el cliente pidió el libro de reclamaciones y no se lo dieron. Tampoco había un aviso visible que dijera que el local lo tenía. La oficina de Indecopi en Cajamarca abrió el procedimiento por esas dos cosas (no exhibir el aviso y no entregar el libro) y el dueño del Chifa Los Ángeles terminó reconociendo los hechos. Esta vez la sanción fue una amonestación, sin multa.
          </p>

          <div className="my-4 rounded-xl border-l-4 border-amber-500 bg-amber-50/70 p-4 text-sm">
            <p className="font-bold text-amber-950">
              La lección: salió barato porque el dueño admitió la falta. Pero el expediente existió igual, y todo empezó por un plato demorado. Nadie fue a “fiscalizar” nada; un cliente pidió el libro y nadie se lo dio.
            </p>
          </div>

          {/* Historia 3 */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Historia 3: la notaría de Piura y el cartel que faltaba
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Esta no es una cadena ni una franquicia. Es una persona natural con su oficina en Piura. Una asociación de consumidores la denunció porque no exhibía el aviso del libro de reclamaciones en su establecimiento.
          </p>

          <p className="text-base leading-relaxed mt-3">
            La Comisión de Indecopi en Piura la sancionó con una multa de 2 UIT, le ordenó colocar el aviso en 15 días hábiles y además la condenó al pago de costas y costos del procedimiento. El caso llegó hasta la Sala de Protección al Consumidor (Resolución 0515-2022/SPC-Indecopi).
          </p>

          <div className="my-4 rounded-xl border-l-4 border-amber-500 bg-amber-50/70 p-4 text-sm">
            <p className="font-bold text-amber-950">
              La lección: no tenía el libro “malogrado” ni había maltratado a nadie. Le faltaba un cartel. Y un cartel que cuesta casi nada terminó en un expediente, una multa y costos.
            </p>
          </div>

          {/* Section: ¿Y los grandes? */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            ¿Y los grandes? También caen, con las mismas reglas
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Si todavía piensas que esto es cosa de gente chica, mira lo que pasó arriba:
          </p>

          <ul className="my-4 space-y-3 text-base text-[#1b1611]">
            <li className="flex items-start gap-2.5">
              <span className="font-bold text-[#c02b0a]">•</span>
              <span>
                <strong>BBVA:</strong> el 13 de noviembre de 2025, un cliente en Puno quiso presentar un reclamo de forma presencial y no pudo acceder al libro. El banco se defendió diciendo que tenía libro virtual. En 2026, Indecopi confirmó la multa de 5 UIT (S/27,500) y dejó una frase que le sirve a cualquiera: tener canales digitales no te exime si un cliente pide el libro dentro del establecimiento.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="font-bold text-[#c02b0a]">•</span>
              <span>
                <strong>McDonald’s (Arcos Dorados):</strong> en Arequipa, Indecopi sancionó con amonestación por negarse a entregar el libro físico, indicándole al cliente que reclamara por la vía virtual.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="font-bold text-[#c02b0a]">•</span>
              <span>
                <strong>Interbank:</strong> Indecopi lo investigó de oficio, sin que nadie lo denunciara, y lo sancionó porque las hojas de reclamación de su libro no tenían toda la información mínima exigida.
              </span>
            </li>
          </ul>

          <p className="text-base leading-relaxed mt-3">
            Fíjate en el patrón: la misma obligación, las mismas reglas. Y en la mayoría de estos casos el punto de partida fue un cliente (o una asociación) que dijo “dame el libro”, no un inspector que tocó la puerta.
          </p>

          {/* 16:9 Video Report on Real Sanctions */}
          <LandscapeVideoCard
            poster="/assets/multas-reales-poster.webp"
            webm="/assets/multas-reales.webm"
            mp4="/assets/multas-reales.mp4"
            badge="Video Reporte · Casos Reales"
            formatBadge="Formato 16:9 HD"
            title="Sanciones reales de Indecopi: la lección que ningún negocio debe ignorar"
            description="En este video de 1 minuto revisamos por qué confiar en la suerte o en un simple papel puede terminar en multas de hasta 5 UIT (S/ 27,500) y cómo activar el Libro Digital en 3 minutos te da tranquilidad total."
            caption="Reporte audiovisual: casos reales y fiscalizaciones de Indecopi para negocios y tiendas online en el Perú."
          />

          {/* Section: ¿Cuánto cuesta la broma? */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            ¿Cuánto cuesta la broma?
          </h2>

          <p className="text-base leading-relaxed mt-4">
            No hay una tarifa fija. Indecopi gradúa según la gravedad y el tamaño de la empresa. Una especialista citada por Gestión explicó que a una microempresa le pueden tocar de 1 a 2.5 UIT, y que no tener el libro o no atender un reclamo se considera falta grave. Hazte la cuenta con lo que le queda a tu negocio en un mes malo.
          </p>

          {/* Section: Los disparadores más comunes */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Los disparadores más comunes
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Mirando los casos, los problemas se repiten:
          </p>

          <ol className="my-4 space-y-2.5 text-base text-[#1b1611] list-decimal pl-5">
            <li><strong>No exhibir el aviso.</strong> El más tonto y el más frecuente.</li>
            <li><strong>Formulario virtual que no funciona</strong> o que no se encuentra en tu web.</li>
            <li><strong>No responder dentro de 15 días.</strong></li>
            <li><strong>Negarse a dar el libro,</strong> o ponerle condiciones (“primero consuma”, “es que el sistema está caído”).</li>
          </ol>

          {/* Section: Cumplimiento mínimo viable */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Cumplimiento mínimo viable para una MYPE en 2026
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Sin volverte abogado. Si aplicas esto, estás mejor que mucha gente:
          </p>

          <div className="my-6 rounded-2xl border border-[#d6c7b0] bg-[#fdfaf3] p-6 shadow-sm">
            <ul className="space-y-4 text-sm text-[#1b1611]">
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#1e6b4a] shrink-0 mt-0.5" />
                <div>
                  <strong>Aviso visible en tu local y, si vendes online, en tu página.</strong>
                  <div className="mt-1.5 rounded-lg border border-[#e3d9c6] bg-white p-3 font-mono text-xs text-[#5c5246]">
                    “Conforme a lo establecido en el Código de Protección y Defensa del Consumidor este establecimiento cuenta con un Libro de Reclamaciones a tu disposición. Solicítalo para registrar tu queja o reclamo.”
                  </div>
                  <span className="block text-xs text-[#1e6b4a] font-semibold mt-1">
                    → LibroDigital.pe te genera el cartel A4 oficial listo para descargar e imprimir en un clic.
                  </span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#1e6b4a] shrink-0 mt-0.5" />
                <div>
                  <strong>Libro disponible, físico o virtual.</strong> Si vendes por web, el acceso tiene que estar a la vista, con link y el ícono correspondiente.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#1e6b4a] shrink-0 mt-0.5" />
                <div>
                  <strong>Entrégalo siempre que te lo pidan.</strong> Sin condicionarlo a una compra, sin cobrarlo, sin excusas.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#1e6b4a] shrink-0 mt-0.5" />
                <div>
                  <strong>Responde en 15 días.</strong> Ponte una alerta, no confíes en tu memoria.
                  <span className="block text-xs text-[#1e6b4a] font-semibold mt-1">
                    → LibroDigital.pe calcula automáticamente los 15 días hábiles con el calendario de feriados peruanos y te avisa antes del vencimiento.
                  </span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#1e6b4a] shrink-0 mt-0.5" />
                <div>
                  <strong>Guarda los registros de reclamos y respuestas por al menos 2 años.</strong>
                  <span className="block text-xs text-[#1e6b4a] font-semibold mt-1">
                    → Resguardo legal cifrado por 24 meses incluido en todos los planes.
                  </span>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#1e6b4a] shrink-0 mt-0.5" />
                <div>
                  <strong>Revisa que el formato tenga la información mínima.</strong> Interbank, con todos sus abogados, cayó por esto.
                </div>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-[#1e6b4a] shrink-0 mt-0.5" />
                <div>
                  <strong>Pruébalo tú mismo cada cierto tiempo.</strong> Entra a tu libro virtual desde el celular, como lo haría un cliente. Si no abre o da error, es como no tenerlo.
                </div>
              </li>
            </ul>
          </div>

          {/* Section: “Tener el libro” no es tener un PDF ni un Google Form */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            “Tener el libro” no es tener un PDF ni un Google Form
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Esta es la trampa más común. Alguien arma un formulario, un PDF o un Google Form, lo pone en la web y siente que ya cumplió.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Ojo: no es que la ley diga “prohibido usar Google Forms”. El tema es que “tener el libro” significa que lo que entregas cumple el formato: los campos mínimos que exige la norma, una hoja que el cliente pueda conservar y un registro ordenado de cada reclamo y su respuesta. Ya viste que a un banco grande lo sancionaron justamente por hojas incompletas.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Un formulario improvisado tiene varios riesgos:
          </p>

          <ul className="my-3 space-y-1.5 text-base text-[#1b1611] list-disc pl-5">
            <li>Puede olvidar campos obligatorios.</li>
            <li>No siempre le da al cliente una copia de su reclamo.</li>
            <li>No te recuerda los plazos, y ahí es donde se te va el reclamo sin responder.</li>
            <li>No deja un registro ordenado que puedas mostrar si te lo piden.</li>
          </ul>

          {/* Visual Comparison: Google Forms vs LibroDigital */}
          <GoogleFormComparisonVisual />

          <p className="text-base leading-relaxed">
            Un libro virtual hecho para este fin genera el formato correcto (con su código único y la copia para el consumidor) y deja el historial listo. Reduce el riesgo, no lo elimina: sigues necesitando el aviso, atender cuando te piden el libro y responder a tiempo.
          </p>

          {/* Cierre */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Cierre
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Nadie te va a perseguir con una lupa un martes cualquiera. Pero los casos de arriba muestran cómo empieza todo: un pedido demorado, un cartel que faltaba, un formulario que no estaba en la web.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Si quieres sacarte el tema de encima sin pelearte con formatos ni plazos, en{' '}
            <Link href="/" className="font-bold text-[#c02b0a] hover:underline">
              LibroDigital.pe
            </Link>{' '}
            hicimos justamente eso: un libro de reclamaciones virtual a precio bajo, fácil de dejar funcionando y con ayuda de IA para redactar las respuestas. Ahora, si prefieres armarlo tú, usa el checklist de arriba. Lo importante es que a ti no te toque ser la próxima historia.
          </p>

          {/* Verified sources box */}
          <div className="my-8 rounded-xl border border-[#d6c7b0] bg-[#fbf7ed] p-4 text-xs text-[#5c5246] leading-relaxed">
            <p className="font-mono uppercase font-bold text-[#1b1611] mb-1">
              Fuentes oficiales verificadas:
            </p>
            <p>
              La República (5 mar 2025, caso Basurco); Infobae (27 feb 2026, Res. 0292-2025/PSO-INDECOPI-CAJ, Chifa Los Ángeles); Juris.pe (Res. 0515-2022/SPC, notaría Piura); Gestión (multa BBVA S/27,500) y LP Derecho (Res. Final 044-2026, BBVA Puno; Res. Final 285-2025, Arcos Dorados; Res. 2727-2024/SPC, Interbank); Gestión (rangos de multa para microempresas).
            </p>
          </div>

          {/* FINAL CTA BOX TO BUY / START LIBRODIGITAL */}
          <div className="mt-12 rounded-3xl border-2 border-[#c02b0a] bg-gradient-to-br from-[#1b1611] via-[#2a221b] to-[#1b1611] p-8 text-white shadow-xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-3 text-center md:text-left">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c02b0a] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-white">
                  <ShieldCheck className="h-3.5 w-3.5 text-amber-300" /> Blindaje Normativo Total
                </span>
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-[#f7f2e8]">
                  Que tu negocio nunca sea el próximo caso Indecopi
                </h3>
                <p className="text-sm text-[#f7f2e8]/80 max-w-lg leading-relaxed">
                  Cartel oficial imprimible para pared o mostrador, enlace con ícono oficial para tu web o redes y respuestas guiadas con IA en plazo.
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#f7f2e8]/70 pt-1 font-mono">
                  <span>✓ 15 días de prueba gratis</span>
                  <span>✓ Conforme a Ley 29571 & Anexos</span>
                  <span>✓ Factura o Boleta con IGV</span>
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
                    Ver planes desde S/ 89/año
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </article>

        {/* Back navigation & related */}
        <div className="mt-12 pt-6 border-t border-[#e3d9c6] flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            href="/articulos/cuidado-con-estos-5-clientes-libro-reclamaciones"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#5c5246] hover:text-[#c02b0a]"
          >
            <ArrowLeft className="h-4 w-4" />
            Artículo anterior: 5 clientes que piden el libro
          </Link>
          <Link
            href="/articulos"
            className="text-sm font-medium text-[#c02b0a] hover:underline"
          >
            Ver todas las guías y artículos →
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
