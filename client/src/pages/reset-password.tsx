import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/queryClient";
import { BrandMark } from "@/components/landing/brand";
import { ArrowLeft, CheckCircle2, Loader2, LockKeyhole, ShieldAlert } from "lucide-react";

const inputCls =
  "border-[#1b1611]/15 bg-white/80 text-[#1b1611] placeholder:text-[#5c5246]/55 focus-visible:ring-[#c02b0a]";

// Mirrors MIN_PASSWORD_LENGTH in @shared/schema. The server re-validates
// authoritatively; this copy only gives faster feedback.
const MIN_PASSWORD_LENGTH = 8;

/**
 * Password recovery, step 2: the page the reset email links to
 * (`/acceso/restablecer-password?token=…`).
 *
 * The token is taken from the query string and exchanged for a new password via
 * `POST /api/auth/reset-password`. It is single-use — once the request succeeds
 * the server has already cleared it — so the page offers no "submit again" path.
 */
export default function ResetPasswordPage() {
  const [search] = useState(() => new URLSearchParams(window.location.search));
  const token = search.get("token") ?? "";

  const [, setLocation] = useLocation();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // A reset token is 32 random bytes as hex => 64 chars. Anything shorter cannot
  // be one of ours, so fail before making a pointless request.
  const missingToken = token.length < 16;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    setIsSubmitting(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        message.includes("expirado") || message.includes("válido")
          ? "El enlace de restablecimiento no es válido o ha expirado. Solicita uno nuevo."
          : "No se pudo restablecer la contraseña. Intenta nuevamente.",
      );
    } finally {
      setIsSubmitting(false);
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
          Volver al acceso
        </Link>
      </header>
      <main
        id="main-content"
        className="relative z-10 mx-auto flex max-w-6xl justify-center px-5 pb-16 pt-4 sm:px-8"
      >
        <div className="w-full max-w-md rounded-[4px] border border-[#e3d9c6] bg-[#fdfaf3] p-7 shadow-[0_30px_70px_-30px_rgba(27,22,17,0.45)] sm:p-9">
          <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[#c02b0a]">Acceso</p>
          <h1 className="mt-3 text-balance font-display text-3xl font-semibold tracking-tight text-[#1b1611]">
            Nueva contraseña
          </h1>

          {missingToken && (
            <div
              data-testid="reset-invalid-token"
              className="mt-6 rounded-xl border border-[#c02b0a]/25 bg-[#c02b0a]/5 px-4 py-3 text-sm leading-relaxed text-[#1b1611]"
            >
              Falta el token de restablecimiento. Abre el enlace que te enviamos por correo o{" "}
              <Link href="/acceso" className="font-semibold underline">
                solicita uno nuevo
              </Link>
              .
            </div>
          )}

          {done && (
            <div data-testid="reset-success" className="mt-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1e6b4a]/10">
                <CheckCircle2 className="h-8 w-8 text-[#1e6b4a]" aria-hidden="true" />
              </div>
              <p className="mt-5 text-center text-sm leading-relaxed text-[#5c5246]">
                Tu contraseña fue actualizada. Ya puedes iniciar sesión con ella.
              </p>
              <Button
                onClick={() => setLocation("/acceso")}
                className="mt-6 h-12 w-full rounded-full bg-[#1b1611] text-base font-semibold text-[#f7f2e8] hover:bg-black"
                data-testid="button-go-login"
              >
                Ir a iniciar sesión
              </Button>
            </div>
          )}

          {!done && !missingToken && (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <p className="text-sm leading-relaxed text-[#5c5246]">
                Elige una contraseña nueva de al menos {MIN_PASSWORD_LENGTH} caracteres.
              </p>

              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-sm font-medium text-[#1b1611]">
                  Nueva contraseña
                </Label>
                <Input
                  id="newPassword"
                  data-testid="input-newPassword"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  placeholder="Tu nueva contraseña…"
                  className={inputCls}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-[#1b1611]">
                  Confirmar contraseña
                </Label>
                <Input
                  id="confirmPassword"
                  data-testid="input-confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  placeholder="Repite la contraseña…"
                  className={inputCls}
                />
              </div>

              {error && (
                <div
                  role="alert"
                  data-testid="reset-error"
                  className="flex items-start gap-2 rounded-xl border border-[#c02b0a]/25 bg-[#c02b0a]/5 px-4 py-3 text-sm leading-relaxed text-[#1b1611]"
                >
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#c02b0a]" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                type="submit"
                className="h-12 w-full rounded-full bg-[#1b1611] text-base font-semibold text-[#f7f2e8] hover:bg-black"
                disabled={isSubmitting}
                data-testid="button-reset-password"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Guardando…
                  </>
                ) : (
                  <>
                    <LockKeyhole className="mr-2 h-4 w-4" />
                    Guardar contraseña
                  </>
                )}
              </Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
