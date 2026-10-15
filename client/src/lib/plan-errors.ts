/**
 * Plan and quota rejections coming from the API.
 *
 * The API answers 402 in three situations that all mean the same thing to the
 * customer - "this is your plan, not a bug":
 *   * `plan_upgrade_required`      - the feature is not in their plan;
 *   * `quota_exceeded`             - a plan limit (users, locales, RUCs, complaints) is reached;
 *   * `complaint_type_not_allowed` - the free plan only accepts Reclamos.
 *
 * So the UI must show the server's own explanation and a way to upgrade,
 * instead of a generic "intente nuevamente" that hides the real reason.
 */

export interface PlanErrorInfo {
  status: number | null;
  code: string | null;
  message: string;
}

export const UPGRADE_PATH = '/plan';

/** Every code the API uses when the plan (not the request) is the problem. */
export const PLAN_ERROR_CODES = [
  'plan_upgrade_required',
  'quota_exceeded',
  'complaint_type_not_allowed',
] as const;

/**
 * Reads the `"402: {"message":"…","code":"…"}"` string that `apiRequest`
 * throws (see lib/queryClient.ts) and returns its parts.
 *
 * A 402 from a proxy or a load balancer may carry a non-JSON body; the status
 * alone is still enough to know this was a plan rejection, and the caller then
 * uses its own sentence instead of leaking HTML into a toast.
 */
export function parsePlanError(error: unknown): PlanErrorInfo {
  const raw =
    error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const match = raw.match(/^(\d{3}):\s*([\s\S]*)$/);

  if (!match) {
    return { status: null, code: null, message: raw };
  }

  const status = Number(match[1]);

  try {
    const body = JSON.parse(match[2]) as { message?: unknown; code?: unknown };
    return {
      status,
      code: typeof body.code === 'string' ? body.code : null,
      message: typeof body.message === 'string' ? body.message : '',
    };
  } catch {
    return { status, code: null, message: '' };
  }
}

/** True when the request was rejected because of the plan or one of its limits. */
export function isPlanError(error: unknown): boolean {
  const { status, code } = parsePlanError(error);
  if (status === 402) {
    return true;
  }
  return code !== null && (PLAN_ERROR_CODES as readonly string[]).includes(code);
}

/** The sentence to show the customer (never an empty toast). */
export function planErrorMessage(error: unknown): string {
  const { message } = parsePlanError(error);
  return message || 'Su plan actual no incluye esta función. Revise los planes disponibles.';
}
