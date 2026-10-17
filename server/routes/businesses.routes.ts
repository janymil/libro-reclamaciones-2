import type { Express } from "express";
import { z } from "zod";

import { businessRegistrationSchema, businessUpdateSchema } from "@shared/schema";
import { libroSlugFrom } from "@shared/slug";
import { PLANS, checkQuota } from "@shared/plans";

import { storage } from "../storage";
import { requireAuth, requireNonDemo, requireAdmin } from "../middleware/requireAuth";
import { enforceQuota, newBusinessTrialDefaults } from "../services/subscriptionService";
import { getTrialDays } from "../services/platformSettingsService";
import { defaultEstablishmentFor } from "../services/establishmentProvisioning";
import { allowsUnverifiedBusinesses } from "../services/verificationService";
import { getManageableBusinessIds } from "../services/tenantAccess";
import { closeBusiness } from "../services/accountClosureService";

/**
 * A public URL nobody owns yet, derived from the name of the book.
 *
 * `url_slug` is globally unique because it is the public address of the Libro, so
 * a company whose name is taken ("wong") gets "wong-2", "wong-3", ... Registering
 * a company never fails over a URL the form did not even ask for.
 */
async function uniqueLibroSlug(libroName: string): Promise<string> {
  // Base kept under the varchar(100) limit to leave room for the suffix.
  const base = (libroSlugFrom(libroName) || "libro").slice(0, 90);

  for (let suffix = 1; suffix <= 50; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;
    const owner = await storage.getLibroConfigurationBySlug(candidate);
    if (!owner) {
      return candidate;
    }
  }

  // Fifty tenants with the same name: fall back to a timestamp rather than
  // refusing to register the company.
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Business records: read the current tenant, list, create and update.
 */
export function registerBusinessesRoutes(app: Express): void {
  // Businesses routes
  app.get('/api/businesses/current', requireAuth, async (req: any, res) => {
    try {
      if (!req.user.businessId) {
        return res.json(null);
      }

      const business = await storage.getBusiness(req.user.businessId);
      res.json(business ?? null);
    } catch (error) {
      console.error('Error fetching current business:', error);
      res.status(500).json({ message: "Failed to fetch business" });
    }
  });

  app.get('/api/businesses', requireAuth, async (req: any, res) => {
    try {
      // Only the businesses this login may manage: its active tenant plus any
      // multi-RUC access grants. Returning every tenant would leak other
      // companies' RUC/address to any authenticated user.
      const access = await storage.getUserBusinessAccess(req.user.id);
      const allowed = new Set(access.map((entry) => entry.businessId));
      if (req.user.businessId) {
        allowed.add(req.user.businessId);
      }

      const businesses = (await storage.getAllBusinesses()).filter((business) =>
        allowed.has(business.id),
      );
      res.json(businesses);
    } catch (error) {
      console.error('Error fetching businesses:', error);
      res.status(500).json({ message: "Failed to fetch businesses" });
    }
  });

  /**
   * Registers a company AND the Libro de Reclamaciones it starts with, in one
   * transaction - the same `storage.completeOnboarding` the wizard uses.
   *
   * What this endpoint used to do: insert the business, an access grant and a
   * hard-coded "Casa Matriz" establishment. Nothing else. The tenant was left
   * with no `libro_configuration` (so no public book), no `books` row (so
   * "Libros" stayed empty and a consumer complaint had no book to be filed
   * against) and, for a login that had no company yet, `users.business_id` was
   * never set: the company showed up on /empresas while "Mi Perfil -> Mi
   * empresa" kept answering "Aún no ha registrado su empresa".
   */
  app.post('/api/businesses', requireAuth, requireAdmin, requireNonDemo, async (req: any, res) => {
    try {
      // The company profile plus the Libro it starts with. Only legal identity
      // and book fields are accepted: plan, subscription state and isActive are
      // server-assigned (trial defaults below) - the client must not mint itself
      // a paid plan or skip the trial lifecycle.
      const { libro: libroInput, ...businessData } = businessRegistrationSchema.parse(req.body);

      // A company cannot publish a Libro from an unconfirmed mailbox: that inbox
      // is where every complaint notification lands
      // (services/verificationService.ts). The wizard enforces the same rule, and
      // this endpoint now creates the same thing - otherwise confirming the email
      // could simply be skipped here.
      if (!req.user.isDemo && !req.user.isEmailVerified && !allowsUnverifiedBusinesses()) {
        return res.status(403).json({
          message:
            "Confirma tu correo antes de registrar tu empresa: te enviamos un enlace de confirmación al crear tu cuenta.",
          code: "email_not_verified",
        });
      }

      // Quota: businesses manageable from this login. Users without an active
      // business yet are starting their first one, so the gratis limit
      // applies (and their own access grants count as usage).
      const quota = req.user.businessId
        ? await enforceQuota(req.user.businessId, req.user.id, 'businesses')
        : checkQuota(PLANS.gratis, 'businesses', (await storage.getUserBusinessAccess(req.user.id)).length);
      if (!quota.allowed) {
        return res.status(402).json({ message: quota.reason, code: "quota_exceeded" });
      }

      const duplicate = await storage.getBusinessByRuc(businessData.ruc);
      if (duplicate) {
        // Not a dead end any more: the caller can ask the current administrators
        // of that RUC for access (POST /api/businesses/access-requests), which is
        // what the client offers right next to this message.
        return res.status(409).json({
          message: "Ya existe una empresa registrada con ese RUC. Puedes solicitar acceso a esa empresa.",
          code: "ruc_already_registered",
          businessName: duplicate.businessName,
        });
      }

      // Public URL of the new book: the one the form sent, or one derived from
      // the name the user typed (de-duplicated). A URL the user never chose must
      // not fail the registration.
      const requestedSlug = libroInput.urlSlug?.trim();
      if (requestedSlug) {
        const slugOwner = await storage.getLibroConfigurationBySlug(requestedSlug);
        if (slugOwner) {
          return res.status(409).json({
            message: `La URL pública "${requestedSlug}" ya está en uso. Elige otra.`,
            code: "slug_taken",
          });
        }
      }
      const urlSlug = requestedSlug || (await uniqueLibroSlug(libroInput.libroName));

      const result = await storage.completeOnboarding({
        userId: req.user.id,
        // Not a resume: a RUC that already exists was rejected above.
        existingBusinessId: null,
        // The first company a login registers is also the one it lands on (Mi
        // Perfil, the switcher and the public book hang off users.business_id).
        // An additional RUC only joins the switcher.
        makeActive: !req.user.businessId,
        business: {
          ...businessData,
          // The trial length comes from the console (Planes) when an operator set one.
          ...newBusinessTrialDefaults(new Date(), await getTrialDays()),
        },
        libro: {
          libroName: libroInput.libroName,
          businessType: libroInput.businessType,
          urlSlug,
          // Complaints are notified to the caller's own address unless the form
          // asked for another inbox.
          notificationEmail: libroInput.notificationEmail || req.user.email,
          whatsappNumber: libroInput.whatsappNumber || null,
          websiteUrl: libroInput.websiteUrl || null,
        },
        // The "lugar" the book belongs to, named after the name the user gave the
        // book ("Wong") instead of a generic "Casa Matriz".
        establishment: defaultEstablishmentFor(
          businessData,
          libroInput.businessType,
          libroInput.libroName,
        ),
      });

      res.status(201).json({
        message: `${result.business.businessName} quedó registrada con su Libro de Reclamaciones.`,
        business: result.business,
        libroConfig: result.config,
        establishment: result.establishment,
        book: result.book,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }

      // Unique-violation race: another registration took the RUC or the public
      // URL between the checks above and the insert. The transaction rolled back,
      // so nothing is half written and the user can simply pick another URL.
      const pgCode = (error as any)?.code ?? (error as any)?.cause?.code;
      if (pgCode === '23505') {
        return res.status(409).json({
          message: 'Esa URL pública acaba de ser tomada por otra empresa. Elige otra.',
          code: 'slug_taken',
        });
      }

      console.error('Error creating business:', error);
      res.status(500).json({ message: "Failed to create business" });
    }
  });

  // Update a business ("Gestionar" on Empresas)
  app.patch('/api/businesses/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      // Cross-tenant guard: the caller may only touch a tenant it manages
      // (its active business or an explicit multi-RUC grant). Previously any
      // authenticated user could rewrite ANY company's data - or flip its
      // subscriptionPlan to corporativo for free.
      const allowed = await getManageableBusinessIds(req.user);
      if (!allowed.has(req.params.id)) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const business = await storage.getBusiness(req.params.id);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      // Whitelisted profile fields only: RUC, plan and subscription lifecycle
      // can never be changed through this endpoint.
      const data = businessUpdateSchema.parse(req.body);
      const updated = await storage.updateBusiness(req.params.id, data);
      res.json(updated);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Datos inválidos", errors: error.errors });
      }
      console.error('Error updating business:', error);
      res.status(500).json({ message: "Failed to update business" });
    }
  });

  /**
   * Cierra (elimina) una empresa: la acción de "abandonar la app".
   *
   * Admin-only and tenant-scoped. What happens to the data is decided by
   * `closeBusiness` (services/accountClosureService.ts): a tenant with no
   * complaints is erased outright; a tenant with records is closed - book
   * offline, subscription cancelled - and its complaints are kept for the legal
   * 2-year retention.
   */
  app.post('/api/businesses/:id/close', requireAuth, requireAdmin, requireNonDemo, async (req: any, res) => {
    try {
      const allowed = await getManageableBusinessIds(req.user);
      if (!allowed.has(req.params.id)) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const business = await storage.getBusiness(req.params.id);
      if (!business) {
        return res.status(404).json({ message: "Empresa no encontrada" });
      }

      const result = await closeBusiness(business);

      // The caller must not keep pointing at a tenant that no longer exists
      // (purged) - send them to another one they manage, or to onboarding.
      if (req.user.businessId === business.id) {
        const remaining = (await storage.getUserBusinessAccess(req.user.id))
          .map((entry) => entry.businessId)
          .filter((businessId) => businessId !== business.id);

        await storage.updateUser(req.user.id, { businessId: remaining[0] ?? null });
      }

      await storage.createAuthAuditLog({
        action: 'business_closed',
        email: req.user.email,
        ipAddress: req.ip || req.socket.remoteAddress || '',
        userAgent: req.get('User-Agent') || '',
        success: true,
        userId: req.user.id,
        metadata: {
          businessId: business.id,
          ruc: business.ruc,
          purged: result.purged,
          complaintCount: result.complaintCount,
        },
      });

      res.json({
        message: result.message,
        purged: result.purged,
        complaintCount: result.complaintCount,
      });
    } catch (error) {
      console.error('Error closing business:', error);
      res.status(500).json({ message: "No se pudo cerrar la empresa" });
    }
  });
}
