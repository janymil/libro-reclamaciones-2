import { useEffect, useRef, type ReactNode } from "react";
import { AlertTriangle, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export interface FloatingNoticeProps {
  /** Whether the notice is visible. Nothing renders while false. */
  open: boolean;
  title: string;
  children: ReactNode;
  /** Buttons that resolve the situation (resend link, request access…). */
  action?: ReactNode;
  /** Icon shown in the badge; defaults to the tone's warning icon. */
  icon?: LucideIcon;
  tone?: "warning" | "error";
  /**
   * Hides the notice. Omit it for notices that must stay until resolved.
   * The wizard always re-opens the notice when a submit fails again.
   */
  onDismiss?: () => void;
  /**
   * Moves focus to the notice when it opens.
   *
   * Used for the notices that appear *after* the user pressed "Finalizar":
   * they are at the bottom of the form, so the focus ring plus the announcement
   * is what tells them where the answer went.
   */
  focusOnOpen?: boolean;
  testId?: string;
}

/**
 * Aviso accionable que flota sobre el asistente de registro.
 *
 * The wizard is long, and the two things that can block it (an unconfirmed
 * mailbox, a RUC owned by another account) used to be rendered at the top of
 * the page. A customer who pressed "Finalizar" at the bottom saw the button do
 * nothing, because the explanation was several screens above. This notice is
 * fixed to the viewport, so it is visible wherever the user is, and it carries
 * the action that solves the problem instead of a message that only reports it.
 *
 * It is anchored to the TOP on purpose: the form's submit button lives at the
 * bottom, so the notice can never cover the control the user needs to retry.
 */
export default function FloatingNotice({
  open,
  title,
  children,
  action,
  icon,
  tone = "warning",
  onDismiss,
  focusOnOpen = false,
  testId,
}: FloatingNoticeProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !focusOnOpen) return;
    // `preventScroll` keeps the form where the user left it: the notice is
    // already in view because it is fixed to the viewport.
    ref.current?.focus({ preventScroll: true });
  }, [open, focusOnOpen]);

  if (!open) return null;

  const Icon = icon ?? AlertTriangle;
  const isError = tone === "error";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[95] flex justify-center px-3 sm:top-6">
      <div
        ref={ref}
        tabIndex={focusOnOpen ? -1 : undefined}
        role="alert"
        aria-live="assertive"
        data-testid={testId}
        className={cn(
          "pointer-events-auto w-full max-w-lg rounded-xl border p-4 shadow-2xl outline-none",
          "animate-in fade-in slide-in-from-top-4 duration-200 motion-reduce:animate-none",
          isError
            ? "border-red-300 bg-red-50 text-red-950"
            : "border-amber-300 bg-amber-50 text-amber-950",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              isError ? "bg-red-600 text-white" : "bg-amber-500 text-white",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-snug">{title}</p>
            <div className="mt-1 text-sm leading-relaxed">{children}</div>
            {action && <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div>}
          </div>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Cerrar aviso"
              className={cn(
                "-mr-1 -mt-1 shrink-0 rounded-md p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current",
                isError ? "text-red-700 hover:bg-red-100" : "text-amber-800 hover:bg-amber-100",
              )}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
