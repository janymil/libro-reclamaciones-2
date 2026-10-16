import { db } from "../db";
import { eq, and, asc, count, inArray, sql } from "drizzle-orm";
import {
  type User,
  type InsertUser,
  type InsertBusiness,
  users,
  businesses,
  complaints,
  complaintAuditLog,
  authAuditLog,
} from "@shared/schema";
import type {
  UserStats,
  UpdateUserProfileData,
  UserWithBusiness,
} from "./types";
import bcrypt from "bcrypt";

/** Data access for the "user" aggregate. */
export const userStorage = {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  /**
   * Look an account up by email, case-insensitively.
   *
   * The column's UNIQUE constraint is case-sensitive, so an exact comparison
   * would (a) let "Jan@Gmail.com" be registered as a second account for a user
   * who already exists and (b) fail to log in anyone whose stored address
   * carries legacy capitalization. Every caller here needs "who is this
   * person", never "which exact string was stored", so the comparison is
   * folded and new/updated addresses are normalized at the schema level
   * (accountEmailSchema).
   */
  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email.trim().toLowerCase()}`);
    return user;
  },

  async createUser(userData: InsertUser & { password: string }): Promise<User> {
    // Password is already hashed by AuthService - don't hash again!
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        password: userData.password, // Already hashed by AuthService
      })
      .returning();
    return user;
  },

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  },

  async getUserById(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  // Auth security operations

  /**
   * INTERNAL use only (background jobs, quota counting). Never expose the
   * result through an HTTP handler: it spans every tenant. HTTP handlers must
   * use getUsersByBusinessIds with the caller's allowed tenant set.
   */
  async getAllUsers(): Promise<UserWithBusiness[]> {
    return await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        businessId: users.businessId,
        isActive: users.isActive,
        isEmailVerified: users.isEmailVerified,
        isDemo: users.isDemo,
        onboardingStep: users.onboardingStep,
        onboardingCompleted: users.onboardingCompleted,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        businessName: businesses.businessName,
      })
      .from(users)
      .leftJoin(businesses, eq(users.businessId, businesses.id))
      .orderBy(asc(users.firstName), asc(users.lastName));
  },

  /**
   * Tenant-scoped user listing: only users whose active business is one of
   * the given ids (the caller's active tenant plus its multi-RUC grants).
   */
  async getUsersByBusinessIds(businessIds: string[]): Promise<UserWithBusiness[]> {
    if (businessIds.length === 0) {
      return [];
    }
    return await db
      .select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        role: users.role,
        businessId: users.businessId,
        isActive: users.isActive,
        isEmailVerified: users.isEmailVerified,
        isDemo: users.isDemo,
        onboardingStep: users.onboardingStep,
        onboardingCompleted: users.onboardingCompleted,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        businessName: businesses.businessName,
      })
      .from(users)
      .leftJoin(businesses, eq(users.businessId, businesses.id))
      .where(inArray(users.businessId, businessIds))
      .orderBy(asc(users.firstName), asc(users.lastName));
  },

  async getUserStats(userId: string): Promise<UserStats> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    const [logins] = await db
      .select({ count: count() })
      .from(authAuditLog)
      .where(and(
        eq(authAuditLog.userId, userId),
        eq(authAuditLog.action, 'login_success')
      ));

    const [actions] = await db
      .select({ count: count() })
      .from(complaintAuditLog)
      .where(eq(complaintAuditLog.userId, userId));

    const [managed] = await db
      .select({ count: count() })
      .from(complaints)
      .where(eq(complaints.assignedToUserId, userId));

    return {
      totalLogins: logins?.count ?? 0,
      actionsPerformed: actions?.count ?? 0,
      lastLogin: user?.lastLoginAt ?? null,
      complaintsManaged: managed?.count ?? 0,
    };
  },

  async updateUserStatus(id: string, isActive: boolean): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  },

  async updateUserProfile(id: string, data: UpdateUserProfileData): Promise<User> {
    const [existing] = await db.select().from(users).where(eq(users.id, id));
    if (!existing) {
      throw new Error('Usuario no encontrado');
    }

    const userUpdates: Partial<InsertUser> = {};
    if (data.firstName !== undefined) userUpdates.firstName = data.firstName;
    if (data.lastName !== undefined) userUpdates.lastName = data.lastName;
    if (data.email !== undefined) userUpdates.email = data.email;

    // A different address is a different mailbox: the confirmed flag and any
    // pending link describe the OLD one, so the account starts unverified again
    // and the caller sends a fresh link to the new address. Without this, the
    // account kept receiving (and trusting) notifications at an address nobody
    // had ever proven belonged to it.
    if (data.email !== undefined && data.email !== existing.email) {
      userUpdates.isEmailVerified = false;
      userUpdates.emailVerificationToken = null;
      userUpdates.emailVerificationExpires = null;
    }

    const [user] = await db
      .update(users)
      .set({ ...userUpdates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    return user;
  },

  async changeUserPassword(id: string, currentPassword: string, newPassword: string): Promise<void> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new Error('La contraseña actual es incorrecta');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await db
      .update(users)
      .set({ password: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, id));
  },
};
