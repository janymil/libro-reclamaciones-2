import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Complaint, ComplaintSubmission } from "@shared/schema";
import type { ConsumerDraftContext } from "@shared/consumer-draft-context";
import type { SupportedLanguage } from "@shared/language";

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

export function useSlaPrediction(enabled = true) {
  return useQuery({
    queryKey: ['/api/ai/sla-prediction'],
    queryFn: async () => {
      const response = await fetch('/api/ai/sla-prediction', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch SLA prediction');
      }
      return response.json() as Promise<SlaPrediction>;
    },
    // SLA prediction is a Pro feature (aiDrafting). Keeping the query disabled
    // for other plans avoids a guaranteed 402 on every dashboard load.
    enabled,
  });
}

export interface ConsumerAssistanceResult {
  isComplete: boolean;
  missingFields: string[];
  suggestions: string[];
  improvedText?: string;
  language?: SupportedLanguage;
  source: 'ai' | 'fallback';
}

/** Structured fields returned by the public form autofill. */
export interface ExtractedComplaintFieldsResult {
  productServiceName?: string;
  purchaseAmount?: string;
  purchaseDate?: string;
  receiptNumber?: string;
  consumerRequest?: string;
  complaintType?: 'reclamo' | 'queja';
  language?: SupportedLanguage;
  source: 'ai' | 'fallback';
}

/** Consumer-side form assistant (public endpoint, no auth).
 *
 * Carries its own solved CAPTCHA: the server spends money on every accepted
 * call, so the endpoint refuses a request that does not prove the work. The
 * caller solves one puzzle per click (they are single-use).
 *
 * `context` carries the non-personal fields the visitor already completed
 * (product, amount, purchase date, receipt number), so the assistant does not
 * report as missing what the form already holds. See
 * shared/consumer-draft-context.ts for the whitelist. */
export function useAIPublicAssist() {
  return useMutation({
    mutationFn: async ({
      text,
      context,
      captchaToken,
      captchaAnswer,
    }: {
      text: string;
      context?: ConsumerDraftContext;
      captchaToken: string;
      captchaAnswer: string;
    }) => {
      const response = await apiRequest('POST', '/api/ai/public/assist', {
        text,
        context,
        captchaToken,
        captchaAnswer,
      });
      return response.json() as Promise<ConsumerAssistanceResult>;
    },
  });
}

/**
 * Public-form autofill: the visitor describes the problem and the model fills
 * the structured fields. Same one-challenge-per-click rule as the review.
 */
export function useAIPublicExtract() {
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
      const response = await apiRequest('POST', '/api/ai/public/extract', {
        text,
        captchaToken,
        captchaAnswer,
      });
      return response.json() as Promise<ExtractedComplaintFieldsResult>;
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

export type ResponseTone = 'empatico' | 'formal' | 'firme';
export type ResponseLength = 'breve' | 'estandar' | 'detallada';

export interface AISuggestResponseInput {
  complaintText: string;
  complaintType: string;
  tone?: ResponseTone | null;
  length?: ResponseLength | null;
}

export function useAISuggestResponse() {
  return useMutation({
    mutationFn: async ({ complaintText, complaintType, tone, length }: AISuggestResponseInput) => {
      const response = await apiRequest('POST', '/api/ai/suggest-response', {
        complaintText,
        complaintType,
        tone: tone ?? undefined,
        length: length ?? undefined,
      });
      return response.json() as Promise<{
        suggestion: string;
        source: 'ai' | 'fallback';
        tone: ResponseTone | null;
        length: ResponseLength | null;
      }>;
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

// ---- AI usage meter, feedback loop, executive report, onboarding assistant ----

export interface AIUsageSummary {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  byFeature: Array<{ feature: string; calls: number; totalTokens: number; estimatedCostUsd: number }>;
}

export interface AIFeedbackSummary {
  total: number;
  positive: number;
  negative: number;
  acceptanceRate: number | null;
  byFeature: Array<{ feature: string; total: number; positive: number; negative: number }>;
}

export interface AIUsageResponse {
  days: number;
  since: string;
  usage: AIUsageSummary;
  feedback: AIFeedbackSummary;
}

export function useAIUsage(days = 30) {
  return useQuery({
    queryKey: ['/api/ai/usage', days],
    queryFn: async () => {
      const response = await fetch(`/api/ai/usage?days=${days}`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to fetch AI usage');
      }
      return response.json() as Promise<AIUsageResponse>;
    },
  });
}

export function useAIFeedback() {
  return useMutation({
    mutationFn: async (input: {
      feature: string;
      rating: 1 | -1;
      comment?: string;
      complaintId?: string;
    }) => {
      const response = await apiRequest('POST', '/api/ai/feedback', input);
      return response.json() as Promise<{ ok: boolean }>;
    },
  });
}

export interface ExecutiveReportResult {
  report: {
    headline: string;
    summary: string;
    highlights: string[];
    risks: string[];
    actions: string[];
    kpiNotes: string[];
    source: 'ai' | 'fallback';
  };
  periodLabel: string;
  pdfBase64: string | null;
  emailedTo: string | null;
}

export function useExecutiveReport() {
  return useMutation({
    mutationFn: async (input: { month?: string; sendEmail?: boolean }) => {
      const response = await apiRequest('POST', '/api/ai/executive-report', input);
      return response.json() as Promise<ExecutiveReportResult>;
    },
  });
}

export interface AIOnboardingKit {
  brandTone: string;
  brandPolicies: string;
  confirmationMessage: string;
  emailHeaderText: string;
  source: 'ai' | 'fallback';
}

export function useAIOnboardingKit() {
  return useMutation({
    mutationFn: async (input: {
      description: string;
      businessName?: string;
      businessType?: string;
    }) => {
      const response = await apiRequest('POST', '/api/ai/onboarding', input);
      return response.json() as Promise<AIOnboardingKit>;
    },
  });
}
