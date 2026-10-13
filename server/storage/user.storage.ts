import { db } from "../db";
import { eq, and, asc, count, inArray } from "drizzle-orm";
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

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
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

    const [user] = await db
      .update(users)
      .set({ ...userUpdates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();

    // Phone and address belong to the business record, not the user
    if (existing.businessId && (data.phone !== undefined || data.address !== undefined)) {
      const businessUpdates: Partial<InsertBusiness> = {};
      if (data.phone !== undefined) businessUpdates.phone = data.phone;
      if (data.address !== undefined) businessUpdates.address = data.address;

      await db
        .update(businesses)
        .set({ ...businessUpdates, updatedAt: new Date() })
        .where(eq(businesses.id, existing.businessId));
    }

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
