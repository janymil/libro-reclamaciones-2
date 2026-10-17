import { useState } from "react";
import { Link } from "wouter";

import CheckoutDialog from "@/components/payments/checkout-dialog";
import BackToTop from "@/components/layout/back-to-top";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { usePlans } from "@/hooks/use-subscription";
import { buildSubscribePath, parseSubscribeQuery } from "@/lib/subscribe-link";
import { PAYMENT_CURRENCY_SYMBOL } from "@shared/payments";

/**
 * `/suscribir?plan=...&periodo=...` - the shareable subscription link.
 *
 * Public on purpose: this is what gets pasted into WhatsApp, an e-mail or an ad.
 * The visitor is identified FIRST (this page asks them to log in or sign up, and
 * brings them straight back here), and only then is the subscription created, bound
 * to their company. That ordering is the whole point: it is what lets activation be
 * automatic instead of a guess about who paid.
 */
export default function SubscribePage() {
  const [search] = useState(() => new URLSearchParams(window.location.search));
  const target = parseSubscribeQuery(search);

  const { user, isAuthenticated } = useAuth();
  // Public endpoint: reachable without a session, so an anonymous visitor can see
  // the price before deciding.
  const { data: plans, isLoading } = usePlans();

  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const plan = target ? (plans ?? []).find((candidate) => candidate.id === target.plan) ?? null : null;
  // Where to come back to after logging in or signing up.
  const returnTo = target ? buildSubscribePath(target.plan, target.period) : "/";

  const price = plan && target ? (target.period === "annual" ? plan.priceAnnual : plan.priceMonthly) : 0;

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <Link href="/">
          <span className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            <span className="material-icons text-lg">arrow_back</span>
            Volver al inicio
          </span>
        </Link>

        {!target && (
          <Card>
            <CardHeader>
              <CardTitle>Este enlace no es válido</CardTitle>
              <CardDescription>
                El enlace no indica un plan conocido. Puede ver todos los planes disponibles y
                contratar el que necesite.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/plan">
                <Button>Ver los planes</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {target && isLoading && <p className="text-sm text-gray-500">Cargando el plan...</p>}

        {target && !isLoading && !plan && (
          <Card>
            <CardHeader>
              <CardTitle>Plan no disponible</CardTitle>
              <CardDescription>
                El plan «{target.plan}» ya no está disponible. Vea los planes actuales.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/plan">
                <Button>Ver los planes</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {target && plan && (
          <Card className="border-primary ring-2 ring-primary/20">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.tagline}</CardDescription>
                </div>
                <Badge className="btn-primary">Plan elegido</Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              <div>
                <p className="text-3xl font-bold">
                  {PAYMENT_CURRENCY_SYMBOL} {price}
                  <span className="text-sm font-normal text-gray-500">
                    {" "}
                    /{target.period === "annual" ? "año" : "mes"}
                  </span>
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  {target.period === "annual"
                    ? "Se cobra una vez al año y se renueva automáticamente. Puede cancelar cuando quiera."
                    : "Se cobra cada mes y se renueva automáticamente. Puede cancelar cuando quiera."}
                </p>
              </div>

              <ul className="space-y-2">
                {plan.highlights.map((highlight) => (
                  <li key={highlight} className="flex items-start text-sm text-gray-700">
                    <span className="material-icons mr-2 text-lg text-green-600">check_circle</span>
                    {highlight}
                  </li>
                ))}
              </ul>

              {isAuthenticated && user ? (
                <div className="space-y-2">
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => setCheckoutOpen(true)}
                    data-testid="button-subscribe-now"
                  >
                    Suscribirme ahora
                  </Button>
                  <p className="text-center text-xs text-gray-500">
                    El plan se activa cuando el pago queda confirmado.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-900">
                    Necesitamos saber a qué empresa asignar la suscripción
                  </p>
                  <p className="text-sm text-amber-900">
                    Inicie sesión o cree su cuenta en un minuto y volverá aquí automáticamente para
                    completar el pago. Así el plan queda activado en su empresa, sin pasos manuales.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/acceso?next=${encodeURIComponent(returnTo)}`}>
                      <Button data-testid="link-login-to-subscribe">Iniciar sesión</Button>
                    </Link>
                    <Link href={`/registro?next=${encodeURIComponent(returnTo)}`}>
                      <Button variant="outline" data-testid="link-register-to-subscribe">
                        Crear cuenta
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              <p className="text-center text-xs text-gray-500">
                ¿Prefiere comparar primero?{" "}
                <Link href="/plan">
                  <span className="cursor-pointer underline">Ver todos los planes</span>
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Rendered only for a logged-in customer: the dialog asks for the payment
          methods, which is an authenticated endpoint. */}
      {isAuthenticated && plan && target && (
        <CheckoutDialog
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          plan={plan}
          period={target.period}
        />
      )}
      <BackToTop />
    </div>
  );
}
