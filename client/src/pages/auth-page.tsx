import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Loader2, Mail, UserPlus, LogIn, ShieldCheck, Timer, LockKeyhole, ArrowLeft } from "lucide-react";
import { BrandMark, StampMark, HojaDocument } from "@/components/landing/brand";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { requestSolvedCaptcha } from "@/lib/pow";
import { safeInternalPath } from "@/lib/subscribe-link";

type AuthMode = 'login' | 'register' | 'email-sent' | 'forgot-password' | 'code';

interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
}

interface LoginData {
  email: string;
  password: string;
}

// Paper-and-ink input styling so the access page reads like the landing.
const inputCls =
  "border-[#1b1611]/15 bg-white/80 text-[#1b1611] placeholder:text-[#5c5246]/55 focus-visible:ring-[#c02b0a]";

const TITLES: Record<AuthMode, { title: string; subtitle: string }> = {
  login: {
    title: "Bienvenido de nuevo",
    subtitle: "Inicia sesión para gestionar tu Libro de Reclamaciones.",
  },
  register: {
    title: "Crea tu cuenta empresarial",
    subtitle: "15 días de prueba gratis. Sin tarjeta de crédito.",
  },
  "email-sent": {
    title: "Revisa tu correo",
    subtitle: "Te enviamos la contraseña de acceso.",
  },
  "forgot-password": {
    title: "Recupera tu acceso",
    subtitle: "Te enviaremos un enlace para crear una contraseña nueva.",
  },
  code: {
    title: "Entra con un código",
    subtitle: "Te enviamos 6 dígitos a tu correo. Sin contraseña.",
  },
};

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: "Cumplimiento legal",
    body: "Diseñado para el DS 011-2011-PCM, el DS 101-2022-PCM y la Ley N.º 29733.",
  },
  {
    icon: Timer,
    title: "15 días hábiles, siempre",
    body: "El plazo se calcula con los feriados del Perú y se vigila solo.",
  },
  {
    icon: LockKeyhole,
    title: "Datos protegidos",
    body: "Cifrado, control por roles y eliminación programada a los 24 meses.",
  },
];

export default function AuthPage() {
  // Check URL parameters to determine initial mode
  const urlParams = new URLSearchParams(window.location.search);
  // Acepta tanto `?modo=` (nuevo) como el antiguo `?mode=`
  const requestedMode = urlParams.get('modo') ?? urlParams.get('mode');
  const initialMode = requestedMode === 'registro' || requestedMode === 'register' ? 'register' : 'login';

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [, setLocation] = useLocation();
  // Where to send the visitor after they log in. Validated: only a same-site path
  // is accepted, so this can never become an open redirect.
  const nextPath = safeInternalPath(urlParams.get('next'));
  const {
    user,
    isAuthenticated,
    loginMutation,
    registerMutation,
    requestLoginCodeMutation,
    loginWithCodeMutation,
  } = useAuth();

  const [registerForm, setRegisterForm] = useState<RegisterData>({ firstName: '', lastName: '', email: '' });
  const [loginForm, setLoginForm] = useState<LoginData>({ email: '', password: '' });

  // Shown inline (not only as a toast) because the most common failure - "ese
  // email ya tiene una cuenta" - needs a way forward, not a disappearing notice.
  const [registerError, setRegisterError] = useState<string | null>(null);
  // Registration solves a CAPTCHA before it can call the API; this covers that
  // short pause so the button does not look frozen (the button's own pending
  // flag only starts once the request is in flight).
  const [registerVerifying, setRegisterVerifying] = useState(false);

  // Code login ("entra con un código por email"). The address is kept after the
  // code is sent so both the resend and the verification use the same one.
  const [codeEmail, setCodeEmail] = useState('');
  const [codeDigits, setCodeDigits] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Password recovery (self-service). `forgotSent` is intentionally sticky: the
  // endpoint answers identically for known and unknown addresses, so there is
  // nothing more to reveal on the follow-up screen.
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Redirect authenticated users
  useEffect(() => {
    if (isAuthenticated && user) {
      if (!user.onboardingCompleted) {
        // A brand new account still has to finish onboarding, so carry the
        // destination through instead of dropping the visitor at /panel.
        setLocation(nextPath ? `/registro?next=${encodeURIComponent(nextPath)}` : '/registro');
        return;
      }
      setLocation(nextPath ?? '/panel');
    }
  }, [isAuthenticated, user, setLocation, nextPath]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    // Registration is CAPTCHA-gated: solve the proof of work first, then send
    // both halves with the payload. Failure here is reported inline next to the
    // form, like every other registration failure.
    setRegisterVerifying(true);

    let solved;
    try {
      solved = await requestSolvedCaptcha();
    } catch (error) {
      setRegisterVerifying(false);
      setRegisterError(apiErrorMessage(error));
      return;
    }

    // `registerVerifying` stays on until the request settles, so the button reads
    // "Verificando…" and then "Creando cuenta…" without a flicker in between.
    registerMutation.mutate(
      { ...registerForm, captchaToken: solved.token, captchaAnswer: solved.solution },
      {
        onSuccess: () => {
          setRegisterVerifying(false);
          setMode('email-sent');
        },
        onError: (error) => {
          setRegisterVerifying(false);
          setRegisterError(apiErrorMessage(error));
        },
      }
    );
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginForm);
  };

  // Step 1 of the code login. Kept separate from the submit handler so the
  // "reenviar código" link can call it without a form event.
  const sendLoginCode = () => {
    setCodeError(null);
    requestLoginCodeMutation.mutate(codeEmail, {
      onSuccess: () => {
        setCodeDigits('');
        setCodeSent(true);
      },
      onError: (error) => setCodeError(apiErrorMessage(error)),
    });
  };

  const handleRequestCode = (e: React.FormEvent) => {
    e.preventDefault();
    sendLoginCode();
  };

  // Step 2: the digits become a session, so the success path (toast + redirect)
  // lives in the mutation.
  const handleSubmitCode = (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    loginWithCodeMutation.mutate(
      { email: codeEmail, code: codeDigits },
      { onError: (error) => setCodeError(apiErrorMessage(error)) },
    );
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSendingReset(true);
    try {
      await apiRequest("POST", "/api/auth/forgot-password", { email: forgotEmail });
    } catch {
      // The endpoint answers 200 even for unknown addresses, so a throw here can
      // only mean transport trouble or rate limiting. Either way the user sees
      // the same neutral notice.
    } finally {
      setIsSendingReset(false);
      setForgotSent(true);
    }
  };

  return (
    <div className="landing-root landing-paper relative min-h-screen overflow-hidden">
      <div aria-hidden="true" className="landing-grid-bg absolute inset-0" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <Link href="/" className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c02b0a] focus-visible:ring-offset-2">
          <BrandMark />
        </Link>
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#5c5246] transition-colors hover:text-[#c02b0a]"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver al inicio
        </a>
      </header>

      <main id="main-content" className="relative z-10 mx-auto grid max-w-6xl items-start gap-12 px-5 pb-16 pt-4 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
        {/* ---- Form ---- */}
        <div className="order-2 lg:order-1">
          <div className="mx-auto w-full max-w-md rounded-[4px] border border-[#e3d9c6] bg-[#fdfaf3] p-7 shadow-[0_30px_70px_-30px_rgba(27,22,17,0.45)] sm:p-9">
            <p className="font-mono text-[11px] uppercase tracking-[0.26em] text-[#c02b0a]">
              {mode === 'register' ? 'Registro' : 'Acceso'}
            </p>
            <h1 className="mt-3 text-balance font-display text-3xl font-semibold tracking-tight text-[#1b1611]">
              {TITLES[mode].title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#5c5246]">{TITLES[mode].subtitle}</p>

            {mode === 'login' && urlParams.get('expired') === '1' && (
              <div
                className="mt-4 rounded-xl border border-[#c02b0a]/25 bg-[#c02b0a]/5 px-4 py-3 text-sm leading-relaxed text-[#1b1611]"
                data-testid="notice-session-expired"
              >
                Tu sesión finalizó o el servidor se reinició. Inicia sesión nuevamente para continuar.
              </div>
            )}

            <div className="mt-8">
              {mode === 'register' && (
                <form onSubmit={handleRegister} className="space-y-4">
                  {registerError && (
                    <div
                      className="rounded-xl border border-[#c02b0a]/25 bg-[#c02b0a]/5 px-4 py-3 text-sm leading-relaxed text-[#1b1611]"
                      data-testid="notice-register-error"
                      role="alert"
                    >
                      <p>{registerError}</p>
                      <button
                        type="button"
                        className="mt-2 font-semibold text-[#c02b0a] underline underline-offset-2"
                        onClick={() => {
                          setLoginForm((prev) => ({ ...prev, email: registerForm.email }));
                          setRegisterError(null);
                          setMode('login');
                        }}
                        data-testid="button-register-error-login"
                      >
                        Iniciar sesión con este email
                      </button>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName" className="text-sm font-medium text-[#1b1611]">Nombre</Label>
                      <Input
                        id="firstName"
                        data-testid="input-firstName"
                        type="text"
                        value={registerForm.firstName}
                        onChange={(e) => setRegisterForm({ ...registerForm, firstName: e.target.value })}
                        required
                        autoComplete="given-name"
                        placeholder="Tu nombre…"
                        className={inputCls}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName" className="text-sm font-medium text-[#1b1611]">Apellido</Label>
                      <Input
                        id="lastName"
                        data-testid="input-lastName"
                        type="text"
                        value={registerForm.lastName}
                        onChange={(e) => setRegisterForm({ ...registerForm, lastName: e.target.value })}
                        required
                        autoComplete="family-name"
                        placeholder="Tu apellido…"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium text-[#1b1611]">Email empresarial</Label>
                    <Input
                      id="email"
                      data-testid="input-email"
                      type="email"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      required
                      autoComplete="email"
                      spellCheck={false}
                      placeholder="empresa@ejemplo.com…"
                      className={inputCls}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="h-12 w-full rounded-full bg-[#c02b0a] text-base font-semibold text-white shadow-[0_10px_24px_-10px_rgba(192,43,10,0.7)] hover:bg-[#9c2107]"
                    disabled={registerMutation.isPending || registerVerifying}
                    data-testid="button-register"
                  >
                    {registerMutation.isPending || registerVerifying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {registerMutation.isPending ? "Creando cuenta…" : "Verificando…"}
                      </>
                    ) : (
                      <>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Crear cuenta empresarial
                      </>
                    )}
                  </Button>

                  <div className="text-center">
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => {
                        setLoginForm((prev) => ({ ...prev, email: registerForm.email }));
                        setMode('login');
                      }}
                      data-testid="link-login"
                      className="text-sm text-[#5c5246] hover:text-[#c02b0a]"
                    >
                      ¿Ya tienes cuenta? Inicia sesión
                    </Button>
                  </div>
                </form>
              )}

              {mode === 'login' && (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="loginEmail" className="text-sm font-medium text-[#1b1611]">Email</Label>
                    <Input
                      id="loginEmail"
                      data-testid="input-loginEmail"
                      type="email"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      required
                      autoComplete="email"
                      spellCheck={false}
                      placeholder="tu@email.com…"
                      className={inputCls}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium text-[#1b1611]">Contraseña</Label>
                    <Input
                      id="password"
                      data-testid="input-password"
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      required
                      autoComplete="current-password"
                      placeholder="Tu contraseña…"
                      className={inputCls}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="h-12 w-full rounded-full bg-[#1b1611] text-base font-semibold text-[#f7f2e8] hover:bg-black"
                    disabled={loginMutation.isPending}
                    data-testid="button-login"
                  >
                    {loginMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Iniciando sesión…
                      </>
                    ) : (
                      <>
                        <LogIn className="mr-2 h-4 w-4" />
                        Iniciar sesión
                      </>
                    )}
                  </Button>

                  <div className="text-center">
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => {
                        setForgotSent(false);
                        setMode('forgot-password');
                      }}
                      data-testid="link-forgot-password"
                      className="text-sm text-[#5c5246] hover:text-[#c02b0a]"
                    >
                      ¿Olvidaste tu contraseña?
                    </Button>
                  </div>

                  <div className="text-center">
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => {
                        // Prefilled with what they already typed: the two options
                        // are two ways into the SAME account.
                        setCodeEmail(loginForm.email);
                        setCodeDigits('');
                        setCodeSent(false);
                        setCodeError(null);
                        setMode('code');
                      }}
                      data-testid="link-login-with-code"
                      className="text-sm text-[#5c5246] hover:text-[#c02b0a]"
                    >
                      Entrar con un código por email
                    </Button>
                  </div>

                  <div className="text-center">
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => setMode('register')}
                      data-testid="link-register"
                      className="text-sm text-[#5c5246] hover:text-[#c02b0a]"
                    >
                      ¿No tienes cuenta? Crear cuenta
                    </Button>
                  </div>
                </form>
              )}

              {mode === 'code' && (
                <div className="space-y-4">
                  {!codeSent ? (
                    <form onSubmit={handleRequestCode} className="space-y-4">
                      <p className="text-sm leading-relaxed text-[#5c5246]">
                        Te enviaremos un código de 6 dígitos a tu correo y entrarás con él, sin
                        contraseña.
                      </p>

                      {codeError && (
                        <div
                          role="alert"
                          data-testid="notice-code-error"
                          className="rounded-xl border border-[#c02b0a]/25 bg-[#c02b0a]/5 px-4 py-3 text-sm leading-relaxed text-[#1b1611]"
                        >
                          {codeError}
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label htmlFor="codeEmail" className="text-sm font-medium text-[#1b1611]">
                          Email
                        </Label>
                        <Input
                          id="codeEmail"
                          type="email"
                          required
                          autoComplete="email"
                          value={codeEmail}
                          onChange={(event) => setCodeEmail(event.target.value)}
                          placeholder="tu@email.com…"
                          className={`h-12 ${inputCls}`}
                          data-testid="input-code-email"
                        />
                      </div>

                      <Button
                        type="submit"
                        disabled={requestLoginCodeMutation.isPending || !codeEmail}
                        className="h-12 w-full rounded-full bg-[#1b1611] text-base font-semibold text-[#f7f2e8] hover:bg-black"
                        data-testid="button-request-code"
                      >
                        {requestLoginCodeMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Enviando…
                          </>
                        ) : (
                          <>
                            <Mail className="mr-2 h-4 w-4" />
                            Enviar código
                          </>
                        )}
                      </Button>
                    </form>
                  ) : (
                    <form onSubmit={handleSubmitCode} className="space-y-4">
                      <p className="text-sm leading-relaxed text-[#5c5246]">
                        Enviamos un código a{' '}
                        <span className="font-semibold text-[#1b1611]">{codeEmail}</span>. Escríbelo
                        aquí para entrar.
                      </p>

                      {codeError && (
                        <div
                          role="alert"
                          data-testid="notice-code-error"
                          className="rounded-xl border border-[#c02b0a]/25 bg-[#c02b0a]/5 px-4 py-3 text-sm leading-relaxed text-[#1b1611]"
                        >
                          {codeError}
                        </div>
                      )}

                      <div className="flex justify-center">
                        <InputOTP
                          maxLength={6}
                          value={codeDigits}
                          onChange={setCodeDigits}
                          data-testid="input-login-code"
                        >
                          <InputOTPGroup>
                            {[0, 1, 2, 3, 4, 5].map((index) => (
                              <InputOTPSlot key={index} index={index} className="h-14 w-11 text-lg" />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </div>

                      <Button
                        type="submit"
                        disabled={codeDigits.length !== 6 || loginWithCodeMutation.isPending}
                        className="h-12 w-full rounded-full bg-[#c02b0a] text-base font-semibold text-white shadow-[0_10px_24px_-10px_rgba(192,43,10,0.7)] hover:bg-[#9c2107]"
                        data-testid="button-login-with-code"
                      >
                        {loginWithCodeMutation.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Entrando…
                          </>
                        ) : (
                          <>
                            <LogIn className="mr-2 h-4 w-4" />
                            Entrar
                          </>
                        )}
                      </Button>

                      <div className="flex flex-col items-center gap-1 text-center">
                        <Button
                          type="button"
                          variant="link"
                          disabled={requestLoginCodeMutation.isPending}
                          onClick={sendLoginCode}
                          data-testid="link-resend-code"
                          className="text-sm text-[#5c5246] hover:text-[#c02b0a]"
                        >
                          Reenviar código
                        </Button>
                        <Button
                          type="button"
                          variant="link"
                          onClick={() => {
                            setCodeDigits('');
                            setCodeError(null);
                            setCodeSent(false);
                          }}
                          data-testid="link-change-code-email"
                          className="text-sm text-[#5c5246] hover:text-[#c02b0a]"
                        >
                          Usar otro correo
                        </Button>
                      </div>
                    </form>
                  )}

                  <div className="text-center">
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => {
                        setCodeError(null);
                        setMode('login');
                      }}
                      data-testid="link-back-to-password"
                      className="text-sm text-[#5c5246] hover:text-[#c02b0a]"
                    >
                      Entrar con contraseña
                    </Button>
                  </div>
                </div>
              )}
              {mode === 'forgot-password' && (
                <div>
                  {forgotSent ? (
                    <div className="text-center">
                      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1e6b4a]/10">
                        <Mail className="h-8 w-8 text-[#1e6b4a]" aria-hidden="true" />
                      </div>
                      <p
                        className="mt-5 text-sm leading-relaxed text-[#5c5246]"
                        data-testid="notice-forgot-sent"
                      >
                        Si el correo está registrado, recibirás un enlace para restablecer tu
                        contraseña. Revisa también la carpeta de spam.
                      </p>
                      <Button
                        onClick={() => setMode('login')}
                        variant="outline"
                        className="mt-6 w-full rounded-full border-[#1b1611]/25 bg-transparent font-semibold text-[#1b1611] hover:bg-[#1b1611] hover:text-[#f7f2e8]"
                        data-testid="button-back-to-login"
                      >
                        <LogIn className="mr-2 h-4 w-4" />
                        Volver a iniciar sesión
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <p className="text-sm leading-relaxed text-[#5c5246]">
                        Escribe tu email y te enviaremos un enlace para crear una contraseña nueva.
                      </p>

                      <div className="space-y-2">
                        <Label htmlFor="forgotEmail" className="text-sm font-medium text-[#1b1611]">
                          Email
                        </Label>
                        <Input
                          id="forgotEmail"
                          data-testid="input-forgotEmail"
                          type="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          required
                          autoComplete="email"
                          spellCheck={false}
                          placeholder="tu@email.com…"
                          className={inputCls}
                        />
                      </div>

                      <Button
                        type="submit"
                        className="h-12 w-full rounded-full bg-[#1b1611] text-base font-semibold text-[#f7f2e8] hover:bg-black"
                        disabled={isSendingReset}
                        data-testid="button-send-reset"
                      >
                        {isSendingReset ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Enviando…
                          </>
                        ) : (
                          <>
                            <Mail className="mr-2 h-4 w-4" />
                            Enviar enlace
                          </>
                        )}
                      </Button>

                      <div className="text-center">
                        <Button
                          type="button"
                          variant="link"
                          onClick={() => setMode('login')}
                          data-testid="link-back-to-login"
                          className="text-sm text-[#5c5246] hover:text-[#c02b0a]"
                        >
                          Volver a iniciar sesión
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {mode === 'email-sent' && (
                <div className="text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1e6b4a]/10">
                    <Mail className="h-8 w-8 text-[#1e6b4a]" aria-hidden="true" />
                  </div>

                  <p className="mt-5 text-sm leading-relaxed text-[#5c5246]">
                    Te hemos enviado tu contraseña de acceso a{' '}
                    <span className="font-semibold text-[#1b1611]">{registerForm.email}</span>
                  </p>

                  <ol className="mt-5 space-y-2 rounded-xl border border-[#e3d9c6] bg-white/70 p-5 text-left text-sm text-[#5c5246]">
                    {[
                      'Revisa tu bandeja de entrada y la carpeta de spam.',
                      'Usa tu email y la contraseña recibida para iniciar sesión.',
                      'Configura los datos de tu empresa.',
                    ].map((step, i) => (
                      <li key={step} className="flex gap-3">
                        <span className="font-mono text-xs font-bold text-[#c02b0a]">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        {step}
                      </li>
                    ))}
                  </ol>

                  <Button
                    onClick={() => setMode('login')}
                    variant="outline"
                    className="mt-6 w-full rounded-full border-[#1b1611]/25 bg-transparent font-semibold text-[#1b1611] hover:bg-[#1b1611] hover:text-[#f7f2e8]"
                    data-testid="button-go-login"
                  >
                    <LogIn className="mr-2 h-4 w-4" />
                    Ir a iniciar sesión
                  </Button>
                </div>
              )}
            </div>
          </div>
          <p className="mx-auto mt-6 max-w-md text-center font-mono text-[11px] leading-relaxed text-[#5c5246]">
            Ley N.º 29571 · DS 011-2011-PCM · DS 101-2022-PCM · Ley N.º 29733
          </p>
        </div>

        {/* ---- Showcase (paper hoja + stamp + trust points) ---- */}
        <div className="order-1 hidden lg:order-2 lg:block">
          <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[#c02b0a]">
            Libro de Reclamaciones Virtual
          </p>
          <h2 className="mt-4 max-w-md text-balance font-display text-4xl font-medium leading-tight tracking-tight text-[#1b1611]">
            El libro de papel, <span className="italic text-[#c02b0a]">reinventado.</span>
          </h2>
          <p className="mt-4 max-w-md text-pretty leading-relaxed text-[#5c5246]">
            QR en caja, constancias automáticas y respuestas redactadas con IA — todo dentro del
            plazo legal.
          </p>

          <div className="relative mx-auto mt-10 w-full max-w-md">
            <HojaDocument className="rotate-[-1.5deg]" />
            <StampMark className="absolute -right-7 -top-9 rotate-12 scale-90" />
            <div className="absolute -bottom-6 -left-3 flex animate-float-soft items-center gap-2 rounded-full border border-[#1e6b4a]/25 bg-[#1e6b4a]/10 px-4 py-2 text-xs font-semibold text-[#1e6b4a]">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Constancia enviada
            </div>
          </div>

          <div className="mt-12 max-w-md space-y-5">
            {TRUST_POINTS.map((point) => (
              <div key={point.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#c02b0a] text-white">
                  <point.icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold text-[#1b1611]">{point.title}</p>
                  <p className="text-sm leading-relaxed text-[#5c5246]">{point.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
