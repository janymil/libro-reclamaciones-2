import type { Express } from "express";
import { sql } from "drizzle-orm";

import type { StatusResponse } from '@shared/status';
import { db } from "../db";
import { jobStatus } from "../services/scheduler";
import { getAIHealth } from "../services/aiService";
import { getEmailHealth } from "../services/emailService";
import { computeOverallStatus, readAppVersion, toJobHealth } from "../services/statusService";

/**
 * Public status page endpoint (Phase 3.13): shows the health of the system
 * components without exposing anything sensitive.
 *
 * Every value is now derived from an observation, not from configuration:
 *  - database: SELECT 1 on every request;
 *  - AI: real provider probe, cached for two minutes (aiService.getAIHealth);
 *  - email: real SMTP verify, cached for ten minutes (emailService.getEmailHealth);
 *  - scheduled jobs: the last pass recorded by the scheduler, including errors;
 *  - version: package.json, read once at boot.
 */

const VERSION = readAppVersion();

export function registerStatusRoutes(app: Express): void {
  app.get('/api/status', async (_req, res) => {
    // Real, cached provider probe instead of "the key exists, so it must work".
    const ai = await getAIHealth();
    const email = getEmailHealth();

    // A REAL probe. The previous version hard-coded `database: 'operational'`,
    // so the status page reported green even while the database was down.
    let databaseUp = false;
    try {
      await db.execute(sql`select 1`);
      databaseUp = true;
    } catch (error) {
      console.error('[status] database probe failed:', error);
    }

    const components: StatusResponse['components'] = {
      api: { status: 'operational' },
      database: { status: databaseUp ? 'operational' : 'down' },
      ai: {
        status: ai.status,
        enabled: ai.enabled,
        model: ai.model,
        latencyMs: ai.latencyMs,
        checkedAt: ai.checkedAt,
        fallbackConfigured: ai.fallbackConfigured,
        ...(ai.error ? { error: ai.error } : {}),
      },
      email: {
        status: email.status,
        configured: email.configured,
        latencyMs: email.latencyMs,
        checkedAt: email.checkedAt,
        ...(email.error ? { error: email.error } : {}),
      },
    };

    const jobs: StatusResponse['jobs'] = {
      retention: toJobHealth(jobStatus.retention),
      slaMonitoring: toJobHealth(jobStatus.slaMonitoring),
    };

    const body: StatusResponse = {
      status: computeOverallStatus(components, Object.values(jobs)),
      version: VERSION,
      checkedAt: new Date().toISOString(),
      components,
      jobs,
    };

    // Never let an intermediary (Cloudflare, Caddy) serve a stale health result.
    res.setHeader('Cache-Control', 'no-store');
    res.json(body);
  });
}
