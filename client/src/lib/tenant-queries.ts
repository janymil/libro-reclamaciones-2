import type { QueryClient } from '@tanstack/react-query';

/**
 * Refreshes the React Query cache after the caller's company changes (a company
 * was registered, renamed or closed).
 *
 * Everything is invalidated, on purpose. The cache is configured with
 * `staleTime: Infinity`, so a query that already ran keeps its answer for the
 * rest of the session - and the wizard itself requests `/api/businesses/current`
 * while the account still has no company, so it caches `null`. Nothing
 * invalidated it afterwards, which is how a freshly onboarded account saw its
 * company on /empresas (a query that had never run before) while "Mi Perfil ->
 * Mi empresa" kept answering "Aún no ha registrado su empresa", the header
 * switcher stayed empty and /panel kept its pre-onboarding counters, until a
 * full reload.
 *
 * A company owns the answer of nearly every screen (complaints, books,
 * establishments, quotas, notifications, subscription), so a filtered list would
 * keep having holes. Invalidating everything is also cheap: it only marks the
 * queries stale, and the mounted ones refetch once.
 */
export function invalidateTenantQueries(queryClient: QueryClient): void {
  queryClient.invalidateQueries();
}
