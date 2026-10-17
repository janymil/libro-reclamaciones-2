import { useState } from "react";
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

/**
 * Streaming variant: the server sends `progress` events while it reasons/tools
 * and a `final` event with the same AgentReply. Parsing SSE here (instead of
 * EventSource) keeps the existing authenticated POST contract and its body.
 */
async function streamAgentChat(
  messages: AgentMessage[],
  onProgress?: (message: string) => void,
): Promise<AgentReply> {
  const response = await fetch('/api/agent/chat/stream', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(detail || 'El asistente no está disponible en este momento.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: AgentReply | null = null;

  const handleChunk = (chunk: string) => {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of chunk.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;

    const payload = JSON.parse(dataLines.join('\n')) as any;
    if (event === 'progress') {
      if (typeof payload?.message === 'string') onProgress?.(payload.message);
    } else if (event === 'final') {
      final = payload as AgentReply;
    } else if (event === 'error') {
      throw new Error(payload?.message || 'No se pudo procesar la consulta.');
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      handleChunk(chunk);
      boundary = buffer.indexOf('\n\n');
    }
  }

  if (!final) {
    throw new Error('El asistente no devolvió una respuesta. Intente nuevamente.');
  }
  return final;
}

/** Streaming co-pilot mutation with the latest progress message. */
export function useAgentChatStream() {
  const [progress, setProgress] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (messages: AgentMessage[]) =>
      streamAgentChat(messages, (message) => setProgress(message)),
    onSettled: () => setProgress(null),
  });

  return { ...mutation, progress };
}
