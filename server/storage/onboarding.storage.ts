import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  type Book,
  type Business,
  type Establishment,
  type InsertBusiness,
  type InsertLibroConfiguration,
  type LibroConfiguration,
  books,
  businesses,
  establishments,
  libroConfiguration,
  userBusinessAccess,
  users,
} from "@shared/schema";

/** Everything step 2 of the wizard collects, minus the ids the store assigns. */
export interface CompleteOnboardingInput {
  userId: string;
  /**
   * Tenant created by a previous, failed attempt. Resuming reuses it instead of
   * inserting a second business for the same RUC (which the UNIQUE constraint
   * would reject anyway, stranding the user for good).
   */
  existingBusinessId?: string | null;
  business: InsertBusiness;
  libro: Omit<InsertLibroConfiguration, "businessId" | "userId">;
  establishment: {
    name: string;
    address: string;
    phone?: string | null;
    identificationCode: string;
  };
  /**
   * When resuming, refresh the tenant's *profile* from the wizard instead of
   * keeping a half-written record. Whitelisted fields only - RUC, plan and the
   * subscription lifecycle are never touched here.
   */
  refreshBusinessProfile?: boolean;
  /**
   * Whether this tenant becomes the caller's active company (and the account is
   * flagged as onboarded). Defaults to true.
   *
   * `POST /api/businesses` sets it only for a login that has no company yet:
   * registering an additional RUC must not steal the switcher's active tenant
   * nor rewrite the onboarding state of a finished account.
   */
  makeActive?: boolean;
}

export interface CompleteOnboardingResult {
  business: Business;
  config: LibroConfiguration;
  establishment: Establishment;
  /** The per-local register in `books` (what /libros lists and exports). */
  book: Book;
  /** true when this call created the tenant (false = resumed an earlier attempt). */
  createdBusiness: boolean;
}

/**
 * Writes the whole of onboarding in ONE database transaction.
 *
 * Why: onboarding used to be four independent statements in the route, with the
 * user flagged `onboarding_completed` *before* the Libro and its establishment
 * were written. Any failure in between left an "onboarded" account with no libro
 * - and because the route only accepted `onboardingStep === 1`, the wizard could
 * never be re-run. Now either the tenant is fully usable or nothing is written.
 *
 * Ordering inside the transaction, and why:
 *   1. business        - the tenant everything else hangs from
 *   2. access grant    - records "this login created it", which is what makes a
 *                        retry recognisable as a resume (and feeds the switcher)
 *   3. libro config    - the online book (public URL, branding, notifications)
 *   4. establishment   - the "lugar" the public portal files against
 *   5. book            - the per-local register in `books`: what /libros lists and
 *                        exports (one PDF per local) for an inspection. Without
 *                        it a brand-new tenant had an empty "Libros" page even
 *                        though its public link existed
 *   6. users row LAST  - the completed flag is the commit marker for the app
 *                        (skipped for an additional RUC, see `makeActive`)
 */
export const onboardingStorage = {
  async completeOnboarding(input: CompleteOnboardingInput): Promise<CompleteOnboardingResult> {
    return await db.transaction(async (tx) => {
      let business: Business | undefined;

      if (input.existingBusinessId) {
        [business] = await tx
          .select()
          .from(businesses)
          .where(eq(businesses.id, input.existingBusinessId));
      }

      const createdBusiness = !business;

      if (!business) {
        [business] = await tx.insert(businesses).values(input.business).returning();
      } else if (input.refreshBusinessProfile) {
        // Resume: the previous attempt created the tenant but never finished, so
        // the wizard's values win for the profile fields it collects.
        const { ruc: _ruc, ...profile } = input.business;
        [business] = await tx
          .update(businesses)
          .set({ ...profile, updatedAt: new Date() })
          .where(eq(businesses.id, business.id))
          .returning();
      }

      // Idempotent: the unique (user_id, business_id) index absorbs a retry.
      await tx
        .insert(userBusinessAccess)
        .values({ userId: input.userId, businessId: business.id, role: "admin" })
        .onConflictDoNothing();

      let config: LibroConfiguration | undefined;
      [config] = await tx
        .select()
        .from(libroConfiguration)
        .where(eq(libroConfiguration.businessId, business.id));

      if (!config) {
        [config] = await tx
          .insert(libroConfiguration)
          .values({ ...input.libro, businessId: business.id, userId: input.userId })
          .returning();
      }

      let establishment: Establishment | undefined;
      [establishment] = await tx
        .select()
        .from(establishments)
        .where(eq(establishments.businessId, business.id));

      if (!establishment) {
        [establishment] = await tx
          .insert(establishments)
          .values({ businessId: business.id, isActive: true, ...input.establishment })
          .returning();
      }

      // The Libro de Reclamaciones of that establishment: DS 011-2011-PCM
      // requires one open to the public, and the establishment above is the
      // "lugar" consumers file against.
      let book: Book | undefined;
      [book] = await tx
        .select()
        .from(books)
        .where(eq(books.establishmentId, establishment.id));

      if (!book) {
        [book] = await tx
          .insert(books)
          .values({
            businessId: business.id,
            establishmentId: establishment.id,
            bookType: "reclamos",
            isActive: true,
          })
          .returning();
      }

      if (input.makeActive !== false) {
        await tx
          .update(users)
          .set({
            businessId: business.id,
            onboardingStep: 2,
            onboardingCompleted: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, input.userId));
      }

      return { business, config, establishment, book, createdBusiness };
    });
  },
};

export type OnboardingStorage = typeof onboardingStorage;
