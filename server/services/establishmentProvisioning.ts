import type { Business, Establishment } from "@shared/schema";

import { storage } from "../storage";

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

  const isOnline = businessType === "tienda_virtual";

  return await storage.createEstablishment({
    businessId: business.id,
    name: isOnline ? "Tienda Online" : "Casa Matriz",
    address: business.address,
    phone: business.phone ?? null,
    // Identifies the establishment for the consolidated national registry.
    identificationCode: isOnline ? "ONLINE-01" : "SUC-001",
    isActive: true,
  });
}
