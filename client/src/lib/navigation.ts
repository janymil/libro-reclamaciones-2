/**
 * Mobile navigation map.
 *
 * The phone UI shows at most five bottom-bar targets (four destinations plus
 * "Más"), because six items in a 320px-wide row produced tap targets well below
 * the 44x44px minimum. Everything else lives behind the "Más" sheet.
 *
 * Kept as data (not JSX) so `navigation.test.ts` can assert that:
 *   - every href exists in the router (`client/src/App.tsx`),
 *   - the bottom bar stays at four primary destinations,
 *   - primary and secondary never overlap (one destination, one place).
 */
export interface MobileNavItem {
  name: string;
  href: string;
  /** Material Icons ligature name, as used by the rest of the shell. */
  icon: string;
}

/** Bottom bar destinations - the four a business uses every day. */
export const PRIMARY_MOBILE_NAV: MobileNavItem[] = [
  { name: 'Panel', href: '/panel', icon: 'dashboard' },
  { name: 'Reclamos', href: '/reclamos', icon: 'assignment' },
  { name: 'Reportes', href: '/reportes', icon: 'assessment' },
  { name: 'Asistente', href: '/asistente', icon: 'smart_toy' },
];

/** Everything else, reachable from the "Más" sheet, grouped like the sidebar. */
export const SECONDARY_MOBILE_NAV: MobileNavItem[] = [
  // Libro de Reclamaciones
  { name: 'Libros', href: '/libros', icon: 'menu_book' },
  { name: 'Sucursales', href: '/sucursales', icon: 'share' },
  { name: 'QR y enlace web', href: '/codigo-qr', icon: 'qr_code_2' },
  // Configuración (de la app y del libro: plantillas, marca e integraciones)
  { name: 'Personalización', href: '/personalizacion', icon: 'palette' },
  { name: 'Integraciones', href: '/integraciones', icon: 'extension' },
  // Cuenta (la persona, sus empresas, su equipo y su plan)
  { name: 'Mi Perfil', href: '/perfil', icon: 'account_circle' },
  { name: 'Empresas', href: '/empresas', icon: 'business' },
  { name: 'Usuarios', href: '/usuarios', icon: 'people' },
  { name: 'Plan y Cuotas', href: '/plan', icon: 'workspace_premium' },
  { name: 'Pagos', href: '/pagos', icon: 'receipt_long' },
  { name: 'Historial', href: '/historial', icon: 'history' },
  { name: 'Cumplimiento', href: '/cumplimiento', icon: 'verified_user' },
];

/**
 * Whether a location belongs to the primary bar (the "Más" tab is highlighted
 * when the current page lives in the secondary sheet).
 */
export function isPrimaryLocation(location: string): boolean {
  return PRIMARY_MOBILE_NAV.some((item) => item.href === location);
}
