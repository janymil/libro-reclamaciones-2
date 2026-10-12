import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import CookieNotice from "@/components/cookie-notice";
import Landing from "@/pages/landing";
import Dashboard from "@/pages/dashboard";
import Complaints from "@/pages/complaints";
import Reports from "@/pages/reports";
import Businesses from "@/pages/businesses";
import Establishments from "@/pages/establishments";
import Books from "@/pages/books";
import UsersPage from "@/pages/users";
import Profile from "@/pages/profile";
import History from "@/pages/history";
import QrCodePage from "@/pages/qr-code";
import PublicPortal from "@/pages/public-portal";
import Compliance from "@/pages/compliance";
import AssistantPage from "@/pages/assistant";
import SubscriptionPage from "@/pages/subscription";
import CustomizationPage from "@/pages/customization";
import IntegrationsPage from "@/pages/integrations";
import StatusPage from "@/pages/status";
import AccessibilityPage from "@/pages/accessibility";
import AuthPage from "@/pages/auth-page";
import OnboardingPage from "@/pages/onboarding-page";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />

      {/* Libro de Reclamaciones público: los consumidores registran y consultan
          sus reclamos sin necesidad de iniciar sesión. */}
      <Route path="/libro/:slug" component={PublicPortal} />

      <Route path="/acceso" component={AuthPage} />
      <Route path="/registro" component={OnboardingPage} />
      <Route path="/panel" component={Dashboard} />
      <Route path="/reclamos" component={Complaints} />
      <Route path="/reportes" component={Reports} />
      <Route path="/empresas" component={Businesses} />
      <Route path="/sucursales" component={Establishments} />
      <Route path="/libros" component={Books} />
      <Route path="/usuarios" component={UsersPage} />
      <Route path="/perfil" component={Profile} />
      <Route path="/historial" component={History} />
      <Route path="/codigo-qr" component={QrCodePage} />
      <Route path="/cumplimiento" component={Compliance} />
      <Route path="/asistente" component={AssistantPage} />
      <Route path="/plan" component={SubscriptionPage} />
      <Route path="/personalizacion" component={CustomizationPage} />
      <Route path="/integraciones" component={IntegrationsPage} />

      {/* Páginas públicas de transparencia (Phase 3.13) */}
      <Route path="/estado" component={StatusPage} />
      <Route path="/accesibilidad" component={AccessibilityPage} />

      {/* Rutas antiguas en inglés: se mantienen como redirecciones para no
          romper enlaces guardados ni correos enviados previamente. */}
      <Route path="/auth"><Redirect to="/acceso" /></Route>
      <Route path="/onboarding"><Redirect to="/registro" /></Route>
      <Route path="/dashboard"><Redirect to="/panel" /></Route>
      <Route path="/complaints"><Redirect to="/reclamos" /></Route>
      <Route path="/reports"><Redirect to="/reportes" /></Route>
      <Route path="/businesses"><Redirect to="/empresas" /></Route>
      <Route path="/establishments"><Redirect to="/sucursales" /></Route>
      <Route path="/books"><Redirect to="/libros" /></Route>
      <Route path="/users"><Redirect to="/usuarios" /></Route>
      <Route path="/profile"><Redirect to="/perfil" /></Route>
      <Route path="/history"><Redirect to="/historial" /></Route>
      <Route path="/qr"><Redirect to="/codigo-qr" /></Route>
      <Route path="/compliance"><Redirect to="/cumplimiento" /></Route>
      <Route path="/assistant"><Redirect to="/asistente" /></Route>
      <Route path="/subscription"><Redirect to="/plan" /></Route>
      <Route path="/integrations"><Redirect to="/integraciones" /></Route>
      <Route path="/status"><Redirect to="/estado" /></Route>
      <Route path="/accessibility"><Redirect to="/accesibilidad" /></Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          {/* Skip link: first focusable element on every page (WCAG 2.4.1) */}
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:px-4 focus:py-2 focus:rounded focus:shadow"
          >
            Saltar al contenido principal
          </a>
          <Toaster />
          <Router />
          <CookieNotice />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
