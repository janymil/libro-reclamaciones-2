import {
  buildBusinessEmailIdentity,
  parseVerifiedDomains,
  type BusinessEmailIdentity,
} from "@shared/email-identity";
import type { Business, LibroConfiguration } from "@shared/schema";

import { storage } from "../storage";

/**
 * Platform SMTP policy, read from the environment.
 *
 * `SMTP_ALLOWED_SENDER_DOMAINS` lists the domains the mail host lets the
 * platform send as. Every provider requires the domain's SPF/DKIM records to
 * point at the sending account, so a tenant's address can only be used once the
 * platform has verified that domain - see shared/email-identity.ts.
 */
export function platformSenderPolicy(): {
  platformFromAddress: string | null;
  platformFromName: string;
  verifiedDomains: string[];
} {
  return {
    platformFromAddress: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || null,
    platformFromName: process.env.SMTP_FROM_NAME || 'LibroDigital.pe',
    verifiedDomains: parseVerifiedDomains(process.env.SMTP_ALLOWED_SENDER_DOMAINS ?? 'librodigital.pe'),
  };
}

/** Identity of a consumer-facing email, from rows the caller already has. */
export function emailIdentity(
  business: Business,
  config?: LibroConfiguration | null,
): BusinessEmailIdentity {
  return buildBusinessEmailIdentity({
    business,
    config: config ?? null,
    sender: platformSenderPolicy(),
    baseUrl: process.env.APP_URL ?? null,
  });
}

/** Same identity, resolving the business and its configuration from the database. */
export async function emailIdentityForBusiness(
  businessId: string,
): Promise<BusinessEmailIdentity | null> {
  const business = await storage.getBusiness(businessId);
  if (!business) {
    return null;
  }

  const config = await storage.getLibroConfiguration(businessId);
  return emailIdentity(business, config);
}
