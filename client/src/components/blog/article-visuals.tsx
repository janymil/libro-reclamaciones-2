import { useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Coffee,
  FileSpreadsheet,
  FileWarning,
  Flame,
  HelpCircle,
  Mail,
  Printer,
  QrCode,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Zap,
} from 'lucide-react';
import { StampMark } from '@/components/landing/brand';

/* Visual scene 1: The messy counter with coffee stain, lost chargers, and the dusty notebook */
export function CoffeeStainVisual() {
  return (
    <figure className="my-10 overflow-hidden rounded-2xl border-2 border-[#e3d9c6] bg-[#fbf7ed] shadow-md">
      <div className="relative border-b border-[#e3d9c6] bg-gradient-to-br from-[#f2e7d5] via-[#fbf7ed] to-[#ede3ce] p-6 sm:p-8">
        {/* Visual representation of the dusty counter search */}
        <div className="relative mx-auto max-w-lg rounded-xl border border-[#d6c7b0] bg-[#f4ece1] p-5 shadow-inner">
          <div className="flex items-center justify-between border-b border-[#e0d3c0] pb-3 text-xs font-mono uppercase tracking-wider text-[#8a7a67]">
            <span>Escena típica · Mostrador peruano</span>
            <span className="flex items-center gap-1 text-[#c02b0a] font-semibold">
              <AlertTriangle className="h-3.5 w-3.5" /> Estado: Crítico
            </span>
          </div>

          <div className="relative mt-4 flex flex-col items-center justify-center py-6 text-center">
            {/* The old notebook graphic */}
            <div className="relative w-full max-w-sm rounded-lg border-2 border-[#8a7258] bg-[#f8f2e6] p-5 shadow-xl rotate-[-2deg]">
              {/* Coffee stain visual effect */}
              <div
                aria-hidden="true"
                className="absolute right-4 top-2 h-20 w-20 rounded-full bg-[#784d2b]/25 blur-[1px] mix-blend-multiply flex items-center justify-center text-[10px] font-mono text-[#543319] opacity-75 rotate-12"
              >
                ☕ Mancha de café
              </div>
              <div
                aria-hidden="true"
                className="absolute -left-2 bottom-3 -rotate-45 rounded bg-amber-200/90 px-2 py-0.5 text-[9px] font-mono text-amber-900 border border-amber-400 shadow-sm"
              >
                ✂ Hoja arrancada para pedido
              </div>

              <div className="border-b border-[#8a7258]/30 pb-2 text-left">
                <span className="font-mono text-[10px] uppercase text-[#8a7258]">Cuaderno comercial · 2021</span>
                <p className="font-display text-base font-bold text-[#3d2f21]">LIBRO DE RECLAMACIONES</p>
              </div>

              <div className="mt-3 space-y-1.5 font-mono text-[11px] text-[#5c4a36] text-left">
                <p className="line-through text-red-700/60">Hoja N.° 001 - Reclamo gaseosa tibia</p>
                <p className="line-through text-red-700/60">Hoja N.° 002 - Falta de vuelto</p>
                <p className="text-red-700 font-bold bg-red-100/80 px-1 py-0.5 rounded">
                  [Hoja N.° 003: NO EXISTE · ARRANCADA]
                </p>
              </div>
            </div>

            <p className="mt-6 text-xs text-[#6e5d4a] italic max-w-sm">
              &quot;Tiene una mancha de café con forma de Bolivia, y alguien arrancó una hoja para anotar un pedido.&quot;
            </p>
          </div>
        </div>
      </div>
      <figcaption className="bg-[#f2ebdc] px-5 py-3 text-xs text-[#5c5246] flex items-center justify-between">
        <span><strong>Figura 1:</strong> La expedición debajo del mostrador cuando llega fiscalización.</span>
        <span className="font-mono text-[#c02b0a] font-semibold text-[11px]">Riesgo: 0.5 a 5 UIT</span>
      </figcaption>
    </figure>
  );
}

/* Visual scene 2: Multa vs Soles comparison card */
export function FinesVisual() {
  return (
    <aside className="my-8 rounded-2xl border-2 border-red-200 bg-gradient-to-br from-red-50/60 via-[#fdfaf3] to-amber-50/50 p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-md">
          <Scale className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-red-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-red-800">
              Normativa Oficial 2026
            </span>
            <span className="font-mono text-xs text-[#5c5246]">UIT 2026 = S/ 5,500</span>
          </div>
          <h4 className="mt-1 font-display text-lg font-bold text-[#1b1611]">
            El costo de &quot;está por ahí&quot; ante una inspección
          </h4>
          <p className="mt-1 text-sm text-[#5c5246]">
            No contar con el libro o no tener el aviso visible puede costar desde <strong>S/ 2,750</strong> hasta{' '}
            <strong>S/ 27,500</strong>. Mientras tanto, LibroDigital.pe te protege desde <strong>S/ 199/año</strong>.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-red-200/60">
        <div className="rounded-xl border border-red-200 bg-white/90 p-4">
          <span className="block font-mono text-xs uppercase tracking-wider text-red-700 font-semibold">
            Multa mínima (0.5 UIT)
          </span>
          <span className="mt-1 block font-mono text-2xl font-bold text-red-900">S/ 2,750</span>
          <span className="mt-0.5 block text-xs text-[#5c5246]">Equivalente a cientos de ventas o meses de trabajo.</span>
        </div>
        <div className="rounded-xl border border-red-300 bg-red-100/60 p-4">
          <span className="block font-mono text-xs uppercase tracking-wider text-red-800 font-bold">
            Multa máxima (5 UIT)
          </span>
          <span className="mt-1 block font-mono text-2xl font-bold text-red-950">S/ 27,500</span>
          <span className="mt-0.5 block text-xs text-[#5c5246]">Un golpe letal para cualquier bodega o MYPE.</span>
        </div>
      </div>
    </aside>
  );
}

/* Visual scene 3: Physical vs LibroDigital visual comparison card */
export function ModernLibroVisual() {
  return (
    <figure className="my-10 overflow-hidden rounded-2xl border-2 border-[#1e6b4a]/30 bg-white shadow-lg">
      <div className="bg-[#1e6b4a] px-6 py-4 text-white flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-5 w-5 text-amber-300" />
          <span className="font-display font-bold text-base">La Solución 2026: LibroDigital.pe</span>
        </div>
        <span className="rounded-full bg-white/20 px-3 py-1 font-mono text-xs">Cumplimiento 100% INDECOPI</span>
      </div>

      <div className="p-6 sm:p-8 bg-[#fdfaf3]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          {/* Left: The old chaotic way */}
          <div className="rounded-xl border border-red-200 bg-red-50/40 p-5">
            <div className="flex items-center gap-2 text-red-700 font-bold text-xs uppercase tracking-wide">
              <FileWarning className="h-4 w-4" /> El Libro Físico (El Fax)
            </div>
            <ul className="mt-3 space-y-2 text-xs text-[#5c5246]">
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold">✕</span> Hojas rotas, manchadas o extraviadas
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold">✕</span> Copia carbón ilegible o mal separada
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold">✕</span> Se pierde bajo el mostrador o en cajas
              </li>
              <li className="flex items-start gap-2">
                <span className="text-red-500 font-bold">✕</span> Cero control de los 15 días hábiles para responder
              </li>
            </ul>
          </div>

          {/* Right: The LibroDigital way */}
          <div className="rounded-xl border-2 border-[#1e6b4a] bg-emerald-50/60 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-[#1e6b4a] font-bold text-xs uppercase tracking-wide">
              <ShieldCheck className="h-4 w-4" /> Con LibroDigital.pe
            </div>
            <ul className="mt-3 space-y-2 text-xs text-[#1b1611] font-medium">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#1e6b4a] shrink-0" /> Código correlativo único automático
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#1e6b4a] shrink-0" /> Constancia inmediata al email del consumidor
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#1e6b4a] shrink-0" /> Cartel QR oficial para imprimir y enlace web
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#1e6b4a] shrink-0" /> Asistente de IA que redacta respuestas en plazo
              </li>
            </ul>
          </div>
        </div>

        {/* Promotion banner inside visual */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-[#e3d9c6] bg-white p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#c02b0a] text-white">
              <BookOpenCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1b1611]">Activa tu Libro Digital en 3 minutos</p>
              <p className="text-xs text-[#5c5246]">Prueba Pro gratuita sin tarjeta · Cancela cuando quieras</p>
            </div>
          </div>
          <Link href="/acceso?modo=registro">
            <Button size="sm" className="bg-[#c02b0a] hover:bg-[#9c2107] text-white shrink-0">
              Crear mi Libro Digital
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </div>
      <figcaption className="bg-[#f7f2e8] px-5 py-2.5 text-xs text-[#5c5246] border-t border-[#e3d9c6]">
        <strong>Figura 2:</strong> De la incertidumbre del papel a la tranquilidad digital.
      </figcaption>
    </figure>
  );
}

/* Callout linking to the app's features */
export function PromotionalCallout({
  icon: Icon = Sparkles,
  badge,
  title,
  description,
  buttonText = 'Ver planes y empezar gratis',
  buttonHref = '/acceso?modo=registro',
}: {
  icon?: any;
  badge?: string;
  title: string;
  description: string;
  buttonText?: string;
  buttonHref?: string;
}) {
  return (
    <div className="my-8 rounded-2xl border-2 border-[#c02b0a]/30 bg-gradient-to-br from-[#fdfaf3] via-white to-[#faefe8] p-6 shadow-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="space-y-1.5">
          {badge && (
            <span className="inline-block rounded-full bg-[#c02b0a]/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#c02b0a]">
              {badge}
            </span>
          )}
          <h4 className="font-display text-lg font-bold text-[#1b1611] flex items-center gap-2">
            <Icon className="h-5 w-5 text-[#c02b0a]" />
            {title}
          </h4>
          <p className="text-sm text-[#5c5246] max-w-xl">{description}</p>
        </div>
        <Link href={buttonHref} className="shrink-0">
          <Button className="bg-[#c02b0a] hover:bg-[#9c2107] text-white shadow-sm font-medium">
            {buttonText}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

/* Vertical TikTok-format promotional video component */
export function PromoVideoCard({
  poster = "/assets/librodigital-promo-poster.webp",
  webm = "/assets/librodigital-promo.webm",
  mp4 = "/assets/librodigital-promo.mp4",
  badge = "Video Oficial · 40 segundos",
  formatBadge = "TikTok & Reels Format",
  title = "Mira cómo funciona LibroDigital.pe en la vida real",
  description = "Sin rodeos: en 40 segundos ves cómo un cliente escanea el cartel QR con su celular, registra su reclamo en segundos y tú recibes la alerta con borrador de respuesta listo para cumplir la ley.",
  caption = "Demostración en video: del mostrador al registro digital sin fricción.",
}: {
  poster?: string;
  webm?: string;
  mp4?: string;
  badge?: string;
  formatBadge?: string;
  title?: string;
  description?: string;
  caption?: string;
}) {
  return (
    <figure className="my-10 overflow-hidden rounded-3xl border-2 border-[#e3d9c6] bg-gradient-to-br from-[#1b1611] via-[#241c15] to-[#1b1611] text-[#f7f2e8] shadow-xl">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 sm:p-8 items-center">
        {/* Left column: Video Player in vertical 9:16 phone mockup */}
        <div className="md:col-span-5 flex justify-center">
          <div className="relative w-full max-w-[260px] rounded-[36px] border-4 border-[#3d2f21] bg-black p-2 shadow-2xl ring-1 ring-white/10">
            {/* Phone speaker notch */}
            <div className="absolute left-1/2 top-3 h-1 w-12 -translate-x-1/2 rounded-full bg-neutral-700 z-20" />

            <div className="relative aspect-[9/16] overflow-hidden rounded-[28px] bg-black">
              <video
                controls
                playsInline
                preload="metadata"
                poster={poster}
                className="h-full w-full object-cover"
              >
                <source src={webm} type="video/webm" />
                <source src={mp4} type="video/mp4" />
                Tu navegador no soporta el reproductor de video HTML5.
              </video>
            </div>
          </div>
        </div>

        {/* Right column: Explanatory copy & conversion */}
        <div className="md:col-span-7 space-y-4 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#c02b0a] px-3 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
              {badge}
            </span>
            <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[10px] text-[#f7f2e8]/70">
              {formatBadge}
            </span>
          </div>

          <h3 className="font-display text-2xl font-extrabold text-white leading-tight">
            {title}
          </h3>

          <p className="text-sm text-[#f7f2e8]/80 leading-relaxed">
            {description}
          </p>

          <div className="space-y-2 pt-2 border-t border-white/10 text-xs text-[#f7f2e8]/90">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#1e6b4a] shrink-0" />
              <span>Cero apps por descargar para tus clientes</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#1e6b4a] shrink-0" />
              <span>Cartel oficial para imprimir en caja o mostrador</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#1e6b4a] shrink-0" />
              <span>Constancias oficiales con folio correlativo único</span>
            </div>
          </div>

          <div className="pt-3">
            <Link href="/acceso?modo=registro">
              <Button className="w-full sm:w-auto bg-[#c02b0a] hover:bg-[#d6320d] text-white font-bold text-xs px-5 py-5 shadow-lg shadow-[#c02b0a]/30">
                Crear mi Libro Digital en 3 minutos
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
      <figcaption className="border-t border-white/10 bg-black/40 px-6 py-2.5 text-center text-xs text-[#f7f2e8]/50">
        {caption}
      </figcaption>
    </figure>
  );
}

/* Landscape 16:9 widescreen promotional video component */
export function LandscapeVideoCard({
  poster = "/assets/multas-reales-poster.webp",
  webm = "/assets/multas-reales.webm",
  mp4 = "/assets/multas-reales.mp4",
  badge = "Video Exclusivo · Casos Reales",
  formatBadge = "16:9 HD",
  title = "Historias reales: cómo caen las MYPEs ante Indecopi",
  description = "Descubre en 60 segundos por qué el mito de 'a mí no me van a fiscalizar' cuesta miles de soles a pequeños negocios y cómo proteger el tuyo con LibroDigital.pe.",
  caption = "Video informe: casos reales de sanciones de Indecopi y cómo evitar multas de hasta S/ 27,500.",
}: {
  poster?: string;
  webm?: string;
  mp4?: string;
  badge?: string;
  formatBadge?: string;
  title?: string;
  description?: string;
  caption?: string;
}) {
  return (
    <figure className="my-10 overflow-hidden rounded-3xl border-2 border-[#e3d9c6] bg-gradient-to-br from-[#1b1611] via-[#241c15] to-[#1b1611] text-[#f7f2e8] shadow-xl">
      <div className="p-6 sm:p-8 space-y-6">
        {/* Header with Badges and Title */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="rounded-full bg-[#c02b0a] px-3 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                {badge}
              </span>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 font-mono text-[10px] text-[#f7f2e8]/70">
                {formatBadge}
              </span>
            </div>
            <h3 className="font-display text-xl sm:text-2xl font-extrabold text-white">
              {title}
            </h3>
          </div>
          <Link href="/acceso?modo=registro" className="shrink-0">
            <Button size="sm" className="bg-[#c02b0a] hover:bg-[#d6320d] text-white font-bold text-xs shadow-md">
              Proteger mi negocio
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        {/* 16:9 Video Player */}
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black border border-white/10 shadow-2xl">
          <video
            controls
            playsInline
            preload="metadata"
            poster={poster}
            className="h-full w-full object-cover"
          >
            <source src={webm} type="video/webm" />
            <source src={mp4} type="video/mp4" />
            Tu navegador no soporta el reproductor de video HTML5.
          </video>
        </div>

        {/* Video Description and Perks Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 text-xs text-[#f7f2e8]/80">
          <p className="max-w-xl leading-relaxed">
            {description}
          </p>
          <div className="flex items-center gap-4 shrink-0 font-mono text-[11px] text-[#f7f2e8]/70">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-[#1e6b4a]" /> 15 días gratis
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-[#1e6b4a]" /> Sin tarjeta
            </span>
          </div>
        </div>
      </div>

      <figcaption className="border-t border-white/10 bg-black/40 px-6 py-2.5 text-center text-xs text-[#f7f2e8]/50">
        {caption}
      </figcaption>
    </figure>
  );
}

/* Visual element representing the 5 profiles of customers */
export function FiveClientsVisual() {
  const clients = [
    {
      num: '1',
      title: 'El del vuelto (el principista)',
      tag: '10 céntimos',
      color: 'border-amber-400 bg-amber-50/70 text-amber-900',
      action: 'Dale el QR sin discutir y sigue tu día.',
    },
    {
      num: '2',
      title: 'El tiktoker (“estamos en vivo”)',
      tag: 'Buscador de drama',
      color: 'border-purple-400 bg-purple-50/70 text-purple-900',
      action: 'Cero show. Calma total: “escanea aquí y registra”.',
    },
    {
      num: '3',
      title: 'El sobrino abogado',
      tag: '“Yo sé de leyes”',
      color: 'border-blue-400 bg-blue-50/70 text-blue-900',
      action: 'No compitas en leyes. Dale el QR y su constancia.',
    },
    {
      num: '4',
      title: 'El “por si acaso”',
      tag: 'Misterioso',
      color: 'border-stone-400 bg-stone-50/70 text-stone-900',
      action: 'No interrogues: registro rápido y café en mano.',
    },
    {
      num: '5',
      title: 'El nostálgico del lapicero',
      tag: 'A la antigua',
      color: 'border-emerald-400 bg-emerald-50/70 text-emerald-900',
      action: 'Paciencia y ayuda con el celular en 1 minuto.',
    },
  ];

  return (
    <figure className="my-10 overflow-hidden rounded-2xl border-2 border-[#e3d9c6] bg-[#fbf7ed] p-6 shadow-md">
      <div className="flex items-center justify-between border-b border-[#e0d3c0] pb-3 text-xs font-mono uppercase tracking-wider text-[#8a7a67]">
        <span>Radiografía de mostrador · Los 5 clientes</span>
        <span className="text-[#c02b0a] font-bold">1 sola solución: QR LibroDigital.pe</span>
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {clients.map((c) => (
          <div key={c.num} className={`rounded-xl border p-3.5 shadow-sm ${c.color}`}>
            <div className="flex items-center justify-between">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/80 font-mono text-xs font-bold shadow-xs">
                {c.num}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 rounded bg-white/60 font-semibold">
                {c.tag}
              </span>
            </div>
            <h4 className="mt-2 text-xs font-bold leading-snug">{c.title}</h4>
            <p className="mt-1 text-[11px] opacity-85 leading-tight">{c.action}</p>
          </div>
        ))}

        {/* Summary card */}
        <div className="rounded-xl border-2 border-[#c02b0a] bg-gradient-to-br from-[#c02b0a] to-[#9c2107] text-white p-3.5 shadow-sm flex flex-col justify-between">
          <div>
            <span className="font-mono text-[10px] uppercase tracking-wider font-bold text-amber-200">
              El resultado
            </span>
            <p className="mt-1 text-xs font-bold leading-snug">
              Mismo proceso para todos: QR, constancia al correo y tú sigues vendiendo.
            </p>
          </div>
          <span className="mt-2 text-[10px] font-mono text-white/80 block">
            → 0 discusiones · 100% legal
          </span>
        </div>
      </div>

      <figcaption className="mt-4 pt-3 border-t border-[#e3d9c6] text-xs text-[#5c5246] flex items-center justify-between">
        <span><strong>Figura:</strong> Los 5 clientes que piden el libro y cómo desactivar la fricción en segundos.</span>
      </figcaption>
    </figure>
  );
}

/* Visual timeline & map of real Indecopi sanctions */
export function RealCasesVisual() {
  const cases = [
    {
      badge: 'Tienda Online / TikTok',
      entity: 'Emprendimiento Cosméticos',
      sancion: 'S/ 15,000 (pagó ~S/ 4,000 con allanamiento)',
      causa: 'Página web sin libro de reclamaciones virtual ni ícono',
      leccion: 'Corregirlo tras recibir la carta no borra la infracción.',
      tipo: 'MYPE',
      color: 'border-red-300 bg-red-50/60 text-red-950',
    },
    {
      badge: 'Restaurante / Físico',
      entity: 'Chifa Los Ángeles (Cajamarca)',
      sancion: 'Amonestación + Costas',
      causa: 'Negarse a entregar el libro y no exhibir el cartel en local',
      leccion: 'Empezó por un pedido demorado, no por una inspección programada.',
      tipo: 'MYPE',
      color: 'border-amber-300 bg-amber-50/60 text-amber-950',
    },
    {
      badge: 'Persona Natural con RUC',
      entity: 'Notaría en Piura',
      sancion: '2 UIT (Res. 0515-2022/SPC)',
      causa: 'No exhibir el cartel del aviso del Libro de Reclamaciones',
      leccion: 'Un cartel de papel ausente costó miles de soles en multas y costas.',
      tipo: 'Persona Natural',
      color: 'border-orange-300 bg-orange-50/60 text-orange-950',
    },
    {
      badge: 'Banca & Corporativo',
      entity: 'BBVA Perú (Agencia Puno)',
      sancion: '5 UIT = S/ 27,500 (Res. Final 044-2026)',
      causa: 'Negar libro presencial aduciendo que tenían libro virtual',
      leccion: 'Tener web no te exime si el cliente lo pide en el local.',
      tipo: 'Corporativo',
      color: 'border-blue-300 bg-blue-50/60 text-blue-950',
    },
    {
      badge: 'Comida Rápida',
      entity: 'McDonald’s (Arcos Dorados Arequipa)',
      sancion: 'Amonestación (Res. Final 285-2025)',
      causa: 'Negar libro físico y no facilitar el acceso al virtual',
      leccion: 'La ley prohíbe condicionar o negar el acceso inmediato.',
      tipo: 'Franquicia',
      color: 'border-yellow-300 bg-yellow-50/60 text-yellow-950',
    },
    {
      badge: 'Deficiencia Formal',
      entity: 'Interbank',
      sancion: '3.3 UIT (Res. 2727-2024/SPC)',
      causa: 'Hojas de reclamación sin la información mínima obligatoria',
      leccion: 'Hasta los grandes caen por formatos incompletos.',
      tipo: 'Banca',
      color: 'border-emerald-300 bg-emerald-50/60 text-emerald-950',
    },
  ];

  return (
    <figure className="my-10 overflow-hidden rounded-2xl border-2 border-[#d6c7b0] bg-white p-6 shadow-md">
      <div className="flex flex-wrap items-center justify-between border-b border-[#e0d3c0] pb-3 text-xs font-mono">
        <span className="uppercase tracking-wider text-[#8a7a67]">Expedientes Reales de Indecopi</span>
        <span className="font-bold text-[#c02b0a]">Norma: Ley 29571 & DS 011-2011-PCM</span>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
        {cases.map((item, idx) => (
          <div key={idx} className={`rounded-xl border p-4 shadow-xs ${item.color}`}>
            <div className="flex items-center justify-between">
              <span className="rounded bg-white/80 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[#1b1611]">
                {item.badge}
              </span>
              <span className="font-mono text-[10px] font-semibold text-[#5c5246]">{item.tipo}</span>
            </div>
            <h4 className="mt-2 text-sm font-bold">{item.entity}</h4>
            <div className="mt-1 font-mono text-xs font-bold text-red-700">
              Sanción: {item.sancion}
            </div>
            <p className="mt-1 text-xs opacity-90">
              <strong>Motivo:</strong> {item.causa}
            </p>
            <div className="mt-2 pt-2 border-t border-black/10 text-[11px] font-medium text-[#1b1611]/80">
              💡 <em>{item.leccion}</em>
            </div>
          </div>
        ))}
      </div>

      <figcaption className="mt-4 pt-3 border-t border-[#e3d9c6] text-xs text-[#5c5246] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span><strong>Figura:</strong> Casos verificados en resoluciones oficiales de Indecopi (2022-2026).</span>
        <span className="font-mono text-[#1e6b4a] font-bold text-[11px]">Solución: Cartel QR + LibroDigital.pe</span>
      </figcaption>
    </figure>
  );
}

/* Visual comparison: Google Form / PDF vs. LibroDigital.pe */
export function GoogleFormComparisonVisual() {
  return (
    <figure className="my-10 overflow-hidden rounded-2xl border-2 border-[#e3d9c6] bg-[#fbf7ed] p-6 shadow-md">
      <div className="border-b border-[#e0d3c0] pb-3 text-xs font-mono uppercase tracking-wider text-[#8a7a67]">
        Comparativa de Cumplimiento: Formulario Casero vs. Software Certificado
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Google Form / PDF */}
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4">
          <div className="font-mono text-xs uppercase font-bold text-red-700 flex items-center gap-1.5">
            <span>✕ Google Form / PDF improvisado</span>
          </div>
          <ul className="mt-3 space-y-2 text-xs text-[#5c5246]">
            <li>• Suele omitir campos mínimos del DS 011-2011-PCM (como le pasó a Interbank).</li>
            <li>• No entrega constancia formal en PDF con folio correlativo al cliente.</li>
            <li>• No cuenta los 15 días hábiles ni avisa si un reclamo está por vencer.</li>
            <li>• En fiscalización genera sospechas de alteración o registros incompletos.</li>
          </ul>
        </div>

        {/* LibroDigital.pe */}
        <div className="rounded-xl border-2 border-[#1e6b4a] bg-emerald-50/70 p-4 shadow-sm">
          <div className="font-mono text-xs uppercase font-bold text-[#1e6b4a] flex items-center gap-1.5">
            <span>✓ LibroDigital.pe</span>
          </div>
          <ul className="mt-3 space-y-2 text-xs text-[#1b1611] font-medium">
            <li>• Formato oficial 100% conforme a Ley 29571 y Anexo del DS 011-2011-PCM.</li>
            <li>• Generación automática de código correlativo y constancia PDF por correo.</li>
            <li>• Alertas automáticas de vencimiento del plazo de 15 días hábiles.</li>
            <li>• Asistente de IA que redacta respuestas conformes al marco normativo.</li>
          </ul>
        </div>
      </div>

      <figcaption className="mt-4 pt-3 border-t border-[#e3d9c6] text-xs text-[#5c5246]">
        <strong>Advertencia:</strong> Un formulario improvisado te expone a multas por información mínima omitida.
      </figcaption>
    </figure>
  );
}

/* Interactive WhatsApp chat simulation with typing effect and realistic bubbles */
export function WhatsAppChatSimulation() {
  const [messagesCount, setMessagesCount] = useState<number>(3);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const messages = [
    { sender: 'vanessa', name: 'Vanessa 🧁', text: 'Amiga, ¿viste lo de la ley nueva del libro de reclamaciones?', time: '11:42 AM' },
    { sender: 'karla', name: 'Karla 💅', text: 'Sí po, pero eso es para tiendas grandes, ¿no? Yo vendo solo por Insta y Mercado Libre.', time: '11:43 AM' },
    { sender: 'vanessa', name: 'Vanessa 🧁', text: 'Pero igual vendes, ¿no?', time: '11:43 AM' },
    { sender: 'karla', name: 'Karla 💅', text: 'Sí, pero no tengo local ni nada. Todo es por DM. Mercado Libre se encarga de todo lo demás.', time: '11:44 AM' },
    { sender: 'vanessa', name: 'Vanessa 🧁', text: 'Y tienes RUC, ¿no?', time: '11:44 AM' },
    { sender: 'karla', name: 'Karla 💅', text: 'Sí…', time: '11:45 AM' },
    { sender: 'vanessa', name: 'Vanessa 🧁', text: '¿Y le vendes a personas, o sea, a consumidores finales?', time: '11:45 AM' },
    { sender: 'karla', name: 'Karla 💅', text: 'Obvio, ¿a quién más le voy a vender las velas aromáticas?', time: '11:46 AM' },
    { sender: 'vanessa', name: 'Vanessa 🧁', text: '…', time: '11:46 AM' },
    { sender: 'karla', name: 'Karla 💅', text: '¿Por qué me escribes “…”? No me asustes.', time: '11:47 AM' },
    { sender: 'vanessa', name: 'Vanessa 🧁', text: 'Amiga, léete la Ley 32495. Ahora. Con calma. Y con un té.', time: '11:48 AM' },
  ];

  const handleNextMessage = () => {
    if (messagesCount < messages.length) {
      setMessagesCount(prev => prev + 1);
    }
  };

  const handleShowAll = () => {
    setMessagesCount(messages.length);
  };

  const handleReset = () => {
    setMessagesCount(3);
  };

  return (
    <figure className="my-8 mx-auto max-w-md overflow-hidden rounded-3xl border-4 border-[#242b2e] bg-[#0b141a] text-white shadow-2xl ring-1 ring-black/20">
      {/* WhatsApp Header */}
      <div className="flex items-center justify-between bg-[#1f2c34] px-4 py-3 border-b border-[#2a3942]">
        <div className="flex items-center gap-3">
          <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-pink-500 to-rose-400 text-white font-bold text-sm shadow">
            V
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-[#1f2c34] bg-emerald-500" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-sm text-[#e9edef] leading-tight">Vanessa 🧁</p>
            </div>
            <p className="text-[11px] text-[#8696a0]">en línea</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {messagesCount < messages.length ? (
            <button
              onClick={handleShowAll}
              className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 underline underline-offset-2 px-2 py-1"
            >
              Ver completo
            </button>
          ) : (
            <button
              onClick={handleReset}
              className="text-[11px] font-mono text-[#8696a0] hover:text-[#e9edef] px-2 py-1"
            >
              Reiniciar
            </button>
          )}
        </div>
      </div>

      {/* WhatsApp Background Chat Area */}
      <div
        className="p-4 space-y-3 min-h-[360px] max-h-[500px] overflow-y-auto bg-[#0b141a]"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(31, 44, 52, 0.4) 0%, rgba(11, 20, 26, 0.95) 100%)',
        }}
      >
        <div className="text-center my-2">
          <span className="inline-block rounded-lg bg-[#182229] px-3 py-1 font-mono text-[10px] text-[#8696a0] uppercase tracking-wider">
            Hoy · 11:42 AM
          </span>
        </div>

        {messages.slice(0, messagesCount).map((msg, idx) => {
          const isMe = msg.sender === 'karla';
          return (
            <div
              key={idx}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} transition-all duration-300 animate-in fade-in slide-in-from-bottom-2`}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                  isMe
                    ? 'bg-[#005c4b] text-[#e9edef] rounded-tr-xs'
                    : 'bg-[#202c33] text-[#e9edef] rounded-tl-xs'
                }`}
              >
                <p className="text-[10px] font-semibold text-emerald-400 mb-0.5">
                  {msg.name}
                </p>
                <p className="leading-relaxed text-[13px]">{msg.text}</p>
                <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-[#8696a0]">
                  <span>{msg.time}</span>
                  {isMe && <span className="text-[#53bdeb]">✓✓</span>}
                </div>
              </div>
            </div>
          );
        })}

        {messagesCount < messages.length && (
          <div className="pt-2 flex justify-center">
            <Button
              size="sm"
              onClick={handleNextMessage}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-full px-4 py-1.5 shadow-md flex items-center gap-1.5"
            >
              <span>Continuar leyendo chat</span>
              <span className="text-[10px] opacity-75">({messagesCount}/{messages.length})</span>
            </Button>
          </div>
        )}
      </div>

      <figcaption className="border-t border-[#242b2e] bg-[#111b21] px-4 py-2 text-center text-xs text-[#8696a0]">
        <strong>Chat real entre emprendedoras:</strong> cuando descubres que la Ley 32495 también te incluye a ti.
      </figcaption>
    </figure>
  );
}

/* Interactive Mini Quiz of 60 seconds */
export function MiniQuizEcommerceVisual() {
  const [answers, setAnswers] = useState<Record<number, boolean | null>>({
    0: null,
    1: null,
    2: null,
    3: null,
  });

  const questions = [
    '¿Tienes RUC activo como persona natural o jurídica?',
    '¿Le vendes a personas naturales que compran para uso propio (no para revender)?',
    '¿Vendes por tu web propia, app, redes sociales (Instagram/Facebook/TikTok) o marketplaces?',
    '¿Lo haces con cierta frecuencia o habitualidad (es un negocio y no una venta ocasional de ropa usada)?',
  ];

  const handleToggle = (index: number, val: boolean) => {
    setAnswers(prev => ({ ...prev, [index]: val }));
  };

  const answeredCount = Object.values(answers).filter(v => v !== null).length;
  const allYes = Object.values(answers).every(v => v === true);
  const isComplete = answeredCount === 4;

  return (
    <figure className="my-10 overflow-hidden rounded-3xl border-2 border-[#e3d9c6] bg-white p-6 sm:p-8 shadow-lg">
      <div className="flex items-center justify-between border-b border-[#e3d9c6] pb-4 mb-5">
        <div>
          <span className="rounded-full bg-[#c02b0a]/10 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[#c02b0a]">
            Test de 60 segundos
          </span>
          <h3 className="font-display text-xl font-bold text-[#1b1611] mt-1">
            ¿Tu negocio online está obligado por la Ley 32495?
          </h3>
        </div>
        <span className="font-mono text-xs text-[#8a7a67]">
          {answeredCount}/4 respondidas
        </span>
      </div>

      <div className="space-y-4">
        {questions.map((q, idx) => (
          <div
            key={idx}
            className={`rounded-xl border p-4 transition-colors ${
              answers[idx] !== null ? 'border-[#c02b0a]/30 bg-[#fdfaf3]' : 'border-gray-200 bg-white'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-sm font-medium text-[#1b1611] leading-relaxed">
                {idx + 1}. {q}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggle(idx, true)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                    answers[idx] === true
                      ? 'bg-[#1e6b4a] text-white shadow-sm'
                      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  SÍ
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(idx, false)}
                  className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                    answers[idx] === false
                      ? 'bg-neutral-800 text-white shadow-sm'
                      : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  NO
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quiz Evaluation Box */}
      {isComplete && (
        <div className={`mt-6 rounded-2xl p-5 border-2 animate-in fade-in duration-300 ${
          allYes
            ? 'border-red-300 bg-red-50/70 text-red-950'
            : 'border-blue-300 bg-blue-50/70 text-blue-950'
        }`}>
          {allYes ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-display text-lg font-bold text-red-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-red-600 text-white text-sm">!</span>
                Resultado: SÍ estás obligado a tener Libro de Reclamaciones
              </div>
              <p className="text-sm text-red-900 leading-relaxed font-medium">
                Respondiste <strong>SÍ a las 4 preguntas</strong>: conforme a la Ley 32495 y al Código de Protección al Consumidor,
                debes contar con tu propio Libro de Reclamaciones Virtual y exhibir el enlace de forma permanente y accesible en tu bio de Instagram, web o empaque.
              </p>
              <div className="pt-2">
                <Link href="/acceso?modo=registro">
                  <Button size="sm" className="bg-[#c02b0a] hover:bg-[#9c2107] text-white font-bold text-xs">
                    Crear mi Libro Digital en 3 minutos
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 font-display text-base font-bold text-blue-900">
                <span>ℹ</span> Resultado: Situación especial
              </div>
              <p className="text-xs text-blue-900 leading-relaxed">
                Respondiste NO a alguna de las preguntas. Si no realizas ventas habituales a consumidores finales o no cuentas con RUC comercial, podrías estar en un supuesto distinto; no obstante, si tu volumen crece es aconsejable formalizar tu canal preventivamente.
              </p>
            </div>
          )}
        </div>
      )}

      <figcaption className="mt-4 pt-3 border-t border-[#e3d9c6] text-xs text-[#5c5246] text-center">
        Diagnóstico rápido según la Ley N.° 32495 (publicada el 11 de noviembre de 2025).
      </figcaption>
    </figure>
  );
}
