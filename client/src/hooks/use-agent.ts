import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface AgentCitation {
  id: string;
  norm: string;
  article: string;
  title: string;
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentReply {
  reply: string;
  source: "ai" | "fallback";
  toolsUsed: string[];
  citations: AgentCitation[];
  model: string;
}

export interface AgentCapabilities {
  enabled: boolean;
  model: string;
  tools: Array<{ name: string; description?: string }>;
  knowledgeBaseSize: number;
}

/**
 * Reads a JSON body, failing with a helpful message when the response is not the
 * API we expect (for instance the SPA fallback HTML served when the API routes are
 * not mounted, e.g. a dev server that has not been restarted after a server-side
 * change). Without this guard `response.json()` throws an opaque SyntaxError.
 */
async function readJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') ?? '';

  if (!response.ok) {
    let detail = '';
    if (contentType.includes('application/json')) {
      try {
        detail = ((await response.json()) as { message?: string })?.message ?? '';
      } catch {
        // fall through to the generic message
      }
    }
    throw new Error(detail || 'El asistente no está disponible en este momento.');
  }

  if (!contentType.includes('application/json')) {
    throw new Error(
      'El servidor devolvió una respuesta no válida. Si se acaba de actualizar el servidor, recargue la página e intente nuevamente.',
    );
  }

  return (await response.json()) as T;
}

export function useAgentCapabilities() {
  return useQuery({
    queryKey: ['/api/agent/capabilities'],
    queryFn: async () =>
      readJson<AgentCapabilities>(
        await fetch('/api/agent/capabilities', { credentials: 'include' }),
      ),
  });
}

/** Sends the conversation to the compliance co-pilot (POST /api/agent/chat). */
export function useAgentChat() {
  return useMutation({
    mutationFn: async (messages: AgentMessage[]) =>
      readJson<AgentReply>(await apiRequest('POST', '/api/agent/chat', { messages })),
  });
}
