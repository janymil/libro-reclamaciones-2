import type { Express } from "express";
import { sql } from "drizzle-orm";

import { db } from "../db";
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

    // A REAL probe. The previous version hard-coded `database: 'operational'`,
    // so the status page reported green even while the database was down.
    let databaseUp = false;
    try {
      await db.execute(sql`select 1`);
      databaseUp = true;
    } catch (error) {
      console.error('[status] database probe failed:', error);
    }

    res.json({
      status: databaseUp ? 'operational' : 'degraded',
      version: '1.3.0',
      checkedAt: new Date().toISOString(),
      components: {
        api: { status: 'operational' },
        database: { status: databaseUp ? 'operational' : 'degraded' },
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
