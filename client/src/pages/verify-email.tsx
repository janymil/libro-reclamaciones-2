import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { apiRequest, apiErrorMessage, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { BrandMark } from "@/components/landing/brand";
import BackToTop from "@/components/layout/back-to-top";
import { ArrowLeft, CheckCircle2, Loader2, MailCheck, ShieldAlert } from "lucide-react";

/**
 * Confirmation page the "confirma tu correo" email links to
 * (`/acceso/verificar-email?token=…`).
 *
 * The token is exchanged automatically on load: the user followed a link, so
 * asking for another click would be busywork. A second visit reports "ya estaba
 * confirmado" instead of failing, because the token was consumed on the first.
 */
export default function VerifyEmailPage() {
  const [search] = useState(() => new URLSearchParams(window.location.search));
  const token = search.get("token") ?? "";

  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState("Confirmando tu correo…");
  const [isResending, setIsResending] = useState(false);

  // A verification token is 32 random bytes as hex => 64 chars. Anything
  // shorter cannot be one of ours, so fail before a pointless request.
  const missingToken = token.length < 16;

  useEffect(() => {
    if (missingToken) {
      setStatus("error");
      setMessage(
        "Este enlace no incluye un código de confirmación. Ábrelo desde el correo que te enviamos.",
      );
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await apiRequest("POST", "/api/auth/verify-email", { token });
        const data = await response.json();
        if (cancelled) return;

        setMessage(data?.message ?? "Correo confirmado.");
        setStatus("success");
        // The identity query carries isEmailVerified, so the panel banner must
        // see the new value instead of the cached one.
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setMessage(apiErrorMessage(error));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, missingToken]);

  const resend = async () => {
    setIsResending(true);
    try {
      const response = await apiRequest("POST", "/api/auth/resend-verification");
      const data = await response.json();
      toast({ title: "Enlace enviado", description: data.message });
    } catch (error) {
      toast({
        title: "No se pudo enviar",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="landing-root landing-paper relative min-h-screen overflow-hidden">
      <div aria-hidden="true" className="landing-grid-bg absolute inset-0" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link
          href="/"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c02b0a] focus-visible:ring-offset-2"
        >
          <BrandMark />
        </Link>
        <Link
          href="/acceso"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5c5246] transition-colors hover:text-[#c02b0a]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Ir al acceso
        </Link>
      </header>

      <main id="main-content" className="relative z-10 mx-auto max-w-md px-5 pb-16 pt-4 sm:px-8">
        <div className="rounded-[4px] border border-[#e3d9c6] bg-[#fdfaf3] p-7 shadow-[0_30px_70px_-30px_rgba(27,22,17,0.45)] sm:p-9">
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[#c02b0a]">
            Confirmación de correo
          </p>

          {status === "verifying" && (
            <div className="mt-6 flex items-center gap-3 text-[#5c5246]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              <p className="text-sm leading-relaxed">{message}</p>
            </div>
          )}

          {status === "success" && (
            <>
              <div className="mt-4 flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[#1e6b4a]" aria-hidden="true" />
                <div>
                  <h1 className="font-display text-2xl font-semibold tracking-tight text-[#1b1611]">
                    Correo confirmado
                  </h1>
                  <p className="mt-2 text-sm leading-relaxed text-[#5c5246]">{message}</p>
                </div>
              </div>
              <Button
                onClick={() => { window.location.assign(isAuthenticated ? "/panel" : "/acceso"); }}
                className="mt-6 h-12 w-full rounded-full bg-[#1b1611] text-base font-semibold text-[#f7f2e8] hover:bg-black"
                data-testid="button-after-verify"
              >
                {isAuthenticated ? "Ir a mi panel" : "Iniciar sesión"}
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <div
                role="alert"
                data-testid="verify-error"
                className="mt-4 flex items-start gap-3 rounded-xl border border-[#c02b0a]/25 bg-[#c02b0a]/5 px-4 py-3"
              >
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#c02b0a]" aria-hidden="true" />
                <p className="text-sm leading-relaxed text-[#1b1611]">{message}</p>
              </div>

              {isAuthenticated ? (
                <Button
                  onClick={resend}
                  disabled={isResending}
                  variant="outline"
                  className="mt-5 h-12 w-full rounded-full border-[#1b1611]/25 bg-transparent font-semibold text-[#1b1611] hover:bg-[#1b1611] hover:text-[#f7f2e8]"
                  data-testid="button-resend-verification"
                >
                  {isResending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando…
                    </>
                  ) : (
                    <>
                      <MailCheck className="mr-2 h-4 w-4" />
                      Enviarme un enlace nuevo
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={() => window.location.assign("/acceso")}
                  className="mt-5 h-12 w-full rounded-full bg-[#1b1611] text-base font-semibold text-[#f7f2e8] hover:bg-black"
                  data-testid="button-go-login"
                >
                  Iniciar sesión y pedir otro enlace
                </Button>
              )}
            </>
          )}
        </div>
      </main>
      <BackToTop />
    </div>
  );
}
