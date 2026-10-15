import type { Business, Establishment } from "@shared/schema";

import { storage } from "../storage";

/** The fields the establishment provisioning rule decides. */
export interface DefaultEstablishment {
  name: string;
  address: string;
  phone: string | null;
  identificationCode: string;
}

/**
 * The first establishment a tenant gets, derived from its sales channel.
 *
 * Extracted so the two places that create a tenant cannot drift apart: the
 * transactional onboarding (`storage.completeOnboarding`) and the multi-RUC
 * registration (`POST /api/businesses`).
 */
export function defaultEstablishmentFor(
  business: Pick<Business, "address" | "phone">,
  businessType?: string | null,
): DefaultEstablishment {
  const isOnline = businessType === "tienda_virtual";

  return {
    name: isOnline ? "Tienda Online" : "Casa Matriz",
    address: business.address,
    phone: business.phone ?? null,
    // Identifies the establishment for the consolidated national registry.
    identificationCode: isOnline ? "ONLINE-01" : "SUC-001",
  };
}

/**
 * Guarantees a business has at least one establishment so it can receive
 * complaints from day one.
 *
 * DS 011-2011-PCM requires one Libro per establishment open to the public, and
 * the public portal files every complaint against an establishment. A tenant
 * created by the onboarding flow (or by multi-RUC registration) starts with
 * none, which left the Libros page empty and, worse, made the public complaint
 * form unreachable.
 *
 * The default establishment also models the sales channel:
 *  - `tienda_virtual` (pure online store): a virtual "Tienda Online" channel,
 *    because selling over the Internet only requires the book to be reachable
 *    from that medium - there is no physical sucursal.
 *  - anything else: a physical "Casa Matriz" at the registered address.
 *
 * Idempotent: returns the first active establishment untouched if one exists.
 */
export async function provisionDefaultEstablishment(
  business: Business,
  businessType?: string | null,
): Promise<Establishment> {
  const existing = await storage.getEstablishmentsByBusiness(business.id);
  if (existing.length > 0) {
    return existing[0];
  }

  return await storage.createEstablishment({
    businessId: business.id,
    isActive: true,
    ...defaultEstablishmentFor(business, businessType),
  });
}

