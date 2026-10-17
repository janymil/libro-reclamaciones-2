import type { Express } from "express";

import { agentCapabilities, agentService, type AgentMessage } from "../services/agentService";
import { requireAuth } from "../middleware/requireAuth";
import { aiLimiter } from "../middleware/rateLimits";
import { storage } from "../storage";

/**
 * Compliance co-pilot ("Copiloto de Cumplimiento").
 *
 * A domain-scoped, tool-calling agent grounded in a curated corpus of Peruvian
 * Libro de Reclamaciones / INDECOPI rules, with hard server-side tenant scoping:
 * the tenant is taken from the authenticated session, never from the model.
 */
export function registerAgentRoutes(app: Express): void {
  // Drives the assistant UI: whether a provider is configured, the tools and the
  // size of the local legal corpus.
  app.get('/api/agent/capabilities', requireAuth, (_req, res) => {
    res.json(agentCapabilities());
  });

  app.post('/api/agent/chat', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      if (!req.user.businessId) {
        return res.status(400).json({ message: "Su usuario no está asociado a una empresa." });
      }

      const messages = readMessages(req.body?.messages);
      if (!messages) {
        return res.status(400).json({ message: "Se requiere un arreglo 'messages' con al menos un mensaje del usuario." });
      }

      const reply = await agentService.chat(await agentContext(req.user), messages);
      res.json(reply);
    } catch (error) {
      console.error('Error in agent chat:', error);
      res.status(500).json({ message: "No se pudo procesar la consulta del asistente." });
    }
  });

  /**
   * Streaming variant of the co-pilot.
   *
   * The tool-calling loop cannot stream raw tokens safely (tool deltas and a
   * final answer share one response), so this streams the *progress* the user
   * actually perceives as waiting - "Analizando", "Buscando en la normativa" -
   * and then the final answer in one `final` event. Same validation, same
   * tenant scoping, same rate limit.
   */
  app.post('/api/agent/chat/stream', requireAuth, aiLimiter, async (req: any, res) => {
    if (!req.user.businessId) {
      return res.status(400).json({ message: "Su usuario no está asociado a una empresa." });
    }

    const messages = readMessages(req.body?.messages);
    if (!messages) {
      return res.status(400).json({ message: "Se requiere un arreglo 'messages' con al menos un mensaje del usuario." });
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: string, payload: unknown) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
      const reply = await agentService.chat(
        await agentContext(req.user),
        messages,
        (progress) => send('progress', progress),
      );
      send('final', reply);
    } catch (error) {
      console.error('Error in streaming agent chat:', error);
      send('error', { message: "No se pudo procesar la consulta del asistente." });
    } finally {
      res.end();
    }
  });
}

/** Validates the client-supplied conversation; returns null when unusable. */
function readMessages(rawMessages: unknown): AgentMessage[] | null {
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    return null;
  }

  const messages: AgentMessage[] = rawMessages
    .filter(
      (message: any) =>
        message &&
        (message.role === 'user' || message.role === 'assistant') &&
        typeof message.content === 'string' &&
        message.content.trim().length > 0,
    )
    .slice(-20)
    .map((message: any) => ({ role: message.role, content: message.content }));

  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
    return null;
  }
  return messages;
}

async function agentContext(user: any) {
  const business = await storage.getBusiness(user.businessId);
  return {
    businessId: user.businessId,
    businessName: business?.businessName ?? null,
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`.trim(),
  };
}
