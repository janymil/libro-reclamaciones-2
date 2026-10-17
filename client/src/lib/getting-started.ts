/**
 * "Primeros pasos": the checklist a new tenant sees on /panel.
 *
 * Registration leaves the account complete and usable (empresa + first local +
 * its register + public link), but the doubts it does not answer only show up
 * afterwards: "do I need to add my other sucursales?", "does each one have its own
 * register?", "is the email confirmed?". Those are the questions the checklist
 * answers, using REAL data instead of a static to-do list - so it disappears by
 * itself once there is nothing left to do.
 *
 * Kept as a pure function: no hooks, no fetch, so `getting-started.test.ts` can
 * pin every branch (including the legacy tenant whose sucursales have no book).
 */

export interface GettingStartedInput {
  businessName?: string | null;
  /** Public slug of the Libro (`/api/libro-configuration`). */
  libroSlug?: string | null;
  /** The mailbox that receives every complaint notice. */
  isEmailVerified: boolean;
  /** Locales registered so far, and Libros de Reclamaciones created. */
  establishments: number;
  books: number;
  /** From the onboarding scenario; null when unknown (older accounts). */
  expectedLocales: number | null;
}

export type GettingStartedAction = 'resend-verification' | 'navigate';

export interface GettingStartedStep {
  id: string;
  title: string;
  description: string;
  done: boolean;
  /** Where the button goes, when the step navigates. */
  href?: string;
  /** An action the component implements (currently: resend the confirmation). */
  action?: GettingStartedAction;
  actionLabel?: string;
}

export interface GettingStartedPlan {
  steps: GettingStartedStep[];
  /** Steps still pending (what the "N de M" counter and the badge read). */
  pending: number;
  /** When every step is done the checklist hides itself. */
  allDone: boolean;
}

/**
 * The steps, in the order they matter: publish the book, make sure the notices
 * arrive, complete the network of locales, and give each local its book.
 */
export function buildGettingStarted(input: GettingStartedInput): GettingStartedPlan {
  const { libroSlug, isEmailVerified, establishments, books, expectedLocales } = input;

  const steps: GettingStartedStep[] = [
    {
      id: 'libro-en-linea',
      title: 'Tu Libro de Reclamaciones está en línea',
      description: libroSlug
        ? `Tus clientes ya pueden reclamar en librodigital.pe/${libroSlug}, con su código QR.`
        : 'Estamos preparando el enlace público de tu Libro.',
      done: Boolean(libroSlug),
      href: '/codigo-qr',
      action: 'navigate',
      actionLabel: 'Ver enlace y QR',
    },
    {
      id: 'correo-confirmado',
      title: 'Confirma el correo de las reclamaciones',
      description: isEmailVerified
        ? 'Los avisos de cada nueva reclamación llegan a tu correo.'
        : 'Es la dirección que recibe el aviso de cada reclamo: sin confirmarla, el aviso puede perderse.',
      done: isEmailVerified,
      action: 'resend-verification',
      actionLabel: 'Reenviar correo',
    },
  ];

  // Only a chain sees a target: a single-local business is already complete, and
  // guessing a number for an older account would nag about something it never
  // asked for.
  if (expectedLocales !== null && expectedLocales > 1) {
    const done = establishments >= expectedLocales;
    steps.push({
      id: 'sucursales',
      title: done ? 'Tus locales están registrados' : 'Agrega tus otros locales',
      description: done
        ? `${establishments} locales registrados, con los reclamos de cada uno separados.`
        : `Dijiste que tienes ${expectedLocales} locales. Registraste ${establishments}: agrégalos en Sucursales y tus clientes entran por el mismo enlace, eligiendo el local.`,
      done,
      href: '/sucursales',
      action: 'navigate',
      actionLabel: 'Agregar locales',
    });
  }

  // A tenant can end up with NO local at all (the last sucursal was closed, or a
  // test tenant was trimmed): the public link is live but the consumer form has no
  // "¿dónde ocurrió?" to choose, so the book cannot accept a single complaint.
  // Nothing else in this list would notice, because there is no register to miss.
  if (establishments === 0) {
    steps.push({
      id: 'primer-local',
      title: 'Registra tu primer local',
      description:
        'Tu enlace público ya está activo, pero tus clientes necesitan elegir un local al reclamar.',
      done: false,
      href: '/sucursales',
      action: 'navigate',
      actionLabel: 'Registrar local',
    });
  }

  // The per-local record: DS 011-2011-PCM expects every establishment open to the
  // public to be able to show its own complaints, which is what /libros exports
  // (one PDF per local). A tenant whose sucursal predates the automatic register
  // is told here instead of discovering it during an inspection. Shown only when
  // it has something to say: a single local with its record is the normal case.
  if (establishments > 1 || books < establishments) {
    const done = books >= establishments;
    steps.push({
      id: 'registro-por-local',
      title: done ? 'Cada local tiene su registro' : 'Falta el registro de una sucursal',
      description: done
        ? `${books} ${books === 1 ? 'registro' : 'registros'} para ${establishments} ${establishments === 1 ? 'local' : 'locales'}: puedes exportar los reclamos de cada local.`
        : `Tienes ${establishments} locales y ${books} ${books === 1 ? 'registro' : 'registros'}. Cada local debe poder exhibir sus propios reclamos (DS 011-2011-PCM).`,
      done,
      href: '/libros',
      action: 'navigate',
      actionLabel: 'Revisar libros',
    });
  }

  const pending = steps.filter((step) => !step.done).length;

  return { steps, pending, allDone: pending === 0 };
}

const DISMISSED_STORAGE_KEY = 'librodigital.getting-started-dismissed.v1';

/** Whether the customer closed the checklist (per browser, best effort). */
export function isGettingStartedDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissGettingStarted(): void {
  try {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, '1');
  } catch {
    // Not fatal: the checklist would simply reappear on the next visit.
  }
}
