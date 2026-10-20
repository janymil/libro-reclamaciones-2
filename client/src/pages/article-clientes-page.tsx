import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { BrandMark } from '@/components/landing/brand';
import BackToTop from '@/components/layout/back-to-top';
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Coffee,
  Coins,
  Flame,
  HelpCircle,
  PenTool,
  QrCode,
  Scale,
  Share2,
  ShieldCheck,
  Smile,
  Sparkles,
  Smartphone,
  Video,
} from 'lucide-react';
import {
  FiveClientsVisual,
  ModernLibroVisual,
  PromotionalCallout,
  PromoVideoCard,
} from '@/components/blog/article-visuals';
import { EDITORIAL_ARTICLES } from '@/data/editorial-articles';
import { OPERATOR } from '@/lib/platform-legal';
import { SeoHead } from '@/components/seo/seo-head';

export default function ArticleClientesPage() {
  const article = EDITORIAL_ARTICLES[1];
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
        publishedTime="2026-10-18T10:00:00-05:00"
        author={article.author.name}
        ogImage="https://librodigital.pe/assets/tipos-clientes-poster.webp"
        keywords={[
          'clientes que piden libro de reclamaciones',
          'como atender reclamos indecopi',
          'atencion al cliente bodegas peruanas',
          'constancia reclamo digital',
          'codigo qr libro de reclamaciones',
        ]}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          'headline': article.title,
          'description': article.summary,
          'image': ['https://librodigital.pe/assets/tipos-clientes-poster.webp'],
          'datePublished': '2026-10-18T10:00:00-05:00',
          'dateModified': '2026-10-20T14:00:00-05:00',
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
            5 clientes que piden el libro
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
                La Regla de Oro del Mostrador
              </strong>
              <p className="text-[#3d2f21] font-medium leading-relaxed">
                {article.keyTakeaway}
              </p>
            </div>
          </div>
        </div>

        {/* Visual overview of the 5 profiles */}
        <FiveClientsVisual />

        {/* Article Body - EXACT original text */}
        <article className="prose prose-stone max-w-none text-[#1b1611] leading-relaxed">
          <p className="text-lg leading-relaxed">
            Hay clientes que piden el libro de reclamaciones por 10 céntimos de vuelto. Y hay clientes que lo piden “por si acaso”. Estos son los que más se repiten.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Si atiendes público, ya los conoces. Si todavía no, tranquilo: te van a llegar. Una bodega, una peluquería, un restaurante, una tienda online, da igual. El libro de reclamaciones, físico o virtual, es obligatorio para todo proveedor que atiende al público, MYPE y tiendas online incluidas (Ley 32495). O sea que el libro no es un capricho tuyo. Es parte del negocio, como la caja y el letrero que se ve torcido desde la esquina.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Y como el libro existe, hay gente que lo pide. Por motivos muy distintos. Te presento al elenco.
          </p>

          {/* 1. El del vuelto */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2 flex items-center gap-2">
            <Coins className="h-6 w-6 text-amber-600" />
            El del vuelto, o el principista
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Le faltan diez céntimos. Tú no tienes sencillo. Y de pronto estás en una negociación internacional.
          </p>

          <blockquote className="my-4 border-l-2 border-[#8a7258] pl-4 italic text-[#4a3b2c] bg-[#f4ece1]/40 py-2 rounded-r">
            <p className="font-semibold text-[#1b1611]">—Joven, me faltan diez céntimos.</p>
            <p className="mt-1">—Ay, disculpe, no tengo sencillo, le puedo dar...</p>
            <p className="mt-1 font-semibold text-[#1b1611]">—Entonces tráigame el libro.</p>
          </blockquote>

          <p className="text-base leading-relaxed">
            Lo dice como quien saca una carta ganadora en el póker. Y tú, que llevas seis horas de pie, solo piensas: por diez céntimos.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Pero aquí viene lo que aprendes con los años: nunca son los diez céntimos. Nunca. Lo que el señor siente es que le ven la cara, y el libro es su forma de decir “aquí hay alguien que exige respeto”. Si te pones a explicar que son solo diez céntimos, acabas de convertir un incidente de ocho segundos en una función de una hora.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Lo que funciona es lo contrario de lo que te pide el orgullo: darle el libro sin cara de víctima, pedir disculpas por el sencillo y seguir con tu vida. Casi siempre el cliente que recibe el libro sin pelea se queda sin pelea. Lo que lo prende no es el vuelto, es que se lo compliquen.
          </p>

          {/* 2. El tiktoker */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2 flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-purple-600" />
            El tiktoker, o “causas, estamos en vivo”
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Este llega con el celular en alto, como si fuera una antorcha olímpica.
          </p>

          <blockquote className="my-4 border-l-2 border-[#8a7258] pl-4 italic text-[#4a3b2c] bg-[#f4ece1]/40 py-2 rounded-r">
            <p className="font-semibold text-[#1b1611]">—Causas, estamos aquí en vivo en esta bodega —anuncia a su público invisible—. Señor, ¿me da el libro de reclamaciones? Es para el contenido.</p>
          </blockquote>

          <p className="text-base leading-relaxed">
            Y ahí lo tienes: tú, con el delantal, la fila detrás y una cámara a veinte centímetros de la nariz. Muchos dueños se ponen nerviosos, empiezan a hablar como presentador de noticias y terminan siendo meme del distrito.
          </p>

          <p className="text-base leading-relaxed mt-3">
            El secreto es aburrido y por eso funciona: no actúes. Atiéndelo igual que a la señora que compra pan. Una frase tranquila, un gesto hacia el QR, “escanea aquí y registra lo que quieras”, y listo. Porque el tiktoker busca drama, y un dueño sereno que no tiene nada que esconder es el peor material del mundo. Nadie hace viral a un señor que responde con calma y proceso. Se queda en cinco vistas, tres de ellas de su mamá.
          </p>

          {/* 3. El que conoce sus derechos */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2 flex items-center gap-2">
            <Scale className="h-6 w-6 text-blue-600" />
            El que conoce sus derechos (o su sobrino los conoce)
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Este viene con la armadura puesta.
          </p>

          <blockquote className="my-4 border-l-2 border-[#8a7258] pl-4 italic text-[#4a3b2c] bg-[#f4ece1]/40 py-2 rounded-r">
            <p className="font-semibold text-[#1b1611]">—Yo sé de leyes, ¿ah? Tengo mis derechos. Deme el libro.</p>
            <p className="mt-1">—Claro, ¿pasó algo con su pedido?</p>
            <p className="mt-1 font-semibold text-[#1b1611]">—Eso se lo digo en el libro. Pero que sepa que yo conozco la ley... bueno, mi sobrino estudia Derecho.</p>
          </blockquote>

          <p className="text-base leading-relaxed">
            Y ahí te das cuenta de que el “yo sé de leyes” tiene fuente primaria: el sobrino, un viernes, en una reunión familiar.
          </p>

          <p className="text-base leading-relaxed mt-3">
            No te metas a competir en conocimiento legal. No le corrijas nada, no le pidas el artículo, no hagas la cara de “ah, ¿sí?”. Pierdes siempre, incluso cuando ganas. Lo que de verdad le baja el volumen a este cliente es ver que todo funciona como debe: el libro está a la mano, lo registra y le llega su constancia. Porque ese es el punto: el libro virtual debe permitir que el consumidor reciba su constancia. Cuando el cliente la recibe, el discurso legal se queda sin público. El sobrino, desde su casa, también aprobaría.
          </p>

          {/* Promotional Bridge */}
          <PromotionalCallout
            badge="Enfrenta cualquier situación con calma"
            title="Con LibroDigital.pe nunca discutes con el cliente"
            description="El cartel con código QR oficial está siempre visible en tu mostrador. Tu cliente escanea, llena el formulario desde su celular y recibe su constancia oficial con código correlativo en su correo. Tú solo sigues atendiendo."
            buttonText="Ver cómo funciona"
            buttonHref="/#como-funciona"
          />

          {/* 4. El por si acaso */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2 flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-stone-600" />
            El por si acaso, o el que no te va a contar nada
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Es el más misterioso del grupo.
          </p>

          <blockquote className="my-4 border-l-2 border-[#8a7258] pl-4 italic text-[#4a3b2c] bg-[#f4ece1]/40 py-2 rounded-r">
            <p className="font-semibold text-[#1b1611]">—Deme el libro.</p>
            <p className="mt-1">—Claro. ¿Qué pasó?</p>
            <p className="mt-1 font-semibold text-[#1b1611]">—Nada.</p>
            <p className="mt-1">—¿Nada?</p>
            <p className="mt-1 font-semibold text-[#1b1611]">—Nada, pero por si acaso.</p>
          </blockquote>

          <p className="text-base leading-relaxed">
            Y ahí te quedas, con la ceja levantada, preguntándote qué hiciste mal. ¿Fue el pan? ¿Fue el trato? ¿Fue la música? Nunca lo vas a saber.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Un error común es interrogarlo: “¿pero seguro que no le pasó nada?, ¿le molestó algo?”. Suena a que quieres evitar que escriba, y entonces sí le das motivo. Lo mejor es lo más simple: “Cómo no, escanee aquí y anote lo que necesite”. Si quiere contarte algo, te lo cuenta. Si no, queda registrado y se va tan tranquilo como llegó.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Y aquí va un consejo de bodeguero viejo: no te ofendas. A veces el “por si acaso” es hábito, a veces viene de una mala experiencia en otro lado, y a veces es una señal sutil de que algo pudo salir mejor. Es información gratis. Tómala con humildad y un café.
          </p>

          {/* 5. El nostálgico */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2 flex items-center gap-2">
            <PenTool className="h-6 w-6 text-emerald-700" />
            El nostálgico, o “yo quería mi lapicero”
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Este es el más entrañable y también el más difícil de apurar.
          </p>

          <blockquote className="my-4 border-l-2 border-[#8a7258] pl-4 italic text-[#4a3b2c] bg-[#f4ece1]/40 py-2 rounded-r">
            <p className="font-semibold text-[#1b1611]">—Quiero poner un reclamo.</p>
            <p className="mt-1">—Claro, escanee el código QR de aquí y...</p>
            <p className="mt-1 font-semibold text-[#1b1611]">—¿Qué QR? ¿Y el cuaderno? Yo quería escribir con mi lapicero.</p>
            <p className="mt-1">—Es que ahora es virtual, es más rápido...</p>
            <p className="mt-1 font-semibold text-[#1b1611]">—En mis tiempos uno escribía con su letra. Eso era un reclamo de verdad.</p>
          </blockquote>

          <p className="text-base leading-relaxed">
            A este cliente no le molesta el reclamo, le molesta que el mundo haya cambiado sin avisarle. Para él, el libro es un objeto: el cuaderno, la tinta, la firma con floritura. Lo digital le parece frío, y a veces simplemente no sabe cómo usarlo.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Con él, lo único que sirve es paciencia y cero condescendencia. “Si quiere, yo le enseño, son un minutito.” Le muestras el celular, le señalas dónde tocar, y al final le llega su constancia. Cuando el nostálgico ve que su reclamo sí quedó registrado y que recibió su comprobante, se va conforme. Seguirá contando que antes era con lapicero, pero ya sin enojo. Eso, en este negocio, es un triunfo.
          </p>

          {/* Section: Lo que tienen en común los cinco */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Lo que tienen en común los cinco
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Fíjate en algo. Cinco clientes, cinco personalidades, y a todos terminaste diciéndoles casi lo mismo: “Claro, escanee aquí y registra lo que necesite.”
          </p>

          <p className="text-base leading-relaxed mt-3">
            Ese es el truco, y no tiene nada de mágico. Cuando tu libro virtual está bien puesto, es decir, visible, con su código QR, funcionando y entregando la constancia al consumidor, el proceso deja de depender de tu humor del día, de tu paciencia o de cuánta gente haya en la cola. Siempre es el mismo camino, para el del vuelto, para el tiktoker, para el que sabe de leyes, para el por si acaso y para el nostálgico (con ayudita).
          </p>

          <p className="text-base leading-relaxed mt-3">
            Una dueña de bodega lo dijo mejor que cualquier manual: “Para todos tengo el mismo: virtual, con QR y en un minuto. Y si llega la fiscalización, también estoy lista.”
          </p>

          <p className="text-base leading-relaxed mt-3">
            Y esa última parte importa. Tener el QR visible y el sistema funcionando evita la mayoría de los problemas en una fiscalización. No es magia: es que lo básico está a la vista y en orden, y quien entra lo ve de inmediato.
          </p>

          {/* 2-COLUMN TIKTOK PROMO VIDEO COMPONENT (tipos_clientes) */}
          <PromoVideoCard
            poster="/assets/tipos-clientes-poster.webp"
            webm="/assets/tipos-clientes.webm"
            mp4="/assets/tipos-clientes.mp4"
            badge="Video: Tipos de Clientes · 37 seg"
            formatBadge="Formato TikTok & Shorts"
            title="¿Te ha tocado uno de estos clientes en tu negocio?"
            description="Mira en video cómo reaccionar con total serenidad cuando llega cualquiera de estos perfiles a tu mostrador y cómo el cartel QR de LibroDigital.pe te ahorra cualquier discusión."
            caption="Demostración: el QR oficial en mostrador resuelve la atención en un minuto."
          />

          {/* Section: Dónde entra LibroDigital.pe */}
          <h2 className="mt-10 font-display text-2xl font-bold tracking-tight text-[#1b1611] border-b border-[#e3d9c6] pb-2">
            Dónde entra LibroDigital.pe
          </h2>

          <p className="text-base leading-relaxed mt-4">
            Aquí es donde, con toda la discreción del mundo, te cuento que existe una forma de tener justo esto sin volverte loco.{' '}
            <Link href="/" className="font-bold text-[#c02b0a] hover:underline">
              LibroDigital.pe
            </Link>{' '}
            es un sistema virtual simple, pensado para MYPEs y personas naturales: pones tu QR a la vista, listo en minutos, a un precio bajo, y con ayuda de IA si te surge alguna duda por el camino.
          </p>

          <p className="text-base leading-relaxed mt-3">
            La respuesta para cualquiera que te pida el libro es siempre la misma:
          </p>

          <blockquote className="my-5 border-l-4 border-[#1e6b4a] bg-[#1e6b4a]/10 p-4 rounded-r text-[#1b1611] font-display text-lg font-bold">
            “Escanea el QR, en un minuto queda registrado.”
          </blockquote>

          <p className="text-base leading-relaxed mt-3">
            Sin cuadernos que buscar, sin hojas que cuidar, sin discutir quién tiene la razón. El cliente registra lo suyo, recibe su constancia, y tú sigues atendiendo. Y si mañana toca fiscalización, ya estás en orden.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Si quieres{' '}
            <Link href="/#precios" className="font-bold text-[#c02b0a] hover:underline">
              echarle un vistazo
            </Link>
            , ahí estamos. Y si prefieres seguir con tu sistema actual, al menos ten claro lo esencial: el proceso tiene que ser el mismo para todos.
          </p>

          <p className="text-base leading-relaxed mt-4 font-semibold text-[#1b1611]">
            Porque el libro no es para pelear. Es para que, cuando te lo pidan (y te lo van a pedir), tú ya estés listo y el cliente se vaya en dos minutos.
          </p>

          {/* FINAL CTA BOX TO BUY / START LIBRODIGITAL */}
          <div className="mt-12 rounded-3xl border-2 border-[#c02b0a] bg-gradient-to-br from-[#1b1611] via-[#2a221b] to-[#1b1611] p-8 text-white shadow-xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-3 text-center md:text-left">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c02b0a] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-white">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Cero Peleas · 100% Tranquilidad
                </span>
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-[#f7f2e8]">
                  Tu cartel QR oficial listo para imprimir hoy
                </h3>
                <p className="text-sm text-[#f7f2e8]/80 max-w-lg leading-relaxed">
                  Evita discusiones y multas de hasta S/ 27,500. Tus clientes registran su reclamo desde el celular y reciben su constancia al correo de inmediato.
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#f7f2e8]/70 pt-1 font-mono">
                  <span>✓ 15 días de prueba gratis</span>
                  <span>✓ Cartel QR para mostrador incluido</span>
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
            href="/articulos/libro-fisico-vs-virtual-2026"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#5c5246] hover:text-[#c02b0a]"
          >
            <ArrowLeft className="h-4 w-4" />
            Artículo anterior: El libro físico en 2026
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
