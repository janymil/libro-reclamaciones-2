import type { Express } from "express";

import { aiService, getAIStatus } from "../services/aiService";
import { rankSlaRisk } from "../services/slaPredictionService";
import { requireAuth } from "../middleware/requireAuth";
import { aiLimiter, publicAiLimiter } from "../middleware/rateLimits";
import { storage } from "../storage";

/**
 * AI assisted complaint classification, response drafting and trend analysis.
 * Every response includes a `source` field ("ai" | "fallback") so the client
 * can tell the user when local heuristics were used instead of a real model.
 */
export function registerAiRoutes(app: Express): void {
  // Whether an AI provider is configured (drives the "IA activa" UI badge)
  app.get('/api/ai/status', requireAuth, (req, res) => {
    res.json(getAIStatus());
  });

  app.post('/api/ai/classify', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ message: "Text is required" });
      }

      const classification = await aiService.classifyComplaint(text);
      res.json(classification);
    } catch (error) {
      console.error('Error classifying complaint:', error);
      res.status(500).json({ message: "Failed to classify complaint" });
    }
  });

  app.post('/api/ai/suggest-response', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      const { complaintText, complaintType } = req.body;

      if (!complaintText || !complaintType) {
        return res.status(400).json({ message: "Complaint text and type are required" });
      }

      // Brand voice (Phase 3.10): drafts follow the business's own tone and
      // policies configured in Personalización.
      const config = await storage.getLibroConfiguration(req.user.businessId);
      const brandContext = config
        ? { brandTone: config.brandTone, brandPolicies: config.brandPolicies }
        : undefined;

      const { suggestion, source } = await aiService.suggestResponse(complaintText, complaintType, brandContext);
      res.json({ suggestion, source });
    } catch (error) {
      console.error('Error generating response suggestion:', error);
      res.status(500).json({ message: "Failed to generate response suggestion" });
    }
  });

  // Abusive-clause detection (Phase 3.11): paste contract terms or conditions
  // and get them reviewed against art. 47 of the Consumer Protection Code.
  app.post('/api/ai/abusive-clauses', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string' || text.trim().length < 20) {
        return res.status(400).json({ message: "Se requiere el texto del contrato (mínimo 20 caracteres)" });
      }

      const analysis = await aiService.detectAbusiveClauses(text);
      res.json(analysis);
    } catch (error) {
      console.error('Error detecting abusive clauses:', error);
      res.status(500).json({ message: "Failed to analyze clauses" });
    }
  });

  // Executive case summary (Phase 3.11): the 30-second brief for managers.
  app.post('/api/ai/case-summary', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      const { complaintId } = req.body;

      const complaint = await storage.getComplaint(complaintId);
      if (!complaint || complaint.businessId !== req.user.businessId) {
        return res.status(404).json({ message: "Complaint not found" });
      }

      const caseText = [
        `Correlativo: ${complaint.correlativeNumber}`,
        `Tipo: ${complaint.complaintType} (prioridad ${complaint.priority})`,
        `Estado: ${complaint.status}`,
        `Producto/Servicio: ${complaint.productServiceName}`,
        `Consumidor: ${complaint.consumerFullName}`,
        `Detalle: ${complaint.complaintDetail}`,
        `Pedido del consumidor: ${complaint.consumerRequest ?? 'No especificado'}`,
        `Respuesta enviada: ${complaint.providerResponse ?? 'Aún sin respuesta'}`,
      ].join('\n');

      const summary = await aiService.generateCaseSummary(caseText);
      res.json(summary);
    } catch (error) {
      console.error('Error generating case summary:', error);
      res.status(500).json({ message: "Failed to generate case summary" });
    }
  });

  // Trend analysis over the business's open complaints (was previously dead
  // code in aiService with no route or UI).
  app.post('/api/ai/trends', requireAuth, aiLimiter, async (req: any, res) => {
    try {
      const complaints = await storage.getComplaintsByBusiness(req.user.businessId);
      const openComplaints = complaints
        .filter((complaint) => complaint.status === 'new' || complaint.status === 'in_progress')
        .slice(0, 50)
        .map((complaint) => complaint.complaintDetail);

      const trends = await aiService.analyzeComplaintTrends(openComplaints);
      res.json({ ...trends, analyzedCount: openComplaints.length });
    } catch (error) {
      console.error('Error analyzing complaint trends:', error);
      res.status(500).json({ message: "Failed to analyze complaint trends" });
    }
  });

  // SLA-breach prediction: ranks open complaints by risk of missing the
  // 15-business-day legal deadline (DS 101-2022-PCM). Deterministic scoring -
  // no upstream AI call, so it is free and instant.
  app.get('/api/ai/sla-prediction', requireAuth, async (req: any, res) => {
    try {
      const complaints = await storage.getComplaintsByBusiness(req.user.businessId);
      const open = complaints.filter(
        (complaint) => complaint.status === 'new' || complaint.status === 'in_progress'
      );
      const assessments = rankSlaRisk(open);

      res.json({
        assessments,
        summary: {
          total: open.length,
          highRisk: assessments.filter((assessment) => assessment.riskLevel === 'high').length,
          mediumRisk: assessments.filter((assessment) => assessment.riskLevel === 'medium').length,
        },
      });
    } catch (error) {
      console.error('Error predicting SLA risk:', error);
      res.status(500).json({ message: "Failed to predict SLA risk" });
    }
  });

  // Consumer-side form assistant: public (no auth) but strictly rate-limited.
  // Helps consumers write complete, well-structured complaints, which are far
  // faster for the business to process and resolve.
  app.post('/api/ai/public/assist', publicAiLimiter, async (req: any, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string' || text.trim().length < 10) {
        return res.status(400).json({
          message: "Se requiere el texto del borrador (mínimo 10 caracteres)",
        });
      }

      const assistance = await aiService.assistConsumerDraft(text);
      res.json(assistance);
    } catch (error) {
      console.error('Error assisting consumer draft:', error);
      res.status(500).json({ message: "Failed to assist draft" });
    }
  });
}

