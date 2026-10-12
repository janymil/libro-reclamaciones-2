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

      const rawMessages = req.body?.messages;
      if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
        return res.status(400).json({ message: "Se requiere un arreglo 'messages' con al menos un mensaje." });
      }

      // Only well-formed user/assistant turns are accepted; anything else is
      // dropped rather than trusted.
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
        return res.status(400).json({ message: "El último mensaje debe ser del usuario." });
      }

      const business = await storage.getBusiness(req.user.businessId);

      const reply = await agentService.chat(
        {
          businessId: req.user.businessId,
          businessName: business?.businessName ?? null,
          userId: req.user.id,
          userName: `${req.user.firstName} ${req.user.lastName}`.trim(),
        },
        messages,
      );

      res.json(reply);
    } catch (error) {
      console.error('Error in agent chat:', error);
      res.status(500).json({ message: "No se pudo procesar la consulta del asistente." });
    }
  });
}
