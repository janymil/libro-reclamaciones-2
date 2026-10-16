import { BookOpenCheck } from 'lucide-react';

/**
 * Shared brand atoms for the public (pre-login) surfaces: the marketing landing
 * (`/`) and the access page (`/acceso`). Keeping the logo mark, the rubber
 * stamp and the paper hoja in one module is what makes the two read as the same
 * product instead of two different companies.
 */

export function BrandMark({ dark = false }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5" translate="no">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#c02b0a] text-white shadow-[0_6px_16px_-6px_rgba(192,43,10,0.7)]">
        <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
      </span>
      <span
        className={`font-display text-lg font-semibold tracking-tight ${
          dark ? 'text-[#f7f2e8]' : 'text-[#1b1611]'
        }`}
      >
        LibroDigital<span className="text-[#c02b0a]">.pe</span>
      </span>
    </span>
  );
}

/* Rotating rubber stamp ("CONSTANCIA DE RECEPCIÓN") — the brand's signature */
export function StampMark({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`stamp-ring relative flex h-36 w-36 items-center justify-center bg-transparent ${className}`}
    >
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full animate-spin-slow">
        <defs>
          <path
            id="stamp-circle"
            d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0"
            fill="none"
          />
        </defs>
        <text
          fill="#c02b0a"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '13.5px',
            fontWeight: 700,
            letterSpacing: '3.5px',
          }}
        >
          <textPath href="#stamp-circle">CONSTANCIA DE RECEPCIÓN · LIBRODIGITAL.PE ·</textPath>
        </text>
      </svg>
      <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed border-[#c02b0a]">
        <span className="font-mono text-[10px] font-bold leading-tight text-[#c02b0a]">
          15 DÍAS
          <br />
          HÁBILES
        </span>
      </div>
    </div>
  );
}

/* Decorative QR glyph built from a deterministic matrix (not scannable). */
const QR_SEED = [
  1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 1,
  1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1, 0,
  0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0,
  1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 0, 1, 0, 0, 1,
  0, 1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 1,
  0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0, 0, 1, 1,
  0, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 1, 1, 0, 1, 1, 0,
];

export function QrGlyph({ className = '' }: { className?: string }) {
  const size = 15;
  return (
    <div
      aria-hidden="true"
      className={`grid shrink-0 grid-cols-[repeat(15,minmax(0,1fr))] gap-[1px] rounded-sm bg-white p-1.5 ${className}`}
    >
      {Array.from({ length: size * size }).map((_, i) => (
        <div
          key={i}
          className={`aspect-square ${QR_SEED[i % QR_SEED.length] ? 'bg-[#1b1611]' : 'bg-transparent'}`}
        />
      ))}
    </div>
  );
}

/* The paper "Hoja de Reclamación" — a faithful mini of the official Anexo form */
export function HojaDocument({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`relative rounded-[3px] border border-[#e3d9c6] bg-[#fdfaf3] p-6 shadow-[0_30px_60px_-25px_rgba(27,22,17,0.35)] ${className}`}
    >
      <div className="flex items-start justify-between gap-4 border-b-2 border-[#1b1611] pb-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#5c5246]">
            Libro de Reclamaciones
          </p>
          <p className="font-display text-lg font-semibold leading-tight text-[#1b1611]">
            Hoja de Reclamación
          </p>
        </div>
        <p className="font-mono text-sm font-bold text-[#c02b0a]">R-2026-0001</p>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#5c5246]">
            Consumidor
          </p>
          <p className="font-display text-sm italic text-[#1b1611]">María Quispe Alarcón</p>
        </div>

        <div className="flex items-center gap-5">
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#5c5246]">Tipo</p>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#1b1611]">
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center border border-[#1b1611] text-[9px] font-bold">
              ✕
            </span>
            Reclamo
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[11px] text-[#5c5246]">
            <span className="inline-block h-3.5 w-3.5 border border-[#5c5246]" />
            Queja
          </span>
        </div>

        <div>
          <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#5c5246]">
            Detalle de la disconformidad
          </p>
          <div className="hoja-rule mt-1 h-[84px]">
            <p className="pt-0.5 font-display text-[13px] italic leading-[28px] text-[#1b1611]/80">
              El producto llegó con la caja abierta y sin el sello de garantía…
            </p>
          </div>
        </div>

        <div className="flex items-end justify-between pt-1">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#5c5246]">Firma</p>
            <p className="font-display text-base italic text-[#1b1611]/70">M. Quispe</p>
          </div>
          <QrGlyph className="w-16" />
        </div>
      </div>
    </div>
  );
}

