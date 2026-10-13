import type { Express } from "express";
import { sql } from "drizzle-orm";

import { db } from "../db";

/**
 * Liveness and readiness probes (Phase 0).
 *
 * These are what an uptime monitor or load balancer should call — NOT
 * `/api/status`, which reports product-level component health for humans.
 *
 *   * `GET /health`  (liveness)  — is the process up and answering? It never
 *     touches the database, so a transient database blip cannot send the
 *     orchestrator into a restart loop.
 *   * `GET /ready`   (readiness) — can this instance actually serve traffic?
 *     Runs a real `select 1` and answers 503 when the database is unreachable,
 *     so the load balancer drains the instance instead of routing customer
 *     requests into 500s.
 *
 * Both are unauthenticated by design: they expose no tenant data. The failure
 * reason is logged server-side but never returned to the caller (it can contain
 * host names or schema details).
 */
export function registerHealthRoutes(app: Express): void {
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/ready", async (_req, res) => {
    const startedAt = Date.now();

    try {
      await db.execute(sql`select 1`);
      res.json({
        status: "ready",
        checks: { database: { status: "up", latencyMs: Date.now() - startedAt } },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[health] readiness probe failed:", error);
      res.status(503).json({
        status: "degraded",
        checks: { database: { status: "down", latencyMs: Date.now() - startedAt } },
        timestamp: new Date().toISOString(),
      });
    }
  });
}