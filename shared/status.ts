/**
 * Shape of `GET /api/status` and of the public `/estado` page.
 *
 * Shared so the server response and the page that renders it cannot drift.
 */

export type ComponentStatus =
  | 'operational'
  | 'degraded'
  | 'down'
  | 'disabled'
  | 'pending';

export interface StatusComponent {
  status: ComponentStatus;
}

export interface AIStatusComponent extends StatusComponent {
  enabled?: boolean;
  model?: string;
  latencyMs?: number | null;
  checkedAt?: string;
  fallbackConfigured?: boolean;
  error?: string;
}

export interface EmailStatusComponent extends StatusComponent {
  configured?: boolean;
  latencyMs?: number | null;
  checkedAt?: string;
  error?: string;
}

/**
 * A scheduled job is `pending` until its first pass after boot, `degraded` when
 * its last pass failed, and `operational` otherwise.
 */
export interface StatusJob {
  status: ComponentStatus;
  lastRun: string | null;
  lastResult: string | null;
}

export interface StatusResponse {
  status: ComponentStatus;
  version: string;
  checkedAt: string;
  components: {
    api: StatusComponent;
    database: StatusComponent;
    ai: AIStatusComponent;
    email: EmailStatusComponent;
  };
  jobs: {
    retention: StatusJob;
    slaMonitoring: StatusJob;
  };
}
