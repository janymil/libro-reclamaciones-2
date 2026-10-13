import { db } from "../db";
import { eq, and, count, gte, sql } from "drizzle-orm";
import {
  type User,
  type LoginAttempt,
  type InsertLoginAttempt,
  type AuthAuditLog,
  type InsertAuthAuditLog,
  users,
  loginAttempts,
  authAuditLog,
} from "@shared/schema";

/** Data access for the "auth" aggregate. */
export const authStorage = {
  async incrementFailedLoginAttempts(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        failedLoginAttempts: sql`${users.failedLoginAttempts} + 1`,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  },

  async resetFailedLoginAttempts(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        failedLoginAttempts: 0,
        accountLockedUntil: null,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  },

  async lockUserAccount(userId: string, lockUntil: Date): Promise<void> {
    await db
      .update(users)
      .set({ 
        accountLockedUntil: lockUntil,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  },

  async updateLastLogin(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ 
        lastLoginAt: new Date(),
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  },

  async setPasswordResetToken(email: string, token: string, expires: Date): Promise<void> {
    await db
      .update(users)
      .set({ 
        passwordResetToken: token,
        passwordResetExpires: expires,
        updatedAt: new Date()
      })
      .where(eq(users.email, email));
  },

  async getFailedLoginAttempts(email: string, ipAddress: string, since: Date): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(loginAttempts)
      .where(and(
        eq(loginAttempts.email, email),
        eq(loginAttempts.ipAddress, ipAddress),
        eq(loginAttempts.success, false),
        gte(loginAttempts.createdAt, since)
      ));
    
    return result[0]?.count || 0;
  },

  // Auth audit logging

  async createAuthAuditLog(auditLogData: InsertAuthAuditLog): Promise<AuthAuditLog> {
    const [auditLog] = await db
      .insert(authAuditLog)
      .values(auditLogData)
      .returning();
    return auditLog;
  },

  async createLoginAttempt(loginAttemptData: InsertLoginAttempt): Promise<LoginAttempt> {
    const [loginAttempt] = await db
      .insert(loginAttempts)
      .values(loginAttemptData)
      .returning();
    return loginAttempt;
  },

  /**
   * Resolves the account that owns a password-reset token. The caller must still
   * check `passwordResetExpires`; this lookup is by token only.
   */
  async getUserByPasswordResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token));
    return user;
  },

  /**
   * Password-reset completion: stores the new hash and clears the token, its
   * expiry and any lockout in ONE statement. Doing it atomically means the token
   * cannot be replayed even if two confirmations race, and a user who was locked
   * out before resetting is not left locked out afterwards.
   */
  async completePasswordReset(userId: string, hashedPassword: string): Promise<void> {
    await db
      .update(users)
      .set({
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
        failedLoginAttempts: 0,
        accountLockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  },

  // Libro configuration for onboarding step 2
};
