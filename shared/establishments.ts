/**
 * Rules about establishments (sucursales) that BOTH sides need.
 *
 * The server provisions the first establishment (and the Libro that hangs from
 * it) inside the onboarding transaction; the client previews it during
 * onboarding and suggests the code when the customer adds another local. Those
 * two must never disagree about what a channel means, so the decision lives here
 * instead of being duplicated in a React component.
 *
 * Legal context (DS 011-2011-PCM): a business that sells over the Internet only
 * has to make the Libro reachable from that medium, so it gets a virtual channel
 * (`ONLINE-01`) instead of a physical sucursal (`SUC-00N`). The identification
 * code is what the consolidated national registry groups records by.
 */

/** Sales channels offered when a company is registered. */
export type SalesChannel = 'tienda_virtual' | 'local_fisico' | 'servicios' | 'mixto';

/** Whether the channel is "sells over the Internet" (pure online store). */
export function isOnlineChannel(businessType?: string | null): boolean {
  return businessType === 'tienda_virtual';
}

/** Code of the FIRST establishment of a tenant, by sales channel. */
export function firstIdentificationCode(businessType?: string | null): string {
  return isOnlineChannel(businessType) ? 'ONLINE-01' : 'SUC-001';
}

/** Sequential code of a physical sucursal (`SUC-001`, `SUC-002`, ...). */
export function sucursalCode(number: number): string {
  return `SUC-${String(number).padStart(3, '0')}`;
}

/**
 * The next free code for a new sucursal, derived from the codes already in use
 * (`SUC-001`, `SUC-002`, ... -> `SUC-003`).
 *
 * It exists so the customer never has to invent a code: the field used to be an
 * empty, required "Código de Identificación" in the sucursal form, which is the
 * kind of detail a chain discovers by making the consolidated registry wrong.
 *
 * A tenant with no sucursales yet starts at SUC-001 (a business created as an
 * online store holds ONLINE-01, which does not consume a physical number).
 */
export function nextIdentificationCode(existingCodes: string[]): string {
  let highest = 0;

  for (const code of existingCodes) {
    const match = /^SUC-(\d+)$/.exec((code ?? '').trim().toUpperCase());
    if (match) {
      highest = Math.max(highest, Number(match[1]));
    }
  }

  return sucursalCode(highest + 1);
}
