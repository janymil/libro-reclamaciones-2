import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  PLANS,
  PLAN_LIST,
  RETENTION_MONTHS,
  LAUNCH_OFFER_ANNUAL_BASICO,
  REGULAR_ANNUAL_BASICO,
  LAUNCH_OFFER_SEATS,
  MULTI_YEAR_DISCOUNT_NOTE,
  type PlanDefinition,
} from '@shared/plans';
import { BrandMark, StampMark, QrGlyph, HojaDocument } from '@/components/landing/brand';
import BackToTop from '@/components/layout/back-to-top';
import { useAuth } from '@/hooks/use-auth';
import { usePlans, useTrialDays } from '@/hooks/use-subscription';
import { ADMIN_PATH } from '@/lib/admin-path';
import {
  LEGAL_DOCUMENTS,
  LIBRO_DE_RECLAMACIONES_PENDING,
  LIBRO_DE_RECLAMACIONES_URL,
  OPERATOR,
} from '@/lib/platform-legal';
import { FINE_CAPS, FOOTER_NORMS, UIT_2026 } from '@/lib/legal-norms';
import { formatIgvRate } from '@shared/tax';
import {
  ArrowRight,
  Sparkles,
  Timer,
  PenLine,
  Gavel,
  BrainCircuit,
  ShieldCheck,
  FileCheck2,
  ExternalLink,
  Menu,
  X,
  CircleCheck,
  Landmark,
  BookOpenCheck,
  Mail,
  Phone,
  Pause,
  Play,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* Content constants                                                           */
/* -------------------------------------------------------------------------- */

// Contacto oficial de la plataforma y datos del prestador: viven en
// `@/lib/platform-legal` para que el pie, el aviso legal, los términos y la
// política de privacidad no puedan contradecirse.
const REGISTER_URL = '/acceso?modo=registro';
const LOGIN_URL = '/acceso?modo=ingresar';

// Multas: topes del art. 110 del Código de Protección y Defensa del Consumidor
// (escala y UIT verificadas en client/src/lib/legal-norms.ts).
const FINES = FINE_CAPS;

const soles = (n: number) =>
  new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    maximumFractionDigits: 0,
  }).format(n);

const STEPS = [
  {
    title: 'Registre su empresa',
    body: 'RUC, sucursales y equipo en minutos. Sin instalación ni papel.',
  },
  {
    title: 'Publique su QR o enlace',
    body: 'Cartel imprimible para caja o mostrador y widget para su tienda online.',
  },
  {
    title: 'Su cliente reclama',
    body: 'Formulario oficial que diferencia reclamo de queja y entrega constancia al instante.',
  },
  {
    title: 'Responda a tiempo',
    body: 'La IA redacta la respuesta y el plazo de 15 días hábiles se controla solo.',
  },
];

const AI_FEATURES = [
  {
    icon: BrainCircuit,
    title: 'Clasifica y prioriza',
    body: 'Cada reclamo entra etiquetado: tipo, prioridad, riesgo y área responsable. Con auto-asignación al equipo correcto.',
  },
  {
    icon: PenLine,
    title: 'Redacta con su tono',
    body: 'Borradores de respuesta conformes al Código (Ley N.° 29571) y a su Reglamento, escritos con las políticas y el tono de su marca. Usted solo revisa y envía.',
  },
  {
    icon: Gavel,
    title: 'Previene multas',
    body: 'Detector de cláusulas abusivas (arts. 49 y 50 del Código) y predicción de SLA que alerta antes de que un plazo venza.',
  },
];

const SECTORS = ['Restaurantes', 'Colegios', 'Hoteles', 'Tiendas online', 'Clínicas', 'Gimnasios'];

/**
 * The FAQ copy, built from the trial length in force.
 *
 * A function, not a constant: an operator can change the trial from the console
 * (Planes), and a landing page that still says "15 días" would be promising something
 * the app no longer gives.
 */
const faqItems = (trialDays: number) => [
  {
    q: '¿INDECOPI certifica o registra mi Libro de Reclamaciones?',
    a: 'No. El Reglamento no exige registrar el Libro ante INDECOPI ni legalizarlo notarialmente: la obligación es del proveedor, que debe implementar el formato oficial, mantenerlo disponible y responder. LibroDigital.pe facilita ese cumplimiento; no constituye un aval del Estado.',
  },
  {
    q: '¿Cuál es el plazo para responder un reclamo?',
    a: 'Quince (15) días hábiles improrrogables, tanto para reclamos como para quejas (art. 152 del Código, modificado por la Ley N.° 31435, vigente desde el 21/05/2022; el Reglamento se adecuó por DS N.° 101-2022-PCM). La plataforma lo calcula con el calendario oficial de feriados peruanos y alerta a su equipo antes del vencimiento.',
  },
  {
    q: '¿Necesito tener página web?',
    a: 'No si atiende en un local: le basta el enlace público y el código QR imprimible para su caja o mostrador. Si vende por Internet o es una plataforma de comercio electrónico, debe publicar un aviso o enlace visible y fácilmente accesible a su Libro (art. 151 del Código, modificado por la Ley N.° 32495).',
  },
  {
    q: '¿Qué pasa si INDECOPI me fiscaliza?',
    a: 'Exporta el expediente completo (PDF/CSV) y el reporte SIREC en minutos: folios correlativos, constancias, respuestas y fechas. Cada registro se conserva durante 24 meses conforme a la normativa.',
  },
  {
    q: '¿La prueba gratis tiene compromiso?',
    a: `No. Todos los planes incluyen ${trialDays} días de prueba con las funciones del plan Pro, sin tarjeta de crédito. Si no continúa, sus datos se eliminan según la política de retención.`,
  },
  {
    q: '¿Emiten factura o boleta electrónica?',
    a: `Sí. Todos los precios incluyen IGV (${formatIgvRate()}) y por cada pago emitimos factura o boleta electrónica válida ante SUNAT. La eliges antes de pagar —la factura requiere RUC— y el PDF y el XML llegan a tu correo dentro de los 3 días hábiles; también quedan disponibles en Pagos.`,
  },
  {
    q: '¿Qué pasa con los datos personales de mis clientes?',
    a: 'Se tratan conforme a la Ley N.º 29733 de Protección de Datos Personales y su reglamento (DS 016-2024-JUS), con cifrado, control de acceso por roles y eliminación programada al cumplir el plazo legal.',
  },
  {
    q: '¿Puedo usar mi propio tono en las respuestas?',
    a: 'Sí. Desde el plan Pro, la IA redacta con el tono de su marca y sus políticas internas; usted revisa, ajusta y envía.',
  },
];

/* -------------------------------------------------------------------------- */
/* Motion & shared atoms                                                       */
/* -------------------------------------------------------------------------- */

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function Reveal({
  as,
  children,
  delay = 0,
  className = '',
}: {
  /** Element to render (default div); keeps list markup valid when set to "li". */
  as?: ElementType;
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const { ref, visible } = useReveal<HTMLElement>();
  const Tag = as ?? 'div';
  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`reveal ${visible ? 'reveal-visible' : ''} ${className}`}
    >
      {children}
    </Tag>
  );
}

function Eyebrow({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <p
      className={`font-mono text-xs uppercase tracking-[0.28em] ${
        dark ? 'text-amber-300' : 'text-[#c02b0a]'
      }`}
    >
      {children}
    </p>
  );
}

/* Decorative QR glyph + paper hoja now live in @/components/landing/brand */

/* -------------------------------------------------------------------------- */
/* Sections                                                                    */
/* -------------------------------------------------------------------------- */

const NAV_LINKS = [
  { href: '#como-funciona', label: 'Cómo funciona' },
  { href: '#ia', label: 'IA' },
  { href: '#producto', label: 'Producto' },
  { href: '#precios', label: 'Precios' },
  { href: '#faq', label: 'Preguntas' },
];

function Nav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[#e3d9c6]/80 bg-[#f7f2e8]/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8" aria-label="Principal">
        <a href="#top" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c02b0a] focus-visible:ring-offset-2">
          <BrandMark />
        </a>

        <div className="hidden items-center gap-7 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[#5c5246] transition-colors hover:text-[#c02b0a]"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/articulos"
            className="text-sm font-medium text-[#5c5246] transition-colors hover:text-[#c02b0a]"
            data-testid="nav-articulos"
          >
            Artículos
          </Link>
          <Link
            href="/contacto"
            className="text-sm font-medium text-[#5c5246] transition-colors hover:text-[#c02b0a]"
            data-testid="nav-nosotros"
          >
            Nosotros
          </Link>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link href={LOGIN_URL}>
            <Button
              variant="ghost"
              className="text-sm font-semibold text-[#1b1611] hover:bg-[#1b1611]/5 hover:text-[#1b1611]"
            >
              Iniciar sesión
            </Button>
          </Link>
          <Link href={REGISTER_URL}>
            <Button className="rounded-full bg-[#c02b0a] px-5 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(192,43,10,0.8)] transition-colors hover:bg-[#9c2107]">
              Empezar gratis
            </Button>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#1b1611] hover:bg-[#1b1611]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c02b0a] md:hidden"
        >
          {open ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-[#e3d9c6] bg-[#f7f2e8] px-5 pb-6 pt-3 md:hidden">
          <div className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm font-medium text-[#1b1611] hover:bg-[#1b1611]/5"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/articulos"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[#1b1611] hover:bg-[#1b1611]/5"
            >
              Artículos & Guías
            </Link>
            <Link
              href="/contacto"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[#1b1611] hover:bg-[#1b1611]/5"
            >
              Nosotros y contacto
            </Link>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Link href={LOGIN_URL}>
              <Button variant="outline" className="w-full border-[#1b1611]/20 bg-transparent text-[#1b1611] hover:bg-[#1b1611]/5">
                Iniciar sesión
              </Button>
            </Link>
            <Link href={REGISTER_URL}>
              <Button className="w-full rounded-full bg-[#c02b0a] font-semibold text-white hover:bg-[#9c2107]">
                Empezar gratis
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  const trialDays = useTrialDays();
  return (
    <section id="top" className="landing-paper relative overflow-hidden pt-28 md:pt-32">
      <div aria-hidden="true" className="landing-grid-bg absolute inset-0" />

      <div className="relative mx-auto grid max-w-6xl gap-14 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24">
        <div>
          <Reveal>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#1b1611]/15 bg-[#fdfaf3] px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#5c5246]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#1e6b4a]" aria-hidden="true" />
              Ley N.º 29571 · Ley N.º 31435 · DS 011-2011-PCM
            </p>
          </Reveal>

          <Reveal delay={90}>
            <h1 className="mt-6 text-balance font-display text-5xl font-medium leading-[1.02] tracking-tight text-[#1b1611] sm:text-6xl lg:text-[4.35rem]">
              Su Libro de Reclamaciones,{' '}
              <span className="italic text-[#c02b0a]">listo para la fiscalización.</span>
            </h1>
          </Reveal>

          <Reveal delay={180}>
            <p className="mt-6 max-w-xl text-pretty text-lg leading-relaxed text-[#5c5246]">
              Publique su libro virtual con QR, entregue constancias automáticas y responda
              cada reclamo dentro de los 15 días hábiles — con inteligencia artificial que
              clasifica, redacta y vigila los plazos por usted.
            </p>
          </Reveal>

          <Reveal delay={260}>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href={REGISTER_URL}>
                <Button className="h-12 rounded-full bg-[#1b1611] px-7 text-base font-semibold text-[#f7f2e8] shadow-[0_14px_30px_-12px_rgba(27,22,17,0.6)] transition-transform hover:translate-y-[-1px] hover:bg-[#000000]">
                  Empezar gratis · {trialDays} días
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Button>
              </Link>
              <a href="#como-funciona">
                <Button
                  variant="outline"
                  className="h-12 rounded-full border-[#1b1611]/25 bg-transparent px-7 text-base font-semibold text-[#1b1611] transition-colors hover:bg-[#1b1611] hover:text-[#f7f2e8]"
                >
                  Ver cómo funciona
                </Button>
              </a>
            </div>
          </Reveal>

          <Reveal delay={340}>
            <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#5c5246]">
              {['Sin tarjeta', 'QR y cartel incluidos', `${RETENTION_MONTHS} meses de resguardo`].map((item) => (
                <li key={item} className="flex items-center gap-1.5">
                  <CircleCheck className="h-4 w-4 text-[#1e6b4a]" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        {/* The paper hoja + stamp + live status chips */}
        <Reveal delay={200} className="relative mx-auto w-full max-w-md">
          <div className="relative">
            <HojaDocument className="rotate-[-1.5deg]" />
            <StampMark className="absolute -right-6 -top-9 rotate-12" />

            <div className="absolute -left-4 top-1/3 hidden animate-float-soft items-center gap-2.5 rounded-xl border border-[#e3d9c6] bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur sm:flex">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1e6b4a]/10">
                <Timer className="h-4 w-4 text-[#1e6b4a]" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-mono text-[10px] uppercase tracking-widest text-[#5c5246]">Plazo</span>
                <span className="block text-sm font-semibold text-[#1b1611]">Quedan 6 días hábiles</span>
              </span>
            </div>

            <div className="absolute -bottom-7 -left-2 flex animate-float-soft items-center gap-2.5 rounded-xl border border-[#e3d9c6] bg-white/95 px-3.5 py-2.5 shadow-lg backdrop-blur [animation-delay:1.4s] sm:-left-10">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#c02b0a]/10">
                <Sparkles className="h-4 w-4 text-[#c02b0a]" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-mono text-[10px] uppercase tracking-widest text-[#5c5246]">IA</span>
                <span className="block text-sm font-semibold text-[#1b1611]">Reclamo · Prioridad alta</span>
              </span>
            </div>

            <div className="absolute -right-3 bottom-16 hidden animate-float-soft items-center gap-2 rounded-full border border-[#1e6b4a]/25 bg-[#1e6b4a]/10 px-4 py-2 text-xs font-semibold text-[#1e6b4a] [animation-delay:0.7s] md:flex">
              <CircleCheck className="h-4 w-4" aria-hidden="true" />
              Constancia enviada
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function RiskTicker() {
  const items = [
    'INDECOPI fiscaliza sin aviso previo',
    ...FINES.map((f) => `${f.label} · hasta ${f.uit} UIT ≈ ${soles(f.uit * UIT_2026)}`),
    `UIT 2026 = ${soles(UIT_2026)}`,
    'Plazo de respuesta · 15 días hábiles improrrogables',
  ];

  return (
    <div className="overflow-hidden border-y border-[#1b1611] bg-[#1b1611] py-3.5" role="note" aria-label="Multas referenciales por no tener Libro de Reclamaciones">
      <div className="marquee-track flex w-max animate-marquee gap-10 pr-10">
        {[...items, ...items].map((item, i) => (
          <span
            key={i}
            aria-hidden={i >= items.length}
            className="flex items-center gap-3 whitespace-nowrap font-mono text-xs uppercase tracking-[0.14em] text-[#f7f2e8]/85"
          >
            <span className="inline-block h-1.5 w-1.5 rotate-45 bg-[#c02b0a]" aria-hidden="true" />
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

const STATS = (trialDays: number) => [
  { value: `${RETENTION_MONTHS}`, unit: 'meses', label: 'de resguardo de expedientes y constancias' },
  { value: `${trialDays}`, unit: 'días', label: 'de prueba gratis, sin tarjeta' },
  { value: '15', unit: 'días hábiles', label: 'calculados con los feriados del Perú' },
  { value: '0', unit: 'hojas', label: 'de papel: QR, enlace y widget para su tienda' },
];

function StatsBand() {
  const trialDays = useTrialDays();
  const stats = STATS(trialDays);

  return (
    <section className="border-b border-[#e3d9c6] bg-[#fdfaf3]" aria-label="Cifras clave">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-px px-5 sm:px-8 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Reveal as="li" key={stat.label} delay={i * 90} className="py-10 text-center lg:py-12">
            <span className="font-mono text-4xl font-bold tabular-nums text-[#1b1611] md:text-5xl">
              {stat.value}
              <span className="ml-1.5 text-base font-medium uppercase tracking-wide text-[#c02b0a]">
                {stat.unit}
              </span>
            </span>
            <span className="mx-auto mt-3 block max-w-[16rem] text-sm leading-snug text-[#5c5246]">
              {stat.label}
            </span>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

function IntroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Respect the OS "reduce motion" setting: no autoplay at all.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      video.pause();
      setPlaying(false);
      return;
    }

    if (typeof IntersectionObserver === 'undefined') return;

    // Decode only while visible. The clip loops, so an off-screen decoder would
    // burn CPU/battery for nothing.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
        } else {
          video.pause();
          setPlaying(false);
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  return (
    <Reveal delay={140}>
      <figure className="relative mt-10 overflow-hidden rounded-2xl border border-[#e3d9c6] bg-[#1b1611] shadow-[0_24px_60px_-30px_rgba(27,22,17,0.55)]">
        <video
          ref={videoRef}
          className="aspect-video w-full"
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          poster="/assets/intro-video-v2-poster.webp"
          aria-label="Recorrido de 10 segundos por LibroDigital"
        >
          <source src="/assets/intro-video-v2.webm" type="video/webm" />
          <source src="/assets/intro-video-v2.mp4" type="video/mp4" />
          Su navegador no admite video HTML5.
        </video>
        <figcaption className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-[#1b1611]/70 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#f7f2e8]/90 backdrop-blur">
          LibroDigital en 10 segundos
        </figcaption>
        <button
          type="button"
          onClick={togglePlayback}
          className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 bg-[#1b1611]/70 text-[#f7f2e8] backdrop-blur transition-colors hover:bg-[#1b1611] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f7f2e8]"
          aria-label={playing ? 'Pausar el video' : 'Reproducir el video'}
        >
          {playing ? (
            <Pause className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </figure>
    </Reveal>
  );
}

function HowItWorks() {
  return (
    <section id="como-funciona" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-28">
      <Reveal className="max-w-2xl">
        <Eyebrow>Cómo funciona</Eyebrow>
        <h2 className="mt-4 text-balance font-display text-4xl font-medium tracking-tight text-[#1b1611] md:text-5xl">
          Del papel al cumplimiento en una tarde
        </h2>
        <p className="mt-4 text-pretty text-lg text-[#5c5246]">
          Sin instalación, sin equipo técnico y sin una sola hoja. Su libro queda operativo el
          mismo día.
        </p>
      </Reveal>

      <IntroVideo />

      <ol className="mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {STEPS.map((step, i) => (
          <Reveal
            as="li"
            key={step.title}
            delay={i * 110}
            className="group relative border-t-2 border-[#1b1611] pt-6"
          >
            <span className="font-mono text-5xl font-bold tabular-nums text-[#1b1611]/12 transition-colors group-hover:text-[#c02b0a]/30">
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="mt-4 font-display text-xl font-semibold text-[#1b1611]">{step.title}</h3>
            <p className="mt-2.5 text-[15px] leading-relaxed text-[#5c5246]">{step.body}</p>
          </Reveal>
        ))}
      </ol>

      <Reveal delay={200}>
        <div className="mt-14 flex flex-col items-start gap-4 rounded-2xl border border-[#e3d9c6] bg-[#fdfaf3] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex items-center gap-4">
            <QrGlyph className="w-14" />
            <div>
              <p className="font-semibold text-[#1b1611]">Su QR y su cartel oficial, al activar</p>
              <p className="text-sm text-[#5c5246]">
                Imprimible para caja (Anexo II) y enlazable desde su web o tienda online.
              </p>
            </div>
          </div>
          <Link href={REGISTER_URL}>
            <Button className="rounded-full bg-[#c02b0a] px-6 font-semibold text-white hover:bg-[#9c2107]">
              Activar mi libro
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

function AiShowcase() {
  return (
    <section id="ia" className="bg-[#1b1611] py-20 text-[#f7f2e8] md:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow dark>Inteligencia artificial incluida</Eyebrow>
          <h2 className="mt-4 text-balance font-display text-4xl font-medium tracking-tight md:text-5xl">
            Un libro que le ayuda a <span className="italic text-amber-300">responder a tiempo</span>
          </h2>
          <p className="mt-4 text-pretty text-lg text-[#f7f2e8]/70">
            Nuestra IA lee cada reclamo, lo clasifica y prepara un borrador de respuesta con su tono
            y sus políticas, antes de que usted abra el panel.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {AI_FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={i * 110}>
              <article className="group h-full rounded-2xl border border-[#f7f2e8]/12 bg-[#f7f2e8]/[0.04] p-7 transition-colors hover:border-amber-300/40 hover:bg-[#f7f2e8]/[0.07]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#c02b0a] text-white shadow-[0_10px_24px_-10px_rgba(192,43,10,0.9)]">
                  <feature.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold">{feature.title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-[#f7f2e8]/70">{feature.body}</p>
              </article>
            </Reveal>
          ))}
        </div>

        {/* Mini flow: complaint in → AI chips out → draft ready */}
        <Reveal delay={160}>
          <div
            aria-hidden="true"
            className="mt-12 overflow-hidden rounded-2xl border border-[#f7f2e8]/12 bg-[#f7f2e8]/[0.04]"
          >
            <div className="flex items-center gap-2 border-b border-[#f7f2e8]/10 px-5 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-[#c02b0a]" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#1e6b4a]" />
              <span className="ml-3 font-mono text-[11px] uppercase tracking-[0.18em] text-[#f7f2e8]/50">
                reclamo-entrante.txt → ia
              </span>
            </div>
            <div className="grid gap-6 p-6 md:grid-cols-[1.1fr_0.9fr] md:p-8">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#f7f2e8]/50">
                  Reclamo recibido
                </p>
                <p className="mt-2 font-display text-lg italic leading-relaxed text-[#f7f2e8]/85">
                  “El producto llegó con la caja abierta y sin el sello de garantía. Solicito el
                  cambio o la devolución del dinero…”
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {['Tipo: Reclamo', 'Prioridad: alta', 'Riesgo: medio', 'Área: Logística'].map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 font-mono text-[11px] font-semibold text-amber-300"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-[#f7f2e8]/12 bg-[#1b1611] p-5">
                <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#f7f2e8]/50">
                  <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                  Borrador de respuesta · DS 101-2022-PCM
                </p>
                <div className="mt-3 space-y-2.5">
                  <div className="h-2.5 w-full rounded bg-[#f7f2e8]/15" />
                  <div className="h-2.5 w-11/12 rounded bg-[#f7f2e8]/15" />
                  <div className="h-2.5 w-4/5 rounded bg-[#f7f2e8]/15" />
                  <div className="h-2.5 w-3/5 rounded bg-[#f7f2e8]/10" />
                </div>
                <p className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-[#6fcf97]">
                  <CircleCheck className="h-4 w-4" />
                  Lista para revisar y enviar · plazo 9/15 días
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const PANEL_ROWS = [
  { folio: 'R-2026-0512', consumer: 'M. Quispe', state: 'Recibido', days: '0/15', tone: 'text-[#c02b0a]' },
  { folio: 'R-2026-0508', consumer: 'J. Villalba', state: 'En proceso', days: '9/15', tone: 'text-amber-700' },
  { folio: 'Q-2026-0503', consumer: 'L. Ríos', state: 'En proceso', days: '11/15', tone: 'text-amber-700' },
  { folio: 'R-2026-0498', consumer: 'C. Mendoza', state: 'Respondido', days: '—', tone: 'text-[#1e6b4a]' },
];

function ProductShowcase() {
  return (
    <section id="producto" className="border-y border-[#e3d9c6] bg-[#fdfaf3] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>El producto</Eyebrow>
          <h2 className="mt-4 text-balance font-display text-4xl font-medium tracking-tight text-[#1b1611] md:text-5xl">
            Tres caras del mismo expediente
          </h2>
          <p className="mt-4 text-pretty text-lg text-[#5c5246]">
            Lo que ve su cliente, lo que ve su equipo y lo que recibe INDECOPI — todo conectado
            por el mismo folio correlativo.
          </p>
        </Reveal>

        <Reveal delay={140}>
          <Tabs defaultValue="formulario" className="mt-12">
            <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-full bg-[#1b1611]/5 p-1.5 sm:w-auto">
              {[
                { value: 'formulario', label: 'Formulario público' },
                { value: 'panel', label: 'Panel de gestión' },
                { value: 'expediente', label: 'Constancia y expediente' },
              ].map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="rounded-full px-5 py-2.5 text-sm font-semibold text-[#5c5246] data-[state=active]:bg-[#1b1611] data-[state=active]:text-[#f7f2e8]"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="formulario" className="mt-8">
              <div className="grid items-center gap-10 lg:grid-cols-2">
                <div>
                  <h3 className="font-display text-2xl font-semibold text-[#1b1611]">
                    El formulario oficial, sin fricción
                  </h3>
                  <ul className="mt-5 space-y-3.5 text-[15px] text-[#5c5246]">
                    {[
                      'Distingue reclamo (producto/servicio) de queja (atención), como exige el formato.',
                      'Valida documento, datos del consumidor y menores de edad.',
                      'Entrega constancia con código al instante y la envía por correo.',
                      'Funciona desde el QR de su caja, un enlace o el widget de su tienda.',
                    ].map((item) => (
                      <li key={item} className="flex gap-3">
                        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1e6b4a]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div aria-hidden="true" className="mx-auto w-full max-w-sm">
                  <HojaDocument className="rotate-[-1deg]" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="panel" className="mt-8">
              <div className="grid items-center gap-10 lg:grid-cols-2">
                <div>
                  <h3 className="font-display text-2xl font-semibold text-[#1b1611]">
                    Cada folio, con su plazo a la vista
                  </h3>
                  <ul className="mt-5 space-y-3.5 text-[15px] text-[#5c5246]">
                    {[
                      'Bandeja de expedientes con estado y conteo de días hábiles restantes.',
                      'Alertas y escalado automático antes de que un plazo venza.',
                      'Filtros por estado, tipo, prioridad, sucursal y fechas.',
                      'Exportación CSV y expediente ZIP para fiscalización.',
                    ].map((item) => (
                      <li key={item} className="flex gap-3">
                        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1e6b4a]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div
                  aria-hidden="true"
                  className="overflow-hidden rounded-xl border border-[#e3d9c6] bg-white shadow-[0_24px_50px_-24px_rgba(27,22,17,0.35)]"
                >
                  <div className="flex items-center justify-between border-b border-[#e3d9c6] bg-[#fdfaf3] px-4 py-3">
                    <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#5c5246]">
                      Expedientes
                    </span>
                    <span className="rounded-full bg-[#c02b0a]/10 px-2.5 py-0.5 font-mono text-[10px] font-bold text-[#c02b0a]">
                      2 vencen ≤ 3 días
                    </span>
                  </div>
                  <table className="w-full text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-[#e3d9c6] font-mono text-[10px] uppercase tracking-widest text-[#5c5246]">
                        <th className="px-4 py-2.5 font-medium">Folio</th>
                        <th className="px-4 py-2.5 font-medium">Consumidor</th>
                        <th className="px-4 py-2.5 font-medium">Estado</th>
                        <th className="px-4 py-2.5 text-right font-medium">Plazo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PANEL_ROWS.map((row) => (
                        <tr key={row.folio} className="border-b border-[#e3d9c6]/60 last:border-0">
                          <td className="px-4 py-2.5 font-mono font-semibold text-[#c02b0a]">{row.folio}</td>
                          <td className="px-4 py-2.5 text-[#1b1611]">{row.consumer}</td>
                          <td className="px-4 py-2.5 text-[#5c5246]">{row.state}</td>
                          <td className={`px-4 py-2.5 text-right font-mono font-semibold tabular-nums ${row.tone}`}>
                            {row.days}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="expediente" className="mt-8">
              <div className="grid items-center gap-10 lg:grid-cols-2">
                <div>
                  <h3 className="font-display text-2xl font-semibold text-[#1b1611]">
                    La constancia que el consumidor guarda
                  </h3>
                  <ul className="mt-5 space-y-3.5 text-[15px] text-[#5c5246]">
                    {[
                      'PDF con folio correlativo, código de verificación y sus datos de empresa.',
                      'Consulta pública del estado del reclamo, sin llamadas ni correos.',
                      'Expediente completo por caso: hoja, adjuntos, respuestas y fechas.',
                      'Reporte SIREC listo cuando INDECOPI lo solicite.',
                    ].map((item) => (
                      <li key={item} className="flex gap-3">
                        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1e6b4a]" aria-hidden="true" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div aria-hidden="true" className="relative mx-auto w-full max-w-sm">
                  <div className="rotate-[1.5deg] rounded-[3px] border border-[#e3d9c6] bg-white p-6 shadow-[0_24px_50px_-24px_rgba(27,22,17,0.35)]">
                    <div className="flex items-start justify-between border-b-2 border-[#1b1611] pb-3">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#5c5246]">
                          Constancia de registro
                        </p>
                        <p className="font-display text-lg font-semibold text-[#1b1611]">
                          Su reclamo fue recibido
                        </p>
                      </div>
                      <FileCheck2 className="h-6 w-6 text-[#1e6b4a]" />
                    </div>
                    <div className="mt-4 space-y-2 font-mono text-[12px] text-[#1b1611]">
                      <p className="flex justify-between"><span className="text-[#5c5246]">Folio</span><span className="font-bold text-[#c02b0a]">R-2026-0512</span></p>
                      <p className="flex justify-between"><span className="text-[#5c5246]">Código</span><span className="font-bold">7K2M-X9QD</span></p>
                      <p className="flex justify-between"><span className="text-[#5c5246]">Plazo máximo</span><span className="font-bold">15 días hábiles</span></p>
                    </div>
                    <div className="mt-4 flex items-end justify-between">
                      <p className="font-display text-[13px] italic text-[#1b1611]/70">
                        Conserve esta constancia para su seguimiento.
                      </p>
                      <QrGlyph className="w-12" />
                    </div>
                  </div>
                  <StampMark className="absolute -bottom-8 -right-4 rotate-[-14deg] scale-75" />
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </Reveal>
      </div>
    </section>
  );
}

function SocialProof() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 md:py-24" aria-label="Rubros">
      <Reveal>
        <p className="text-center font-mono text-xs uppercase tracking-[0.28em] text-[#5c5246]">
          Pensado para cada rubro obligado por ley
        </p>
        <ul className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
          {SECTORS.map((sector) => (
            <li
              key={sector}
              className="rounded-full border border-[#1b1611]/15 bg-[#fdfaf3] px-4 py-1.5 text-sm font-medium text-[#1b1611]"
            >
              {sector}
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}

function Pricing() {
  const [period, setPeriod] = useState<'monthly' | 'annual'>('annual');
  // Prices come from the console's price list (Planes) when an operator changed them;
  // while that loads - or if the request fails - the catalogue from shared/plans.ts is
  // used, which is exactly what the server charges when nobody overrode anything.
  const { data: livePlans } = usePlans();
  const trialDays = useTrialDays();
  const plans = livePlans && livePlans.length > 0 ? livePlans : PLAN_LIST;

  // Savings are computed from the price list, never hardcoded, so the copy can
  // never disagree with the price again.
  const maxAnnualSavingPct = Math.max(
    ...plans.filter((plan) => plan.priceMonthly > 0).map((plan) =>
      Math.round(((plan.priceMonthly * 12 - plan.priceAnnual) / (plan.priceMonthly * 12)) * 100),
    ),
  );

  // The comparison table's small print is derived from the plan catalogue too:
  // the page must never promise "unlimited from the cheapest plan" (the cheapest
  // plan is Gratis: 5 reclamos in total, Reclamos-only) and must never imply a
  // per-branch charge that does not exist (locales are a per-plan cap, not a
  // paid add-on: Básico 1, Pro 5, Empresarial unlimited).
  const freePlan = PLANS.gratis;
  const basicPlan = PLANS.esencial;
  const proPlan = PLANS.profesional;
  const businessPlan = PLANS.corporativo;
  const localesCopy = (plan: PlanDefinition) =>
    plan.limits.establishments === null
      ? `ilimitados en ${plan.name}`
      : `hasta ${plan.limits.establishments} en ${plan.name}`;

  return (
    <section id="precios" className="border-y border-[#e3d9c6] bg-[#fdfaf3] py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow>Precios</Eyebrow>
          <h2 className="mt-4 text-balance font-display text-4xl font-medium tracking-tight text-[#1b1611] md:text-5xl">
            Menos que el 0.04% de una multa leve
          </h2>
          <p className="mt-4 text-pretty text-lg text-[#5c5246]">
            Todos los planes incluyen {trialDays} días de prueba gratis, QR y cartel oficial,
            constancias automáticas y resguardo de {RETENTION_MONTHS} meses.
            Reclamos <strong>ilimitados desde Básico</strong>; el plan Gratis incluye 5 reclamos en total.
          </p>
          <div className="mx-auto mt-6 flex max-w-xl flex-col items-center gap-2 rounded-2xl border border-[#c02b0a]/25 bg-[#c02b0a]/5 px-6 py-4">
            <p className="font-mono text-sm font-bold text-[#c02b0a]">
              LANZAMIENTO: Básico a {soles(LAUNCH_OFFER_ANNUAL_BASICO)} el primer año (en vez de {soles(REGULAR_ANNUAL_BASICO)})
            </p>
            <p className="text-sm text-[#5c5246]">
              Solo para los primeros {LAUNCH_OFFER_SEATS} negocios · {MULTI_YEAR_DISCOUNT_NOTE}
            </p>
          </div>
        </Reveal>

        <Reveal delay={80}>
          <div className="mt-8 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setPeriod('monthly')}
              aria-pressed={period === 'monthly'}
              className={`rounded-full px-5 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                period === 'monthly'
                  ? 'bg-[#1b1611] text-[#f7f2e8]'
                  : 'border border-[#e3d9c6] bg-white text-[#5c5246] hover:border-[#1b1611]'
              }`}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setPeriod('annual')}
              aria-pressed={period === 'annual'}
              className={`rounded-full px-5 py-2 font-mono text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                period === 'annual'
                  ? 'bg-[#1b1611] text-[#f7f2e8]'
                  : 'border border-[#e3d9c6] bg-white text-[#5c5246] hover:border-[#1b1611]'
              }`}
            >
              Anual · {maxAnnualSavingPct}% menos
            </button>
          </div>
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan, i) => {
            const popular = plan.id === 'profesional';
            const isFree = plan.id === 'gratis';
            return (
              <Reveal key={plan.id} delay={i * 110} className="h-full">
                <article
                  className={`relative flex h-full flex-col rounded-2xl border p-6 ${
                    popular
                      ? 'border-[#1b1611] bg-[#1b1611] text-[#f7f2e8] shadow-[0_30px_60px_-24px_rgba(27,22,17,0.55)]'
                      : 'border-[#e3d9c6] bg-white text-[#1b1611]'
                  }`}
                >
                  {popular && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#c02b0a] px-4 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-white">
                      Más elegido
                    </span>
                  )}

                  <h3 className="font-display text-2xl font-semibold">{plan.name}</h3>
                  <p className={`mt-1 text-sm ${popular ? 'text-[#f7f2e8]/65' : 'text-[#5c5246]'}`}>
                    {plan.tagline}
                  </p>

                  <p className="mt-6">
                    <span className="font-mono text-4xl font-bold tabular-nums">
                      {soles(period === 'annual' ? plan.priceAnnual : plan.priceMonthly)}
                    </span>
                    <span className={`ml-2 text-sm ${popular ? 'text-[#f7f2e8]/65' : 'text-[#5c5246]'}`}>
                      {isFree
                        ? 'siempre'
                        : `${period === 'annual' ? 'al año' : 'al mes'} · IGV incluido`}
                    </span>
                  </p>
                  <p className={`mt-1 font-mono text-xs ${popular ? 'text-amber-300' : 'text-[#c02b0a]'}`}>
                    {isFree
                      ? 'Sin tarjeta · sin fecha de vencimiento'
                      : period === 'annual'
                        ? `Ahorras ${soles(plan.priceMonthly * 12 - plan.priceAnnual)} al año frente al pago mensual`
                        : 'Cancela cuando quieras, sin contrato'}
                  </p>

                  <ul className="mt-7 flex-1 space-y-3 text-[15px]">
                    {plan.highlights.map((highlight) => (
                      <li key={highlight} className="flex gap-3">
                        <CircleCheck
                          className={`mt-0.5 h-5 w-5 shrink-0 ${popular ? 'text-amber-300' : 'text-[#1e6b4a]'}`}
                          aria-hidden="true"
                        />
                        <span className={popular ? 'text-[#f7f2e8]/85' : 'text-[#5c5246]'}>{highlight}</span>
                      </li>
                    ))}
                  </ul>

                  <Link href={REGISTER_URL} className="mt-8 block">
                    <Button
                      className={`h-12 w-full rounded-full text-base font-semibold ${
                        popular
                          ? 'bg-[#c02b0a] text-white hover:bg-[#9c2107]'
                          : 'bg-[#1b1611] text-[#f7f2e8] hover:bg-black'
                      }`}
                    >
                      {isFree ? 'Empezar gratis' : `Probar ${trialDays} días gratis`}
                    </Button>
                  </Link>
                </article>
              </Reveal>
            );
          })}
        </div>

        <Reveal delay={200}>
          <p className="mt-10 text-center text-sm text-[#5c5246]">
            Precios finales en soles (S/), IGV ({formatIgvRate()}) incluido. Puede pagar mes a mes o
            al año, y cancelar cuando quiera. El pago anual se muestra por defecto porque sale{' '}
            {maxAnnualSavingPct}% más barato que pagar mes a mes. Emitimos{' '}
            <Link href="/comprobantes" className="underline underline-offset-2">
              boleta y factura electrónica
            </Link>{' '}
            por cada pago.
          </p>
        </Reveal>

        <Reveal delay={220}>
          <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-2xl border border-[#e3d9c6] bg-white">
            <p className="border-b border-[#e3d9c6] bg-[#1b1611] px-6 py-4 text-center font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#f7f2e8]">
              Por qué somos el más económico del Perú
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#e3d9c6] font-mono text-[11px] uppercase tracking-widest text-[#5c5246]">
                    <th className="px-6 py-3">Proveedor (precio anual aprox.)</th>
                    <th className="px-6 py-3">Entrada</th>
                    <th className="px-6 py-3">Reclamos</th>
                    <th className="px-6 py-3">Nosotros</th>
                  </tr>
                </thead>
                <tbody className="text-[#1b1611]">
                  <tr className="border-b border-[#e3d9c6]">
                    <td className="px-6 py-3">Reclamo Virtual</td>
                    <td className="px-6 py-3 font-mono">S/ 189</td>
                    <td className="px-6 py-3">limitados / por caso</td>
                    <td className="px-6 py-3 font-semibold text-[#1e6b4a]">Nosotros: S/ 89, ilimitados</td>
                  </tr>
                  <tr className="border-b border-[#e3d9c6]">
                    <td className="px-6 py-3">Librovirtual (competidor)</td>
                    <td className="px-6 py-3 font-mono">S/ 100</td>
                    <td className="px-6 py-3">limitados</td>
                    <td className="px-6 py-3 font-semibold text-[#1e6b4a]">Nosotros: S/ 89, ilimitados</td>
                  </tr>
                  <tr className="border-b border-[#e3d9c6]">
                    <td className="px-6 py-3">YoReclamo</td>
                    <td className="px-6 py-3 font-mono">S/ 129</td>
                    <td className="px-6 py-3">limitados</td>
                    <td className="px-6 py-3 font-semibold text-[#1e6b4a]">Nosotros: S/ 89, ilimitados</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-3">Estudio Manrique / tradicionales</td>
                    <td className="px-6 py-3 font-mono">S/ 199+</td>
                    <td className="px-6 py-3">según plan</td>
                    <td className="px-6 py-3 font-semibold text-[#1e6b4a]">Pro S/ 189 con IA y 5 locales</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="px-6 py-4 text-center text-xs text-[#5c5246]">
              Precios de otros proveedores: referenciales de mercado 2025-2026, no verificados
              por nosotros. Lo que sí garantizamos: reclamos ilimitados desde {basicPlan.name} (
              {soles(basicPlan.priceAnnual)} al año), mientras {freePlan.name} incluye{' '}
              {freePlan.limits.complaintsTotal} reclamos en total; QR + cartel oficial + constancia
              PDF en todos los planes; y locales sin cobro por sucursal:
              {localesCopy(basicPlan)}, {localesCopy(proPlan)} e {localesCopy(businessPlan)}.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Faq() {
  const trialDays = useTrialDays();
  const items = faqItems(trialDays);

  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-20 sm:px-8 md:py-28">
      <Reveal className="text-center">
        <Eyebrow>Preguntas frecuentes</Eyebrow>
        <h2 className="mt-4 text-balance font-display text-4xl font-medium tracking-tight text-[#1b1611] md:text-5xl">
          Todo lo que pregunta un contador (y un dueño)
        </h2>
      </Reveal>

      <Reveal delay={140}>
        <Accordion type="single" collapsible className="mt-12">
          {items.map((item, i) => (
            <AccordionItem
              key={item.q}
              value={`faq-${i}`}
              className="border-b border-[#e3d9c6]"
            >
              <AccordionTrigger className="py-5 text-left font-display text-lg font-semibold text-[#1b1611] hover:text-[#c02b0a] hover:no-underline [&[data-state=open]]:text-[#c02b0a]">
                {item.q}
              </AccordionTrigger>
              <AccordionContent className="pb-6 text-[15px] leading-relaxed text-[#5c5246]">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Reveal>
    </section>
  );
}

function FinalCta() {
  const trialDays = useTrialDays();
  return (
    <section className="landing-paper px-5 pb-24 sm:px-8">
      <Reveal>
        <div className="relative mx-auto max-w-4xl rounded-[4px] border-2 border-dashed border-[#c02b0a]/60 bg-[#fdfaf3] px-6 py-14 text-center md:px-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#c02b0a]">
            Aviso visible · Anexo II
          </p>
          <h2 className="mx-auto mt-4 max-w-xl text-balance font-display text-4xl font-medium tracking-tight text-[#1b1611] md:text-5xl">
            Abra su Libro de Reclamaciones hoy
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-pretty text-lg text-[#5c5246]">
            En minutos tendrá su enlace público y su QR listos. La próxima fiscalización no va a
            avisar — su libro, sí puede estar listo.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={REGISTER_URL}>
              <Button className="h-12 rounded-full bg-[#c02b0a] px-8 text-base font-semibold text-white shadow-[0_14px_30px_-12px_rgba(192,43,10,0.7)] hover:bg-[#9c2107]">
                Empezar gratis · {trialDays} días
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </Link>
            <Link href={LOGIN_URL}>
              <Button
                variant="outline"
                className="h-12 rounded-full border-[#1b1611]/25 bg-transparent px-8 text-base font-semibold text-[#1b1611] hover:bg-[#1b1611] hover:text-[#f7f2e8]"
              >
                Ya tengo cuenta
              </Button>
            </Link>
          </div>
          <StampMark className="absolute -right-8 -top-10 hidden rotate-12 scale-75 md:flex" />
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  // The only visible way into /admin: deliberately not in the dashboard sidebar,
  // and only for the LibroDigital team (customers get a 403 from the API anyway).
  const { user } = useAuth();

  return (
    <footer className="bg-[#1b1611] py-16 text-[#f7f2e8]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <BrandMark dark />
            <p className="mt-5 max-w-xs text-pretty text-sm leading-relaxed text-[#f7f2e8]/60">
              El Libro de Reclamaciones Virtual con inteligencia artificial para empresas
              peruanas. Conforme al marco normativo vigente.
            </p>
            <p className="mt-5 flex items-center gap-2 font-mono text-xs text-[#f7f2e8]/50">
              <Landmark className="h-4 w-4 text-[#c02b0a]" aria-hidden="true" />
              Hecho en Perú
            </p>
          </div>

          <nav aria-label="Producto">
            <h3 className="font-mono text-xs uppercase tracking-[0.22em] text-[#f7f2e8]/50">Producto</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-[#f7f2e8]/75">
              <li><a href="#como-funciona" className="transition-colors hover:text-amber-300">Cómo funciona</a></li>
              <li><a href="#precios" className="transition-colors hover:text-amber-300">Precios</a></li>
              <li><a href="#faq" className="transition-colors hover:text-amber-300">Preguntas frecuentes</a></li>
              <li><Link href="/articulos" className="transition-colors hover:text-amber-300">Artículos y guías</Link></li>
              <li><Link href="/contacto" className="transition-colors hover:text-amber-300">Nosotros y contacto</Link></li>
              <li><Link href="/estado" className="transition-colors hover:text-amber-300">Estado del servicio</Link></li>
              {user?.isPlatformAdmin && (
                <li>
                  <Link href={ADMIN_PATH} className="transition-colors hover:text-amber-300">
                    Admin · equipo LibroDigital
                  </Link>
                </li>
              )}
            </ul>
          </nav>

          <nav aria-label="Normativa">
            <h3 className="font-mono text-xs uppercase tracking-[0.22em] text-[#f7f2e8]/50">Normativa</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-[#f7f2e8]/75">
              {FOOTER_NORMS.map((norm) => {
                const [number, ...rest] = norm.label.split(' · ');
                return (
                  <li key={norm.id}>
                    <a
                      href={norm.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`footer-norm-${norm.id}`}
                      className="group inline-flex items-start gap-1.5 transition-colors hover:text-amber-300"
                    >
                      <span>
                        <span className="block">{number}</span>
                        <span className="block text-xs text-[#f7f2e8]/50 group-hover:text-amber-300/70">
                          {rest.join(' · ')}
                        </span>
                      </span>
                      <ExternalLink className="mt-1 h-3 w-3 shrink-0" aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
              <li>
                <Link
                  href="/normativa"
                  data-testid="footer-link-normativa"
                  className="font-medium text-[#f7f2e8] underline underline-offset-2 transition-colors hover:text-amber-300"
                >
                  Marco normativo completo (8 normas)
                </Link>
              </li>
            </ul>
          </nav>

          {/* Legal: los documentos del prestador. "Estado del servicio" ya está
              en Producto, así que no se repite aquí. El enlace al Libro de
              Reclamaciones del propio operador es un marcador de posición
              (ver LIBRO_DE_RECLAMACIONES_URL en @/lib/platform-legal). */}
          <nav aria-label="Legal">
            <h3 className="font-mono text-xs uppercase tracking-[0.22em] text-[#f7f2e8]/50">Legal</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-[#f7f2e8]/75">
              {LEGAL_DOCUMENTS.filter(
                (document) => document.href !== '/estado' && document.href !== '/normativa',
              ).map((document) => (
                <li key={document.href}>
                  <Link
                    href={document.href}
                    data-testid={`footer-${document.testId}`}
                    className="transition-colors hover:text-amber-300"
                  >
                    {document.label}
                  </Link>
                </li>
              ))}
              <li>
                <a
                  href={LIBRO_DE_RECLAMACIONES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="footer-link-libro-reclamaciones"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-amber-300"
                >
                  <BookOpenCheck className="h-3.5 w-3.5 text-[#c02b0a]" aria-hidden="true" />
                  Libro de Reclamaciones
                  {LIBRO_DE_RECLAMACIONES_PENDING && (
                    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#f7f2e8]/40">
                      (pronto)
                    </span>
                  )}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        {/* Datos del prestador: el visitante debe poder saber quién está detrás
            del servicio y cómo contactarlo sin abrir un documento legal. */}
        <div className="mt-12 border-t border-[#f7f2e8]/10 pt-7 text-xs text-[#f7f2e8]/45">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <p translate="no" className="font-mono tracking-[0.08em]">
                © 2026 LibroDigital.pe · {OPERATOR.businessName} · RUC {OPERATOR.ruc}
              </p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <a
                  href={`tel:${OPERATOR.phoneHref}`}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-amber-300"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  {OPERATOR.phone}
                </a>
                <a
                  href={`mailto:${OPERATOR.email}`}
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-amber-300"
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                  {OPERATOR.email}
                </a>
                {OPERATOR.address && <span>{OPERATOR.address}</span>}
              </div>
            </div>
            <p className="max-w-xl md:text-right">
              LibroDigital.pe es un servicio privado independiente y no constituye ni reemplaza a
              ningún organismo del Estado. Los textos normativos se citan con fines informativos.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FeaturedEditorialSection() {
  return (
    <section className="border-t border-[#e3d9c6] bg-[#fbf7ed] py-20 px-5 sm:px-8" aria-label="Artículo destacado">
      <div className="mx-auto max-w-6xl">
        <Reveal className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <Eyebrow>Crónicas & Cumplimiento</Eyebrow>
            <h2 className="mt-3 text-balance font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-[#1b1611]">
              Lo que de verdad pasa con el Libro de Reclamaciones
            </h2>
          </div>
          <Link
            href="/articulos"
            className="inline-flex items-center gap-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[#c02b0a] hover:underline"
          >
            Ver todas las guías y artículos
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Reveal>

        <Reveal delay={120} className="mt-10">
          <div className="rounded-3xl border-2 border-[#e3d9c6] bg-white p-6 sm:p-10 shadow-lg">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              <div className="lg:col-span-7 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#c02b0a] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                    Crónica & Realidad 2026
                  </span>
                  <span className="rounded-full bg-[#e8deca] px-2.5 py-0.5 font-mono text-[10px] font-medium text-[#5c5246]">
                    Fiscalización & MYPEs
                  </span>
                  <span className="font-mono text-xs text-[#8a7a67] ml-2">4 min de lectura</span>
                </div>

                <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-[#1b1611] leading-tight">
                  <Link href="/articulos/libro-fisico-vs-virtual-2026" className="hover:text-[#c02b0a] transition-colors">
                    El libro de reclamaciones físico en 2026: el equivalente a seguir usando un fax
                  </Link>
                </h3>

                <p className="text-sm sm:text-base text-[#5c5246] leading-relaxed">
                  Llega el inspector a tu bodega o consultorio y empieza la expedición debajo del mostrador, entre cargadores viejos y manchas de café. Por qué un cuaderno de papel te puede costar hasta S/ 27,500 en multas y cómo resolverlo legalmente.
                </p>

                <div className="pt-2 flex flex-wrap items-center gap-4">
                  <Link href="/articulos/libro-fisico-vs-virtual-2026">
                    <Button className="bg-[#c02b0a] hover:bg-[#9c2107] text-white font-medium text-xs sm:text-sm">
                      Leer artículo completo
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href="/acceso?modo=registro">
                    <Button variant="outline" className="border-[#1b1611]/20 text-xs">
                      Probar LibroDigital.pe gratis
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Graphic snippet */}
              <div className="lg:col-span-5 rounded-2xl border border-[#d6c7b0] bg-[#fbf7ed] p-5">
                <div className="flex items-center justify-between border-b border-[#e0d3c0] pb-2 text-[11px] font-mono uppercase text-[#8a7a67]">
                  <span>Cuadro comparativo</span>
                  <span className="text-[#c02b0a] font-bold">Multa 0.5 a 5 UIT</span>
                </div>
                <div className="mt-4 space-y-3 font-mono text-xs">
                  <div className="flex justify-between items-center rounded-lg bg-red-100/70 p-2.5 text-red-900">
                    <span>Libro físico perdido</span>
                    <span className="font-bold">Multa hasta S/ 27,500</span>
                  </div>
                  <div className="flex justify-between items-center rounded-lg bg-red-50 p-2.5 text-red-800">
                    <span>Hojas rotas / arrancadas</span>
                    <span className="font-bold">Sanción INDECOPI</span>
                  </div>
                  <div className="flex justify-between items-center rounded-lg bg-emerald-100/80 p-2.5 text-[#1e6b4a] font-bold">
                    <span>LibroDigital.pe</span>
                    <span>100% Legal y Resguardado</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function Landing() {
  return (
    <div className="landing-root min-h-screen overflow-x-hidden">
      <Nav />
      <main id="main-content">
        <Hero />
        <RiskTicker />
        <StatsBand />
        <HowItWorks />
        <AiShowcase />
        <ProductShowcase />
        <SocialProof />
        <Pricing />
        <FeaturedEditorialSection />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      {/* La portada es la página pública más larga: vuelta rápida al inicio. */}
      <BackToTop />
    </div>
  );
}







