import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { storage } from '../storage';
import { emailService } from './emailService';
import type { 
  User, 
  UserRegistration, 
  LoginData,
  InsertAuthAuditLog,
  InsertLoginAttempt 
} from '@shared/schema';

const SALT_ROUNDS = 14; // Bank-level security
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;
const PASSWORD_LENGTH = 12;

export class AuthService {
  
  /**
   * Generate a secure random password
   */
  private generateSecurePassword(): string {
    const length = PASSWORD_LENGTH;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    
    // Ensure at least one of each type
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // uppercase
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // lowercase  
    password += '0123456789'[Math.floor(Math.random() * 10)]; // number
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // special
    
    // Fill remaining length
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => 0.5 - Math.random()).join('');
  }

  /**
   * Hash password with bcrypt (bank-level security)
   */
  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  /**
   * Verify password with bcrypt
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Log authentication events for security audit
   */
  private async logAuthEvent(
    action: string, 
    email: string, 
    success: boolean, 
    ipAddress: string,
    userAgent: string,
    userId?: string,
    failureReason?: string,
    metadata?: any
  ): Promise<void> {
    const auditLog: InsertAuthAuditLog = {
      userId,
      action,
      email,
      ipAddress,
      userAgent,
      success,
      failureReason,
      metadata
    };
    
    await storage.createAuthAuditLog(auditLog);
  }

  /**
   * Track login attempts for rate limiting
   */
  private async logLoginAttempt(
    email: string,
    ipAddress: string,
    userAgent: string,
    success: boolean,
    failureReason?: string
  ): Promise<void> {
    const loginAttempt: InsertLoginAttempt = {
      email,
      ipAddress,
      userAgent,
      success,
      failureReason
    };
    
    await storage.createLoginAttempt(loginAttempt);
  }

  /**
   * Check if account is locked due to failed attempts
   */
  private async isAccountLocked(email: string): Promise<boolean> {
    const user = await storage.getUserByEmail(email);
    if (!user) return false;

    if (user.accountLockedUntil && new Date() < user.accountLockedUntil) {
      return true;
    }

    return false;
  }

  /**
   * Get recent failed login attempts count
   */
  private async getRecentFailedAttempts(email: string, ipAddress: string): Promise<number> {
    const since = new Date(Date.now() - 60 * 60 * 1000); // Last hour
    return storage.getFailedLoginAttempts(email, ipAddress, since);
  }

  /**
   * Step 1: Register new user and send password via email
   */
  async registerUser(
    userData: UserRegistration, 
    ipAddress: string, 
    userAgent: string
  ): Promise<{ success: boolean; message: string; userId?: string }> {
    try {
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        await this.logAuthEvent(
          'register_attempt', 
          userData.email, 
          false, 
          ipAddress, 
          userAgent,
          undefined,
          'email_already_exists'
        );
        return { success: false, message: "El email ya está registrado" };
      }

      // Generate secure password
      const password = this.generateSecurePassword();
      const hashedPassword = await this.hashPassword(password);

      // Create user account (Step 1 of onboarding)
      const newUser = await storage.createUser({
        ...userData,
        password: hashedPassword,
        onboardingStep: 1,
        onboardingCompleted: false,
        isEmailVerified: false
      });

      // Send password via email
      await emailService.sendWelcomePassword(userData.email, userData.firstName, password);

      // Log successful registration
      await this.logAuthEvent(
        'register_success', 
        userData.email, 
        true, 
        ipAddress, 
        userAgent,
        newUser.id,
        undefined,
        { step: 1, onboarding: true }
      );

      return { 
        success: true, 
        message: "Usuario registrado. Revisa tu email para obtener tu contraseña.",
        userId: newUser.id
      };

    } catch (error) {
      await this.logAuthEvent(
        'register_error', 
        userData.email, 
        false, 
        ipAddress, 
        userAgent,
        undefined,
        error instanceof Error ? error.message : 'unknown_error'
      );
      throw error;
    }
  }

  /**
   * Login user with email and password
   */
  async loginUser(
    loginData: LoginData, 
    ipAddress: string, 
    userAgent: string
  ): Promise<{ success: boolean; message: string; user?: User }> {
    try {
      // Check rate limiting - recent failed attempts
      const recentFailedAttempts = await this.getRecentFailedAttempts(loginData.email, ipAddress);
      if (recentFailedAttempts >= MAX_LOGIN_ATTEMPTS) {
        await this.logLoginAttempt(loginData.email, ipAddress, userAgent, false, 'rate_limited');
        await this.logAuthEvent(
          'login_blocked', 
          loginData.email, 
          false, 
          ipAddress, 
          userAgent,
          undefined,
          'rate_limited'
        );
        return { success: false, message: "Demasiados intentos fallidos. Intenta más tarde." };
      }

      // Check if account is locked
      if (await this.isAccountLocked(loginData.email)) {
        await this.logLoginAttempt(loginData.email, ipAddress, userAgent, false, 'account_locked');
        await this.logAuthEvent(
          'login_blocked', 
          loginData.email, 
          false, 
          ipAddress, 
          userAgent,
          undefined,
          'account_locked'
        );
        return { success: false, message: "Cuenta temporalmente bloqueada. Intenta más tarde." };
      }

      // Get user
      const user = await storage.getUserByEmail(loginData.email);
      if (!user) {
        await this.logLoginAttempt(loginData.email, ipAddress, userAgent, false, 'user_not_found');
        await this.logAuthEvent(
          'login_failed', 
          loginData.email, 
          false, 
          ipAddress, 
          userAgent,
          undefined,
          'user_not_found'
        );
        return { success: false, message: "Credenciales inválidas" };
      }

      // Check if user is active
      if (!user.isActive) {
        await this.logLoginAttempt(loginData.email, ipAddress, userAgent, false, 'user_inactive');
        await this.logAuthEvent(
          'login_failed', 
          loginData.email, 
          false, 
          ipAddress, 
          userAgent,
          user.id,
          'user_inactive'
        );
        return { success: false, message: "Cuenta desactivada. Contacta al soporte." };
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(loginData.password, user.password);
      if (!isValidPassword) {
        // Increment failed attempts
        await storage.incrementFailedLoginAttempts(user.id);
        
        // Lock account if too many failed attempts
        if (user.failedLoginAttempts + 1 >= MAX_LOGIN_ATTEMPTS) {
          const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
          await storage.lockUserAccount(user.id, lockUntil);
        }

        await this.logLoginAttempt(loginData.email, ipAddress, userAgent, false, 'invalid_password');
        await this.logAuthEvent(
          'login_failed', 
          loginData.email, 
          false, 
          ipAddress, 
          userAgent,
          user.id,
          'invalid_password'
        );
        return { success: false, message: "Credenciales inválidas" };
      }

      // Successful login - reset failed attempts and update last login
      await storage.resetFailedLoginAttempts(user.id);
      await storage.updateLastLogin(user.id);

      await this.logLoginAttempt(loginData.email, ipAddress, userAgent, true);
      await this.logAuthEvent(
        'login_success', 
        loginData.email, 
        true, 
        ipAddress, 
        userAgent,
        user.id,
        undefined,
        { onboardingStep: user.onboardingStep, onboardingCompleted: user.onboardingCompleted }
      );

      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      return { success: true, message: "Login exitoso", user: userWithoutPassword as User };

    } catch (error) {
      await this.logAuthEvent(
        'login_error', 
        loginData.email, 
        false, 
        ipAddress, 
        userAgent,
        undefined,
        error instanceof Error ? error.message : 'unknown_error'
      );
      throw error;
    }
  }

  /**
   * Logout user and log the event
   */
  async logoutUser(userId: string, email: string, ipAddress: string, userAgent: string): Promise<void> {
    await this.logAuthEvent(
      'logout', 
      email, 
      true, 
      ipAddress, 
      userAgent,
      userId
    );
  }

  /**
   * Generate password reset token (for future use)
   */
  async generatePasswordResetToken(email: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    await storage.setPasswordResetToken(email, token, expires);
    return token;
  }

  /**
   * Validate session user and check if account is still active
   */
  async validateSessionUser(userId: string): Promise<User | null> {
    const user = await storage.getUserById(userId);
    if (!user || !user.isActive) {
      return null;
    }

    // Check if account is locked
    if (user.accountLockedUntil && new Date() < user.accountLockedUntil) {
      return null;
    }

    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword as User;
  }
}

export const authService = new AuthService();