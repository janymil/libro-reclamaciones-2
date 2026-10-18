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
