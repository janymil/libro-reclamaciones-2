import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { apiErrorMessage, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { Business, Establishment, LibroConfiguration } from "@shared/schema";
import type { BookSummary } from "@/lib/api-types";
import {
  buildGettingStarted,
  dismissGettingStarted,
  isGettingStartedDismissed,
  type GettingStartedStep,
} from "@/lib/getting-started";

/**
 * "Primeros pasos": what a new tenant needs to know AFTER registering.
 *
 * Registration already leaves the account complete (empresa + first local + its
 * Libro + public link), so this is not a setup wizard - it answers the questions
 * that only appear later, using real data:
 *
 *   * is the book really published? (the public slug)
 *   * will the notices arrive? (the mailbox is confirmed)
 *   * "do I have to add my other sucursales?" (compared against what the customer
 *     declared during onboarding)
 *   * "does each local have its own register?" (books vs establishments, which is
 *     also how a tenant whose sucursal predates the automatic register finds out)
 *
 * It hides itself once there is nothing pending, and the customer can close it.
 */
export default function GettingStarted() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: business } = useQuery<Business | null>({ queryKey: ["/api/businesses/current"] });
  const { data: libroConfig } = useQuery<LibroConfiguration | null>({
    queryKey: ["/api/libro-configuration"],
  });
  const { data: establishments } = useQuery<Establishment[]>({ queryKey: ["/api/establishments"] });
  const { data: books } = useQuery<BookSummary[]>({ queryKey: ["/api/books"] });
  // Only for the RNPD row below. Left optional: if this call fails the checklist
  // simply omits that row instead of hiding the ones that matter for the book.
  const { data: compliance, isError: complianceFailed } = useQuery<{
    rnpd?: { registered: boolean };
  }>({
    queryKey: ["/api/compliance/report"],
  });

  // Read once: the customer can close the checklist for good (per browser).
  const [dismissed, setDismissed] = useState(() => isGettingStartedDismissed());

  const resendVerification = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/resend-verification");
      return response.json() as Promise<{ message: string }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Enlace enviado", description: data.message });
    },
    onError: (error) => {
      toast({
        title: "No se pudo enviar",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  // Nothing to guide while the tenant is still being created, or if the customer
  // closed the list. Waiting for the four answers avoids a flicker of half-built
  // steps (and a wrong "falta el Libro" while /api/books is still in flight).
  //
  // The shared demo account is skipped on purpose: its tenant is hand-seeded, its
  // mailbox cannot be confirmed by anybody, and it exists to show the product -
  // not to be told its sucursales are missing a book.
  if (user?.isDemo) return null;
  if (!user?.businessId || !user.onboardingCompleted || dismissed) return null;
  if (!business || libroConfig === undefined || !establishments || !books) return null;
  // Wait for the compliance answer too: without it the RNPD row is unknown, and
  // a tenant whose only pending step is that one would see the whole checklist
  // disappear and come back a moment later. If the call failed we render anyway
  // (the row is simply omitted) instead of hiding the checklist forever.
  if (compliance === undefined && !complianceFailed) return null;

  const { steps, pending, allDone } = buildGettingStarted({
    businessName: business.businessName,
    libroSlug: libroConfig?.urlSlug ?? null,
    isEmailVerified: Boolean(user.isEmailVerified),
    // Only the ACTIVE locals count: /api/establishments also returns the closed
    // ones (so they can be reactivated), and a local that no longer serves the
    // public must not keep the "agrega tus otros locales" step open.
    establishments: establishments.filter((establishment) => establishment.isActive).length,
    books: books.length,
    // Declared during onboarding and editable from /sucursales; NULL means the
    // customer never declared a total (the checklist then omits the target).
    expectedLocales: business.expectedEstablishments ?? null,
    // `undefined` while the compliance report has not answered: no RNPD row.
    rnpdRegistered: compliance ? Boolean(compliance.rnpd?.registered) : undefined,
  });

  if (allDone) return null;

  const progress = Math.round(((steps.length - pending) / steps.length) * 100);

  const hide = () => {
    dismissGettingStarted();
    setDismissed(true);
  };

  const renderAction = (step: GettingStartedStep) => {
    if (step.action === "resend-verification") {
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={resendVerification.isPending}
          onClick={() => resendVerification.mutate()}
          data-testid="getting-started-resend"
        >
          {resendVerification.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {step.actionLabel}
        </Button>
      );
    }

    if (!step.href) return null;

    return (
      <Link href={step.href}>
        <Button
          size="sm"
          variant={step.done ? "ghost" : "default"}
          data-testid={`getting-started-${step.id}`}
        >
          {step.actionLabel}
        </Button>
      </Link>
    );
  };

  return (
    <Card data-testid="getting-started">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Primeros pasos</CardTitle>
            <CardDescription>
              Ya tienes tu Libro de Reclamaciones en línea. Te quedan {pending}{" "}
              {pending === 1 ? "paso" : "pasos"} para dejarlo todo listo.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={hide}
            aria-label="Ocultar primeros pasos"
            data-testid="getting-started-hide"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <Progress value={progress} className="mt-3 h-2" aria-label={`${progress}% completado`} />
      </CardHeader>

      <CardContent>
        <ul className="space-y-4">
          {steps.map((step) => (
            <li key={step.id} className="flex items-start gap-3" data-testid={`step-${step.id}`}>
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className={
                    step.done
                      ? "text-sm font-medium text-gray-500"
                      : "text-sm font-medium text-gray-900"
                  }
                >
                  {step.title}
                </p>
                <p className="mt-0.5 text-sm text-gray-600">{step.description}</p>
              </div>
              {!step.done && renderAction(step)}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
