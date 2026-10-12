import type { Business } from '@shared/schema';

/**
 * Response shapes returned by the Express API. They mirror the return types of
 * the corresponding methods in `server/storage.ts` so the React pages can be
 * typed instead of falling back to `{}`.
 */

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  businessId: string | null;
  businessName?: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  onboardingStep: number;
  onboardingCompleted: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessSummary extends Business {
  establishmentCount: number;
  userCount: number;
}

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  businessId: string | null;
  isActive: boolean;
  isEmailVerified: boolean;
  onboardingStep: number;
  onboardingCompleted: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  businessName: string | null;
}

export interface BookSummary {
  id: string;
  businessId: string;
  establishmentId: string;
  establishmentName: string;
  bookType: string;
  description: string | null;
  entriesCount: number;
  isActive: boolean;
  createdAt: string;
}

export interface UserStats {
  totalLogins: number;
  actionsPerformed: number;
  lastLogin: string | null;
  complaintsManaged: number;
}

export interface ActivityEntry {
  id: string;
  action: string;
  description: string;
  username: string;
  module: string;
  timestamp: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  username: string;
  recordId: string;
  entityType: string;
  oldValues: unknown;
  newValues: unknown;
  timestamp: string;
}

export interface SystemChange {
  id: string;
  title: string;
  description: string;
  type: string;
  version: string;
  timestamp: string;
}

export interface ReportStats {
  totalComplaints: number;
  complaintsGrowth: number;
  averageResponseTime: number;
  resolutionRate: number;
  complianceRate: number;
}

export interface MonthlyReport {
  month: string;
  complaints: number;
  resolved: number;
  overdue: number;
}
