import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Complaint, ComplaintSubmission } from "@shared/schema";

interface ComplaintFilters {
  status?: string;
  type?: string;
  priority?: string;
  establishmentId?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface DashboardMetrics {
  activeComplaints: number;
  urgentComplaints: number;
  overdueComplaints: number;
  slaCompliance: number;
  resolvedThisMonth: number;
  resolutionRate: number;
  averageResponseTime: number;
  recentComplaints: Complaint[];
  urgentAlerts: Complaint[];
}

export function useComplaints(filters?: ComplaintFilters) {
  const queryParams = new URLSearchParams();
  
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        queryParams.append(key, value);
      }
    });
  }

  return useQuery({
    queryKey: ['/api/complaints', filters],
    queryFn: async () => {
      const response = await fetch(`/api/complaints?${queryParams.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch complaints');
      }
      return response.json() as Promise<Complaint[]>;
    },
  });
}

export function useComplaint(id: string) {
  return useQuery({
    queryKey: ['/api/complaints', id],
    queryFn: async () => {
      const response = await fetch(`/api/complaints/${id}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch complaint');
      }
      return response.json() as Promise<Complaint>;
    },
    enabled: !!id,
  });
}

export function useUpdateComplaint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Complaint> }) => {
      const response = await apiRequest('PATCH', `/api/complaints/${id}`, data);
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/complaints'] });
      queryClient.setQueryData(['/api/complaints', variables.id], data);
    },
  });
}

export function useCreateComplaint() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ComplaintSubmission) => {
      const response = await apiRequest('POST', '/api/public/complaints', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/complaints'] });
    },
  });
}

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['/api/dashboard/metrics'],
    queryFn: async () => {
      const response = await fetch('/api/dashboard/metrics', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard metrics');
      }
      return response.json() as Promise<DashboardMetrics>;
    },
  });
}

export function useComplaintAuditLog(complaintId: string) {
  return useQuery({
    queryKey: ['/api/complaints', complaintId, 'audit'],
    queryFn: async () => {
      const response = await fetch(`/api/complaints/${complaintId}/audit`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch audit log');
      }
      return response.json();
    },
    enabled: !!complaintId,
  });
}

export interface AIStatus {
  enabled: boolean;
  provider: string;
  model: string;
  fastModel: string;
}

export function useAIStatus() {
  return useQuery({
    queryKey: ['/api/ai/status'],
    queryFn: async () => {
      const response = await fetch('/api/ai/status', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch AI status');
      }
      return response.json() as Promise<AIStatus>;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export interface AITrends {
  commonIssues: string[];
  categories: string[];
  severity: string;
  recommendations: string[];
  riskAreas: string[];
  source: 'ai' | 'fallback';
  analyzedCount: number;
}

export function useAITrends() {
  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/ai/trends', {});
      return response.json() as Promise<AITrends>;
    },
  });
}

export interface SimilarComplaint {
  complaintId: string;
  correlativeNumber: string;
  complaintType: string;
  status: string;
  priority: string;
  similarity: number;
  complaintDetail: string;
  providerResponse: string | null;
  submissionDate: string;
}

export function useSimilarComplaints(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['/api/complaints', id, 'similar'],
    queryFn: async () => {
      const response = await fetch(`/api/complaints/${id}/similar`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch similar complaints');
      }
      return response.json() as Promise<SimilarComplaint[]>;
    },
    enabled: enabled && Boolean(id),
  });
}

export interface SlaPrediction {
  assessments: Array<{
    complaintId: string;
    correlativeNumber: string;
    consumerFullName: string;
    productServiceName: string | null;
    priority: string;
    status: string;
    businessDaysRemaining: number;
    riskLevel: 'low' | 'medium' | 'high';
    score: number;
    reasons: string[];
  }>;
  summary: { total: number; highRisk: number; mediumRisk: number };
}

export function useSlaPrediction() {
  return useQuery({
    queryKey: ['/api/ai/sla-prediction'],
    queryFn: async () => {
      const response = await fetch('/api/ai/sla-prediction', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch SLA prediction');
      }
      return response.json() as Promise<SlaPrediction>;
    },
  });
}

export interface ConsumerAssistanceResult {
  isComplete: boolean;
  missingFields: string[];
  suggestions: string[];
  improvedText?: string;
  source: 'ai' | 'fallback';
}

/** Consumer-side form assistant (public endpoint, no auth).
 *
 * Carries its own solved CAPTCHA: the server spends money on every accepted
 * call, so the endpoint refuses a request that does not prove the work. The
 * caller solves one puzzle per click (they are single-use). */
export function useAIPublicAssist() {
  return useMutation({
    mutationFn: async ({
      text,
      captchaToken,
      captchaAnswer,
    }: {
      text: string;
      captchaToken: string;
      captchaAnswer: string;
    }) => {
      const response = await apiRequest('POST', '/api/ai/public/assist', {
        text,
        captchaToken,
        captchaAnswer,
      });
      return response.json() as Promise<ConsumerAssistanceResult>;
    },
  });
}

export function useAIClassification() {
  return useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest('POST', '/api/ai/classify', { text });
      return response.json();
    },
  });
}

export function useAISuggestResponse() {
  return useMutation({
    mutationFn: async ({ complaintText, complaintType }: { complaintText: string; complaintType: string }) => {
      const response = await apiRequest('POST', '/api/ai/suggest-response', {
        complaintText,
        complaintType,
      });
      return response.json();
    },
  });
}

// ---- Phase 1.1: evidence attachments ----------------------------------------

export interface ComplaintAttachmentInfo {
  id: string;
  complaintId: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}

export function useComplaintAttachments(complaintId: string | null | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: ['/api/complaints', complaintId, 'attachments'],
    queryFn: async () => {
      const response = await fetch(`/api/complaints/${complaintId}/attachments`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch attachments');
      }
      return response.json() as Promise<ComplaintAttachmentInfo[]>;
    },
    enabled: enabled && Boolean(complaintId),
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (attachmentId: string) => {
      const response = await apiRequest('DELETE', `/api/attachments/${attachmentId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/complaints'] });
    },
  });
}

// ---- Phase 3.11: executive summary, abusive clauses, reincidence ------------

export interface CaseSummaryResult {
  summary: string;
  keyFacts: string[];
  riskLevel: 'low' | 'medium' | 'high';
  recommendedAction: string;
  source: 'ai' | 'fallback';
}

export function useCaseSummary() {
  return useMutation({
    mutationFn: async (complaintId: string) => {
      const response = await apiRequest('POST', '/api/ai/case-summary', { complaintId });
      return response.json() as Promise<CaseSummaryResult>;
    },
  });
}

export interface AbusiveClauseResult {
  hasAbusiveClauses: boolean;
  clauses: Array<{ quote: string; issue: string; legalBasis: string }>;
  recommendations: string[];
  source: 'ai' | 'fallback';
}

export function useAbusiveClauses() {
  return useMutation({
    mutationFn: async (text: string) => {
      const response = await apiRequest('POST', '/api/ai/abusive-clauses', { text });
      return response.json() as Promise<AbusiveClauseResult>;
    },
  });
}

export interface ReincidenceEntry {
  key: string;
  total: number;
  resolved: number;
  overdue: number;
}

export interface ReincidenceReport {
  byProduct: ReincidenceEntry[];
  byEstablishment: ReincidenceEntry[];
}

export function useReincidenceReport() {
  return useQuery({
    queryKey: ['/api/reports/reincidencia'],
    queryFn: async () => {
      const response = await fetch('/api/reports/reincidencia', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch reincidence report');
      }
      return response.json() as Promise<ReincidenceReport>;
    },
  });
}
