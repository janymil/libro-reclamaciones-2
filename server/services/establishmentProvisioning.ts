import type { Business } from "@shared/schema";
import { firstIdentificationCode, isOnlineChannel } from "@shared/establishments";

/** The fields the establishment provisioning rule decides. */
export interface DefaultEstablishment {
  name: string;
  address: string;
  phone: string | null;
  identificationCode: string;
}

/**
 * The first establishment a tenant gets: the place its first Libro belongs to.
 *
 * The NAME comes from what the user actually typed, in this order:
 *   1. the name given to the Libro when the company was registered (the wizard's
 *      "Nombre del libro", or the "Nueva Empresa" form). It is the label the
 *      customer sees on Libros, Sucursales and the public portal, and ignoring it
 *      was the reported bug: a tenant that named its book "Wong" kept seeing the
 *      generic "Casa Matriz" everywhere;
 *   2. the trading name (`commercialName`) or the razón social;
 *   3. the sales channel, only for a business that has no name at all.
 *
 * The CHANNEL still decides the identification code, which is what the
 * consolidated registry looks at: a `tienda_virtual` sells over the Internet, so
 * the book only has to be reachable from that medium (ONLINE-01) instead of a
 * physical sucursal (SUC-001).
 *
 * Used by the one place that creates a tenant: `storage.completeOnboarding`
 * (both the onboarding wizard and `POST /api/businesses`).
 */
export function defaultEstablishmentFor(
  business: {
    address: string;
    phone?: string | null;
    businessName: string;
    commercialName?: string | null;
  },
  businessType?: string | null,
  libroName?: string | null,
): DefaultEstablishment {
  const isOnline = isOnlineChannel(businessType);
  const tradingName = business.commercialName?.trim() || business.businessName.trim();

  return {
    name: libroName?.trim() || tradingName || (isOnline ? "Tienda Online" : "Casa Matriz"),
    address: business.address,
    phone: business.phone ?? null,
    // Identifies the establishment for the consolidated national registry
    // (shared with the onboarding preview client-side).
    identificationCode: firstIdentificationCode(businessType),
  };
}


