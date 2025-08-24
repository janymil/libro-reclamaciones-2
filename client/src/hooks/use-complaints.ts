import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Complaint, InsertComplaint } from "@shared/schema";

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
  slaCompliance: number;
  resolvedThisMonth: number;
  npsScore: number;
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
    mutationFn: async (data: InsertComplaint) => {
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
