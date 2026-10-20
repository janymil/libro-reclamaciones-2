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
  FileText,
  Flame,
  HelpCircle,
  Lightbulb,
  Scale,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { EDITORIAL_ARTICLES } from '@/data/editorial-articles';
import { OPERATOR } from '@/lib/platform-legal';

export default function ArticlesHubPage() {
  const [selectedCategory, setSelectedCategory] = useState<string>('todos');

  const categories = [
    { id: 'todos', label: 'Todos los temas' },
    { id: 'fiscalizacion', label: 'Fiscalización & Multas' },
    { id: 'mypes', label: 'MYPEs & Negocios' },
    { id: 'normativa', label: 'Normativa 2026' },
  ];

  return (
    <div className="landing-root landing-paper min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-[#e3d9c6] bg-[#f7f2e8]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="Ir a la portada">
            <BrandMark />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-[#5c5246] hover:text-[#c02b0a]"
            >
              <ArrowLeft className="h-4 w-4" /> Inicio
            </Link>
            <Link href="/acceso?modo=registro">
              <Button size="sm" className="bg-[#c02b0a] hover:bg-[#9c2107] text-white font-medium text-xs">
                Empezar gratis
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="border-b border-[#e3d9c6] bg-gradient-to-b from-[#f2e7d5]/40 to-[#fdfaf3] py-14 sm:py-20">
        <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c02b0a]/10 px-3 py-1 font-mono text-xs font-bold uppercase tracking-wider text-[#c02b0a]">
            <BookOpenCheck className="h-3.5 w-3.5" /> Artículos & Crónicas de Cumplimiento
          </span>
          <h1 className="mt-4 font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-[#1b1611]">
            Guías francas para negocios que no tienen tiempo de estudiar leyes
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-[#5c5246] leading-relaxed">
            Sin tecnicismos aburridos ni relleno. Casos reales, multas explicadas en soles y soluciones prácticas para proteger tu negocio peruano.
          </p>
        </div>
      </section>

      {/* Category filters & Articles Grid */}
      <main id="main-content" className="mx-auto max-w-5xl px-5 py-12 sm:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* Main Featured Article (User's Article) */}
          <div className="md:col-span-8 space-y-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-[#8a7a67]">
              Artículo Destacado de la Semana
            </h2>

            {EDITORIAL_ARTICLES.map((article) => (
              <article
                key={article.slug}
                className="group relative rounded-3xl border-2 border-[#e3d9c6] bg-[#fdfaf3] p-6 sm:p-8 transition-all hover:border-[#c02b0a] hover:shadow-xl"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[#c02b0a] px-3 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                    {article.badge}
                  </span>
                  <span className="rounded-full bg-[#e8deca] px-2.5 py-0.5 font-mono text-[10px] font-medium text-[#5c5246]">
                    {article.category}
                  </span>
                  <span className="ml-auto flex items-center gap-1 font-mono text-xs text-[#8a7a67]">
                    <Clock className="h-3 w-3" /> {article.readTime}
                  </span>
                </div>

                <h3 className="mt-4 font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#1b1611] group-hover:text-[#c02b0a] transition-colors leading-tight">
                  <Link href={`/articulos/${article.slug}`}>{article.title}</Link>
                </h3>

                <p className="mt-3 text-sm sm:text-base text-[#5c5246] leading-relaxed">
                  {article.summary}
                </p>

                {/* Micro preview visual */}
                <div className="my-5 rounded-xl border border-[#d6c7b0] bg-[#f6eee1]/60 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#c02b0a]/15 text-[#c02b0a]">
                      {article.slug === 'libro-fisico-vs-virtual-2026' ? (
                        <Coffee className="h-5 w-5" />
                      ) : article.slug === 'cuidado-con-estos-5-clientes-libro-reclamaciones' ? (
                        <Scale className="h-5 w-5" />
                      ) : (
                        <Flame className="h-5 w-5" />
                      )}
                    </div>
                    <div className="text-xs text-[#5c4a36]">
                      <p className="font-semibold text-[#1b1611]">
                        {article.slug === 'libro-fisico-vs-virtual-2026'
                          ? '¿Por qué un cuaderno manchado de café con hojas arrancadas te expone a 5 UIT?'
                          : article.slug === 'cuidado-con-estos-5-clientes-libro-reclamaciones'
                          ? 'De 10 céntimos al tiktoker en vivo: cómo resolver cualquier reclamo con 1 solo QR.'
                          : 'S/ 15,000 por no tener link en la web: casos reales de multas a MYPEs y personas con RUC.'}
                      </p>
                      <p className="text-[11px] text-[#7a6855] mt-0.5">
                        {article.slug === 'libro-fisico-vs-virtual-2026'
                          ? 'Conoce el checklist indispensable que un libro de reclamaciones virtual debe cumplir en 2026.'
                          : article.slug === 'cuidado-con-estos-5-clientes-libro-reclamaciones'
                          ? 'Incluye demostración en video vertical: la respuesta serena que desactiva discusiones.'
                          : 'Resoluciones verificadas de Indecopi: por qué un Google Form o PDF casero no te salva.'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[#e3d9c6]/80 text-xs text-[#5c5246]">
                  <span className="font-medium">{article.author.name}</span>
                  <Link
                    href={`/articulos/${article.slug}`}
                    className="inline-flex items-center gap-1 font-bold text-[#c02b0a] group-hover:translate-x-1 transition-transform"
                  >
                    Leer artículo completo <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </article>
            ))}
          </div>

          {/* Sidebar CTA & Key Facts */}
          <div className="md:col-span-4 space-y-6">
            {/* CTA Box */}
            <div className="rounded-2xl border-2 border-[#c02b0a]/40 bg-gradient-to-br from-white to-[#faede8] p-6 shadow-md">
              <span className="inline-block rounded-full bg-[#c02b0a] px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-white">
                Solución Oficial MYPE
              </span>
              <h3 className="mt-3 font-display text-lg font-bold text-[#1b1611]">
                Pásate a LibroDigital.pe hoy mismo
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-[#5c5246]">
                Evita multas de hasta S/ 27,500. Te entregamos el cartel QR imprimible con aviso oficial y el portal digital para tus clientes.
              </p>
              <div className="mt-4 pt-3 border-t border-[#e3d9c6] space-y-2 text-xs text-[#1b1611]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#1e6b4a]" />
                  <span>Código correlativo único automático</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#1e6b4a]" />
                  <span>Constancia al correo del cliente</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[#1e6b4a]" />
                  <span>Asistente con IA en plazo legal</span>
                </div>
              </div>
              <Link href="/acceso?modo=registro" className="mt-5 block">
                <Button className="w-full bg-[#c02b0a] hover:bg-[#9c2107] text-white text-xs font-semibold">
                  Probar 15 días gratis
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>

            {/* Quick Fact Box */}
            <div className="rounded-2xl border border-[#d6c7b0] bg-white p-5 text-xs text-[#5c5246] space-y-3">
              <h4 className="font-mono uppercase font-bold tracking-wider text-[#1b1611]">
                Escala de Multas 2026
              </h4>
              <p>
                La UIT de 2026 es de <strong>S/ 5,500</strong>. Las sanciones de INDECOPI por infracciones al libro van de:
              </p>
              <div className="rounded-lg bg-[#fbf7ed] p-3 font-mono">
                <div className="flex justify-between border-b border-[#e3d9c6] pb-1">
                  <span>Mínima:</span>
                  <span className="font-bold text-red-700">0.5 UIT (S/ 2,750)</span>
                </div>
                <div className="flex justify-between pt-1">
                  <span>Máxima:</span>
                  <span className="font-bold text-red-800">5 UIT (S/ 27,500)</span>
                </div>
              </div>
              <Link
                href="/normativa"
                className="block text-center text-[11px] font-semibold text-[#c02b0a] hover:underline"
              >
                Ver marco normativo completo (8 normas) →
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-[#e3d9c6] bg-[#fdfaf3] py-8 text-center text-xs text-[#5c5246]">
        <div className="mx-auto max-w-4xl px-5 space-y-2">
          <p translate="no">© 2026 LibroDigital.pe · {OPERATOR.businessName} · RUC {OPERATOR.ruc}</p>
        </div>
      </footer>

      <BackToTop />
    </div>
  );
}
