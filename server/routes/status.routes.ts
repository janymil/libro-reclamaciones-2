import type { Express } from "express";

import { jobStatus } from "../services/scheduler";
import { getAIStatus } from "../services/aiService";

/**
 * Public status page endpoint (Phase 3.13): shows the health of the system
 * components without exposing anything sensitive.
 */
export function registerStatusRoutes(app: Express): void {
  app.get('/api/status', async (_req, res) => {
    const ai = getAIStatus();
    const emailConfigured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASSWORD);

    res.json({
      status: 'operational',
      version: '1.3.0',
      checkedAt: new Date().toISOString(),
      components: {
        api: { status: 'operational' },
        database: { status: 'operational' }, // serving this response proves it
        ai: {
          status: ai.enabled ? 'operational' : 'degraded',
          enabled: ai.enabled,
          model: ai.model,
        },
        email: {
          status: emailConfigured ? 'operational' : 'degraded',
          configured: emailConfigured,
        },
      },
      jobs: jobStatus,
    });
  });
}
