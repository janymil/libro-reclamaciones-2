import fs from 'fs';
import path from 'path';

import type { ComponentStatus, StatusComponent, StatusJob } from '@shared/status';

/**
 * Helpers behind the public `/estado` page.
 *
 * Kept pure (no database, no network, no timers) so the rules that decide what
 * "Operativo" means are unit-tested instead of being implied by a route handler.
 */

/** Snapshot of an in-memory `jobStatus` entry from services/scheduler.ts. */
export interface JobSnapshot {
  lastRun: Date | null;
  lastResult: string | null;
}

/**
 * A job that has not run since boot is `pending`, not "healthy": saying
 * "Operativo" before the first pass would be a guess. `error: ...` in the last
 * result marks the job as `degraded`.
 */
export function toJobHealth(job: JobSnapshot): StatusJob {
  if (!job.lastRun) {
    return { status: 'pending', lastRun: null, lastResult: null };
  }

  const failed = typeof job.lastResult === 'string' && job.lastResult.startsWith('error:');
  return {
    status: failed ? 'degraded' : 'operational',
    lastRun: new Date(job.lastRun).toISOString(),
    lastResult: job.lastResult,
  };
}

/**
 * Overall status.
 *
 * - the database is the only component whose failure makes the service `down`
 *   (the API answers, but nothing can be read or written);
 * - a degraded AI, email or scheduled job makes the service `degraded`;
 * - `disabled` (not configured) and `pending` (first probe still running) are
 *   not failures: the application works without AI, and email is optional for
 *   a deployment that only files complaints.
 */
export function computeOverallStatus(
  components: { database: StatusComponent; ai: StatusComponent; email: StatusComponent },
  jobs: StatusJob[],
): ComponentStatus {
  if (components.database.status === 'down') {
    return 'down';
  }
  if (components.database.status === 'degraded') {
    return 'degraded';
  }

  const degraded =
    components.ai.status === 'degraded' ||
    components.email.status === 'degraded' ||
    jobs.some((job) => job.status === 'degraded');

  return degraded ? 'degraded' : 'operational';
}

/**
 * Public job projection: the status is enough. A degraded run must not publish
 * the raw exception (it can contain hostnames, paths or provider messages).
 */
export function toPublicJobHealth(job: JobSnapshot): StatusJob {
  const health = toJobHealth(job);
  return {
    ...health,
    lastResult: health.status === "degraded" ? null : health.lastResult,
  };
}

/**
 * Public projection of the AI probe.
 *
 * The internal probe knows the provider URL and model name. Neither may leave
 * the server: the status page only needs to say whether the service works.
 */
export function toPublicAIStatus(health: {
  status: ComponentStatus;
  enabled?: boolean;
  latencyMs?: number | null;
  checkedAt?: string;
}) {
  return {
    status: health.status,
    ...(health.enabled !== undefined ? { enabled: health.enabled } : {}),
    ...(health.latencyMs !== undefined ? { latencyMs: health.latencyMs } : {}),
    ...(health.checkedAt ? { checkedAt: health.checkedAt } : {}),
  };
}

/**
 * Public projection of the email probe. No SMTP host, user, mode or raw error:
 * those are internal infrastructure details, not customer information.
 */
export function toPublicEmailStatus(health: {
  status: ComponentStatus;
  configured?: boolean;
  latencyMs?: number | null;
  checkedAt?: string;
}) {
  return {
    status: health.status,
    ...(health.configured !== undefined ? { configured: health.configured } : {}),
    ...(health.latencyMs !== undefined ? { latencyMs: health.latencyMs } : {}),
    ...(health.checkedAt ? { checkedAt: health.checkedAt } : {}),
  };
}

/**
 * The version comes from package.json (the single source of truth), read at
 * runtime from the application root. The image copies package.json to /app and
 * starts the process there; local runs use the repository root.
 */
export function readAppVersion(): string {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'string' && parsed.version.trim()) {
      return parsed.version.trim();
    }
  } catch {
    // Fall through: a missing package.json must not take the status page down.
  }
  return 'desconocida';
}
