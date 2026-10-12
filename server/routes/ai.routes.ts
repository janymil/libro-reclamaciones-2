import type { Express } from "express";

import { aiService } from "../services/aiService";
import { requireAuth } from "../middleware/requireAuth";

/**
 * AI assisted complaint classification and response drafting.
 */
export function registerAiRoutes(app: Express): void {
  // AI assistant routes
  app.post('/api/ai/classify', requireAuth, async (req: any, res) => {
    try {
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }
      
      const classification = await aiService.classifyComplaint(text);
      res.json(classification);
    } catch (error) {
      console.error('Error classifying complaint:', error);
      res.status(500).json({ message: "Failed to classify complaint" });
    }
  });

  app.post('/api/ai/suggest-response', requireAuth, async (req: any, res) => {
    try {
      const { complaintText, complaintType } = req.body;
      
      if (!complaintText || !complaintType) {
        return res.status(400).json({ message: "Complaint text and type are required" });
      }
      
      const suggestion = await aiService.suggestResponse(complaintText, complaintType);
      res.json({ suggestion });
    } catch (error) {
      console.error('Error generating response suggestion:', error);
      res.status(500).json({ message: "Failed to generate response suggestion" });
    }
  });
}
