/**
 * Where the operator console lives.
 *
 * Two deliberate decisions:
 *   * NOT `/admin` - that is the first path every scanner, bot and "exploit
 *     hunter" tries, so it stays a 404 and looks like nothing at all.
 *   * Under `/acceso/...`, the namespace that already exists for signing in, so
 *     the console is one area with the login instead of a second front door.
 *
 * The console is protected by the session + the operator flag (see
 * `requirePlatformAdmin`); the obscure path only keeps the noise and the search
 * engines away from a screen that has nothing to offer a stranger.
 *
 * Set `VITE_ADMIN_PATH` to change it: the client bakes it at build time and the
 * server reads it for the `X-Robots-Tag: noindex` header.
 */
export const ADMIN_PATH: string =
  (import.meta.env.VITE_ADMIN_PATH as string | undefined)?.trim().replace(/\/+$/, '') ||
  '/acceso/operaciones-7f31';

/** A section of the console, e.g. `adminPathFor('/pagos')`. */
export function adminPathFor(section = ''): string {
  if (!section) return ADMIN_PATH;
  return `${ADMIN_PATH}${section.startsWith('/') ? section : `/${section}`}`;
}

/**
 * The console's entrance.
 *
 * There is ONE sign-in page for everybody - `/acceso` - and the app decides where
 * each account lands: an operator goes to the console, a customer to the panel.
 * The server does its half by telling the client which kind of account it is
 * (`isPlatformAdmin` in the login response and in `/api/auth/user`).
 */
export const ADMIN_LOGIN_URL = `/acceso?next=${encodeURIComponent(ADMIN_PATH)}`;

/** Where the old, separate console door used to live; kept as a redirect. */
export const ADMIN_LOGIN_PATH = adminPathFor('/entrar');

/** The console's own navigation (hidden from the customer app on purpose). */
export const ADMIN_SECTIONS = [
  { href: adminPathFor(), label: 'Resumen', icon: 'insights' },
  { href: adminPathFor('/clientes'), label: 'Clientes', icon: 'groups' },
  { href: adminPathFor('/pagos'), label: 'Pagos', icon: 'receipt_long' },
  // The manual emission queue: each paid order becomes a factura or a boleta.
  { href: adminPathFor('/comprobantes'), label: 'Comprobantes', icon: 'description' },
  { href: adminPathFor('/suscripciones'), label: 'Suscripciones', icon: 'autorenew' },
  // The platform's own collection details (Yape number, bank accounts, CCI): the
  // customer-facing text of a transfer payment comes from here.
  { href: adminPathFor('/configuracion'), label: 'Configuración', icon: 'settings' },
  // What we charge and what we give away: the price list and the promo codes.
  { href: adminPathFor('/planes'), label: 'Planes', icon: 'sell' },
  { href: adminPathFor('/descuentos'), label: 'Descuentos', icon: 'local_offer' },
  { href: adminPathFor('/plataforma'), label: 'Plataforma', icon: 'monitor_heart' },
  { href: adminPathFor('/equipo'), label: 'Equipo', icon: 'badge' },
] as const;


