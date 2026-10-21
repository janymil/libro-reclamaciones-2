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
  ExternalLink,
  HelpCircle,
  Instagram,
  Lightbulb,
  Share2,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';
import {
  MiniQuizEcommerceVisual,
  PromoVideoCard,
  PromotionalCallout,
  WhatsAppChatSimulation,
} from '@/components/blog/article-visuals';
import { EDITORIAL_ARTICLES } from '@/data/editorial-articles';
import { OPERATOR } from '@/lib/platform-legal';
import { SeoHead } from '@/components/seo/seo-head';

export default function ArticleInstagramMercadoLibrePage() {
  const article = EDITORIAL_ARTICLES[3];
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
        publishedTime="2026-10-20T21:00:00-05:00"
        author={article.author.name}
        ogImage="https://librodigital.pe/assets/chat-ley-poster.webp"
        keywords={[
          'ley 32495 libro de reclamaciones',
          'libro de reclamaciones instagram peru',
          'libro de reclamaciones mercado libre peru',
          'comercio electronico indecopi',
          'enlace libro reclamaciones bio instagram',
          'librodigital pe',
        ]}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          'headline': article.title,
          'description': article.summary,
          'image': ['https://librodigital.pe/assets/chat-ley-poster.webp'],
          'datePublished': '2026-10-20T21:00:00-05:00',
          'dateModified': '2026-10-20T21:45:00-05:00',
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
            Ventas por Instagram y Ley 32495
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
            <ShieldAlert className="h-5 w-5 text-[#c02b0a] shrink-0 mt-0.5" />
            <div>
              <strong className="font-mono text-xs uppercase tracking-wider text-[#c02b0a] block mb-1">
                Aviso Clave para Vendedores Digitales
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
            Un chat que quizás ya tuviste
          </h2>

          {/* Interactive WhatsApp Simulation */}
          <WhatsAppChatSimulation />

          <p className="text-base leading-relaxed mt-4">
            Si Karla te suena familiar, tranquilo: no eres el único. Mucha gente que vende online cree que las obligaciones legales son para “las tiendas de verdad”, esas con local, letrero luminoso y un señor en la puerta. Lo tuyo es “solo un emprendimiento chiquito”.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Plot twist: para la ley, tu emprendimiento chiquito igual cuenta como venta a consumidores. Veamos qué cambió.
          </p>

          {/* Section: Qué dice la Ley 32495 */}
          <h2 className="text-2xl font-display font-bold tracking-tight text-[#1b1611] mt-10 mb-4 border-b border-[#e3d9c6] pb-2">
            Qué dice la Ley 32495 (en cristiano)
          </h2>

          <p className="text-base leading-relaxed">
            La Ley 32495 se publicó el 11 de noviembre de 2025. Modificó el Código de Protección y Defensa del Consumidor y dejó explícito algo que antes se prestaba a interpretaciones creativas: toda plataforma digital de comercio electrónico debe tener libro de reclamaciones, físico o virtual.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Y no solo eso. También tiene que exhibir permanentemente el enlace al libro, en un lugar visible y fácilmente accesible.
          </p>

          <p className="text-base leading-relaxed mt-3">
            ¿Y qué entra en “plataforma digital de comercio electrónico”? Para efectos prácticos, esto:
          </p>

          <ul className="my-4 space-y-2 text-base text-[#1b1611] list-disc pl-5">
            <li>Tu página web propia.</li>
            <li>Tu app.</li>
            <li>Los marketplaces.</li>
            <li>Las ventas habituales por redes sociales.</li>
          </ul>

          <p className="text-base leading-relaxed mt-3 font-medium">
            Léelo otra vez. Redes sociales. Sí, tu Instagram con 3,000 seguidores y catálogo en historias destacadas.
          </p>

          {/* Video Integration: TikTok Style 9:16 Video */}
          <PromoVideoCard
            poster="/assets/chat-ley-poster.webp"
            webm="/assets/chat-ley.webm"
            mp4="/assets/chat-ley.mp4"
            badge="Video TikTok · Ley 32495"
            formatBadge="Formato 9:16 Vertical"
            title="¿Vendes por Instagram? Esto te exige la Ley 32495"
            description="En menos de 60 segundos descubre por qué vender por DM o Mercado Libre no te protege de Indecopi y cómo activar tu enlace con LibroDigital.pe en 3 minutos para ponerlo en tu bio."
            caption="Explicación en video: la verdad sobre vender por redes y el Libro de Reclamaciones."
          />

          {/* Section: Las tres excusas */}
          <h2 className="text-2xl font-display font-bold tracking-tight text-[#1b1611] mt-10 mb-4 border-b border-[#e3d9c6] pb-2">
            Las tres excusas que ya no valen después de la Ley 32495
          </h2>

          <h3 className="text-xl font-display font-semibold text-[#1b1611] mt-6 mb-2">
            Excusa #1: “Yo no tengo tienda online, solo vendo por Instagram”
          </h3>

          <p className="text-base leading-relaxed">
            Suena lógico, ¿no? “Tienda online” suena a página web con carrito de compras, pasarela de pago y todo el show.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Pero la lógica de la ley es otra: no importa dónde cierres la venta, importa que estés vendiendo habitualmente a consumidores. Si tus clientes te escriben por DM, te hacen Yape y tú les mandas el paquete por Olva, tienes una tienda. Una tienda sin estantes, pero tienda al fin.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Y “habitual” es la palabra clave. Una venta suelta de tu closet no es lo mismo que publicar productos cada semana, tener clientes recurrentes y vivir de eso.
          </p>

          <h3 className="text-xl font-display font-semibold text-[#1b1611] mt-6 mb-2">
            Excusa #2: “Vendo por Mercado Libre, ellos tienen su propio libro de reclamaciones”
          </h3>

          <p className="text-base leading-relaxed">
            Esta es la favorita, y la más peligrosa.
          </p>

          <p className="text-base leading-relaxed mt-3">
            La idea es: “Si el marketplace ya lo tiene, yo estoy cubierto”. Pero la realidad es que cada vendedor con RUC que le vende a consumidores finales necesita su propio libro, aunque venda únicamente a través de un marketplace.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Piénsalo así: el centro comercial tiene su libro en administración, pero la tienda de zapatillas del segundo piso también tiene el suyo. Que el mall cumpla no te exonera a ti. El marketplace es el centro comercial; tú eres la tienda.
          </p>

          {/* Promotional Bridge 1 */}
          <PromotionalCallout
            badge="Enlace listo para tu Bio y Marketplace"
            title="Con LibroDigital.pe obtienes tu URL directa y código QR en 3 minutos"
            description="Copia tu link oficial librodigital.pe/tu-tienda en la bio de tu Instagram o en la confirmación de Mercado Libre. Cumple la Ley 32495 desde S/ 89 al año."
            buttonText="Obtener mi enlace oficial"
            buttonHref="/acceso?modo=registro"
          />

          <h3 className="text-xl font-display font-semibold text-[#1b1611] mt-6 mb-2">
            Excusa #3: “Soy muy chiquito, a mí nadie me va a fiscalizar”
          </h3>

          <p className="text-base leading-relaxed">
            Ah, la clásica. Funciona hasta que deja de funcionar. Y cuando deja de funcionar, normalmente es porque un cliente molesto presentó una denuncia, no porque INDECOPI te estuviera buscando personalmente.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Piensa en ese cliente al que le llegó tarde el pedido, o que recibió el color equivocado, o que se sintió mal atendido. Si te escribió y tú le dijiste “ya po, qué quieres que haga”, y no tenías dónde dejar formalmente su reclamo, ya tienes un problema. Y no es de ventas.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Fiscalizar a una MYPE no requiere que seas famoso. Requiere que alguien se queje y se dé cuenta de que no tenías cómo recibir esa queja.
          </p>

          {/* Section: ¿Esto me aplica? */}
          <h2 className="text-2xl font-display font-bold tracking-tight text-[#1b1611] mt-10 mb-4 border-b border-[#e3d9c6] pb-2">
            ¿Esto me aplica? El mini quiz de 60 segundos
          </h2>

          <p className="text-base leading-relaxed">
            Responde sí o no. No hagas trampa, aquí solo estamos tú y yo.
          </p>

          {/* Interactive Quiz Component */}
          <MiniQuizEcommerceVisual />

          <p className="text-base leading-relaxed mt-3">
            Si respondiste sí a las cuatro: necesitas tu propio libro de reclamaciones, y que el enlace esté a la vista de todos. Sí, aunque solo vendas por Instagram. Sí, aunque solo vendas por Mercado Libre.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Si respondiste no a alguna: probablemente estás en otra situación. Pero ojo, si no estás seguro, es mejor consultarlo antes de que lo consulte un fiscalizador por ti.
          </p>

          {/* Section: Visible y fácilmente accesible */}
          <h2 className="text-2xl font-display font-bold tracking-tight text-[#1b1611] mt-10 mb-4 border-b border-[#e3d9c6] pb-2">
            “Visible y fácilmente accesible”: qué significa en la vida real
          </h2>

          <p className="text-base leading-relaxed">
            Aquí viene la parte práctica, porque “visible” no es un adjetivo muy detallado que digamos. La ley pide que el enlace esté exhibido permanentemente y en un lugar visible y fácilmente accesible.
          </p>

          <p className="text-base leading-relaxed mt-3">
            Traducción: que tu cliente no tenga que hacer una búsqueda del tesoro.
          </p>

          <p className="text-base leading-relaxed mt-3">
            La norma no baja a este nivel de detalle, así que lo siguiente es sentido común (y lo que yo haría en tu lugar):
          </p>

          <h3 className="text-lg font-display font-semibold text-[#1b1611] mt-6 mb-2">
            Si tienes página web o tienda propia:
          </h3>

          <ul className="my-3 space-y-2 text-base text-[#1b1611] list-disc pl-5">
            <li>Ponlo en un lugar que se vea desde cualquier página, no solo en la home.</li>
            <li>Que no esté escondido en el footer del footer, en letra de 6 puntos, color gris claro sobre fondo blanco. Eso no es “fácilmente accesible”, eso es “escondido con mala fe”.</li>
            <li>Que funcione en celular. La mayoría de tus clientes compra desde ahí.
              <span className="block text-xs text-[#1e6b4a] font-semibold mt-0.5">
                → LibroDigital.pe ofrece formulario web responsive y widget oficial para copiar y pegar en 1 minuto.
              </span>
            </li>
          </ul>

          <h3 className="text-lg font-display font-semibold text-[#1b1611] mt-6 mb-2">
            Si vendes por Instagram:
          </h3>

          <ul className="my-3 space-y-2 text-base text-[#1b1611] list-disc pl-5">
            <li>Ponlo en el link de tu bio, de manera clara y no hundido en la quinta opción de tu Linktree.</li>
            <li>Si usas historias destacadas, crea una que diga “Reclamos” o “Libro de reclamaciones”.</li>
            <li>Cuando cierres una venta por DM o WhatsApp, puedes enviar el enlace junto con la confirmación del pedido.</li>
          </ul>

          <h3 className="text-lg font-display font-semibold text-[#1b1611] mt-6 mb-2">
            Si vendes por marketplace:
          </h3>

          <ul className="my-3 space-y-2 text-base text-[#1b1611] list-disc pl-5">
            <li>Usa los espacios que la plataforma te permita para tu perfil o tu tienda, siempre respetando sus políticas.</li>
            <li>Incluye el enlace en la comunicación con el comprador (por ejemplo, en la tarjetita dentro del paquete).</li>
          </ul>

          <div className="my-6 rounded-2xl border-l-4 border-amber-500 bg-amber-50/70 p-5 text-sm">
            <p className="font-bold text-amber-950">
              La regla de oro: si tu mamá, que no sabe dónde queda el menú de ajustes de su celular, puede encontrar el enlace en menos de 10 segundos, estás bien. Si necesita llamar a su sobrino técnico, no.
            </p>
          </div>

          {/* Section: Entonces, ¿qué hago? */}
          <h2 className="text-2xl font-display font-bold tracking-tight text-[#1b1611] mt-10 mb-4 border-b border-[#e3d9c6] pb-2">
            Entonces, ¿qué hago?
          </h2>

          <p className="text-base leading-relaxed">
            Respira. No es una catástrofe, es una tarea pendiente.
          </p>

          <ol className="my-4 space-y-2 text-base text-[#1b1611] list-decimal pl-5">
            <li>Confirma si te aplica con el mini quiz de arriba.</li>
            <li>Consigue tu libro de reclamaciones virtual.</li>
            <li>Pon el enlace donde cualquiera lo vea.</li>
            <li>Actualiza tus canales: bio, web, mensajes automáticos, lo que uses.</li>
            <li>Responde los reclamos cuando lleguen. Lo bueno de tenerlos formalizados es que también te ayudan a ver qué está fallando en tu negocio.</li>
          </ol>

          <p className="text-base leading-relaxed mt-3">
            Y si quieres hacerlo sin volverte medio abogado en el intento, existen soluciones pensadas justo para MYPEs.
          </p>

          {/* Section: Un último dato, sin presión */}
          <h2 className="text-2xl font-display font-bold tracking-tight text-[#1b1611] mt-10 mb-4 border-b border-[#e3d9c6] pb-2">
            Un último dato, sin presión
          </h2>

          <p className="text-base leading-relaxed">
            En{' '}
            <Link href="/" className="font-bold text-[#c02b0a] hover:underline">
              LibroDigital.pe
            </Link>{' '}
            armamos un libro de reclamaciones virtual pensado para negocios chicos: precio bajo, configuración simple y con ayuda de IA para que no tengas que descifrar manuales a medianoche. Si Karla hubiera tenido uno, el chat con Vanessa habría sido mucho más corto (y su semana, mucho más tranquila).
          </p>

          <p className="text-base leading-relaxed mt-3">
            Si te interesa, échale un ojo. Y si no, igual quédate con lo importante: que vendas por Instagram, Mercado Libre o por palomas mensajeras, si le vendes habitualmente a consumidores, el libro de reclamaciones también va contigo.
          </p>

          {/* Verification and legal notice */}
          <div className="my-8 rounded-xl border border-[#d6c7b0] bg-[#fbf7ed] p-4 text-xs text-[#5c5246] leading-relaxed">
            <p className="font-mono uppercase font-bold text-[#1b1611] mb-1">
              Nota legal y verificación de fuentes:
            </p>
            <p>
              Este artículo es informativo y no reemplaza la asesoría legal de un profesional. La Ley N.° 32495 fue publicada en el Diario Oficial El Peruano el 11 de noviembre de 2025, modificando los artículos 150 y 151 del Código de Protección y Defensa del Consumidor (Ley N.° 29571) para exigir permanentemente el enlace visible y accesible en plataformas de comercio electrónico.
            </p>
          </div>

          {/* Final CTA Box */}
          <div className="mt-12 rounded-3xl border-2 border-[#c02b0a] bg-gradient-to-br from-[#1b1611] via-[#2a221b] to-[#1b1611] p-8 text-white shadow-xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-3 text-center md:text-left">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c02b0a] px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-white">
                  <ShoppingBag className="h-3.5 w-3.5 text-amber-300" /> Especial para Tiendas Online & Redes
                </span>
                <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-[#f7f2e8]">
                  Activa tu Libro Virtual para Instagram o web en 3 minutos
                </h3>
                <p className="text-sm text-[#f7f2e8]/80 max-w-lg leading-relaxed">
                  Tu link personalizado librodigital.pe/tu-marca listo para poner en tu bio, widget para tu web y constancias PDF automáticas al correo de cada cliente.
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#f7f2e8]/70 pt-1 font-mono">
                  <span>✓ 15 días gratis de prueba</span>
                  <span>✓ Sin tarjeta de crédito</span>
                  <span>✓ Conforme a Ley 32495</span>
                </div>
              </div>

              <div className="flex flex-col gap-3 w-full sm:w-auto shrink-0">
                <Link href="/acceso?modo=registro">
                  <Button size="lg" className="w-full sm:w-auto bg-[#c02b0a] hover:bg-[#d6320d] text-white font-bold text-sm px-6 py-6 shadow-lg shadow-[#c02b0a]/30">
                    Empezar Prueba Gratis
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
            href="/articulos/nadie-fiscaliza-a-las-mype-historias-reales-multas"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#5c5246] hover:text-[#c02b0a]"
          >
            <ArrowLeft className="h-4 w-4" />
            Artículo anterior: Historias reales de multas
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
            Plataforma oficial de gestión del Libro de Reclamaciones conforme al Código de Protección y Defensa del Consumidor (Ley N.° 29571 y Ley N.° 32495).
          </p>
        </div>
      </footer>

      <BackToTop />
    </div>
  );
}
