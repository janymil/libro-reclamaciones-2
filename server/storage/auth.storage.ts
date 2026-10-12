import { db } from "../db";
import { eq, and, count, gte, sql } from "drizzle-orm";
import {
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

  // Libro configuration for onboarding step 2
};
