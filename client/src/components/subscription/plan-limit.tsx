import { Link } from "wouter";
import { Lock } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Plan-limit affordances.
 *
 * A disabled button with no explanation is a dead end, and a 402 after the click
 * is worse: the customer filled a form before learning the limit was their plan.
 * These two pieces say it BEFORE the click - on hover, and permanently next to
 * the action - and both point at "Plan y Cuotas".
 */

/**
 * Wraps an action whose button is disabled because of a plan limit.
 *
 * The tooltip needs a focusable span around the button: a `disabled` button emits
 * no pointer events, so it can never be a Radix tooltip trigger itself.
 */
export function PlanLockedAction({
  locked,
  reason,
  children,
}: {
  locked: boolean;
  reason: string;
  children: React.ReactNode;
}) {
  if (!locked) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex cursor-not-allowed rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c02b0a] focus-visible:ring-offset-2"
          data-testid="plan-locked-action"
        >
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
        <p className="flex items-start gap-2">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{reason}</span>
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Permanent line under a page title: "Usuarios 2 / 2 · plan Básico".
 *
 * When the limit is reached it becomes a call to action, because that is the
 * moment the customer wants more - not after a rejected form.
 */
export function PlanUsageHint({
  label,
  used,
  limit,
  planName,
}: {
  label: string;
  used: number;
  limit: number | null;
  planName: string | null;
}) {
  const unlimited = limit === null;
  const reached = !unlimited && used >= limit;

  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600" data-testid="plan-usage-hint">
      <span>
        {label}: <strong className="font-medium">{used}</strong>
        {unlimited ? ' (ilimitado)' : ` / ${limit}`}
      </span>
      {planName && <span className="text-gray-400">·</span>}
      {planName && <span>plan {planName}</span>}
      {reached && (
        <Link
          href="/plan"
          className="font-medium text-[#c02b0a] underline underline-offset-2 hover:text-[#9c2107]"
          data-testid="link-upgrade-from-limit"
        >
          Mejorar plan
        </Link>
      )}
    </p>
  );
}

/** The sentence shown when an action is blocked by a limit. */
export function planLimitReason(planName: string | null, limit: number, resource: string): string {
  return `Tu plan ${planName ?? 'actual'} permite hasta ${limit} ${resource}. Mejora tu plan para agregar más.`;
}
