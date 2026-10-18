import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/use-auth";
import CookieNotice from "@/components/cookie-notice";
import ScrollToTop from "@/components/layout/scroll-to-top";
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
import PrivacyPolicyPage from "@/pages/privacy-policy";
import PrivacidadPage from "@/pages/privacidad";
import TerminosPage from "@/pages/terminos";
import ComprobantesPage from "@/pages/comprobantes";
import AvisoLegalPage from "@/pages/aviso-legal";
import NormativaPage from "@/pages/normativa";
import EncargadoPage from "@/pages/encargado";
import ContactoPage from "@/pages/contacto";
import ResetPasswordPage from "@/pages/reset-password";
import VerifyEmailPage from "@/pages/verify-email";
import Compliance from "@/pages/compliance";
import AssistantPage from "@/pages/assistant";
import SubscriptionPage from "@/pages/subscription";
import PaymentsPage from "@/pages/payments";
import AdminOverviewPage from "@/pages/admin/overview";
import AdminCustomersPage from "@/pages/admin/customers";
import AdminCustomerDetailPage from "@/pages/admin/customer-detail";
import AdminPaymentsPage from "@/pages/admin/payments";
import AdminComprobantesPage from "@/pages/admin/comprobantes";
import AdminSubscriptionsPage from "@/pages/admin/subscriptions";
import AdminSettingsPage from "@/pages/admin/settings";
import AdminPlansPage from "@/pages/admin/planes";
import AdminDiscountsPage from "@/pages/admin/descuentos";
import AdminPlatformPage from "@/pages/admin/platform";
import AdminTeamPage from "@/pages/admin/team";
import { ADMIN_LOGIN_PATH, ADMIN_PATH } from "@/lib/admin-path";
import SubscribePage from "@/pages/subscribe";
import CustomizationPage from "@/pages/customization";
import IntegrationsPage from "@/pages/integrations";
import ApiDocsPage from "@/pages/api-docs";
import HelpPage from "@/pages/help";
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

      {/* Política de privacidad del libro (Ley 29733): el enlace que abre el
          consumidor desde "Acepto el tratamiento de mis datos" cuando la empresa
          no publicó una política propia. Va antes de `/libro/:slug` por claridad,
          y es pública: la lee un consumidor sin cuenta. */}
      <Route path="/libro/:slug/politica-de-privacidad" component={PrivacyPolicyPage} />

      {/* Enlace de suscripción compartible: público, para pegar en WhatsApp,
          correo o publicidad. Identifica al cliente antes de enviarlo a pagar. */}
      <Route path="/suscribir" component={SubscribePage} />

      {/* Paso 2 de la recuperación de contraseña: el enlace del correo apunta aquí.
          Va antes de `/acceso` para que la ruta exacta gane siempre. */}
      <Route path="/acceso/restablecer-password" component={ResetPasswordPage} />
      <Route path="/acceso/verificar-email" component={VerifyEmailPage} />
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
      <Route path="/pagos" component={PaymentsPage} />
        {/* Consola del equipo: un área propia, fuera del panel del cliente, bajo
            una ruta configurable que nunca es `/admin`
            (ver client/src/lib/admin-path.ts). */}
        {/* Un solo inicio de sesión para todos: `/acceso`. Cualquier enlace
            antiguo a la puerta propia de la consola vuelve allí. */}
        <Route path={ADMIN_LOGIN_PATH}>
          <Redirect to="/acceso" />
        </Route>
        <Route path={ADMIN_PATH} component={AdminOverviewPage} />
        <Route path={`${ADMIN_PATH}/clientes`} component={AdminCustomersPage} />
        <Route path={`${ADMIN_PATH}/clientes/:businessId`} component={AdminCustomerDetailPage} />
        <Route path={`${ADMIN_PATH}/pagos`} component={AdminPaymentsPage} />
        <Route path={`${ADMIN_PATH}/comprobantes`} component={AdminComprobantesPage} />
        <Route path={`${ADMIN_PATH}/suscripciones`} component={AdminSubscriptionsPage} />
        <Route path={`${ADMIN_PATH}/configuracion`} component={AdminSettingsPage} />
        <Route path={`${ADMIN_PATH}/planes`} component={AdminPlansPage} />
        <Route path={`${ADMIN_PATH}/descuentos`} component={AdminDiscountsPage} />
        <Route path={`${ADMIN_PATH}/plataforma`} component={AdminPlatformPage} />
        <Route path={`${ADMIN_PATH}/equipo`} component={AdminTeamPage} />
      <Route path="/subscribe"><Redirect to="/suscribir" /></Route>
      <Route path="/personalizacion" component={CustomizationPage} />
      <Route path="/integraciones" component={IntegrationsPage} />
      <Route path="/integraciones/api" component={ApiDocsPage} />
      <Route path="/ayuda" component={HelpPage} />
      <Route path="/help"><Redirect to="/ayuda" /></Route>
      <Route path="/integrations/api"><Redirect to="/integraciones/api" /></Route>

      {/* Páginas públicas de transparencia (Phase 3.13) */}
      <Route path="/estado" component={StatusPage} />
      <Route path="/accesibilidad" component={AccessibilityPage} />

      {/* Documentos legales del operador (públicos, sin sesión). No confundir
          `/privacidad` con `/libro/:slug/politica-de-privacidad`: la primera es
          la política de LibroDigital.pe como prestador del servicio; la segunda
          es la del banco de datos de cada empresa cliente. */}
      <Route path="/terminos" component={TerminosPage} />
      <Route path="/comprobantes" component={ComprobantesPage} />
      <Route path="/privacidad" component={PrivacidadPage} />
      <Route path="/aviso-legal" component={AvisoLegalPage} />

      {/* Marco normativo: las normas del Libro de Reclamaciones con su enlace
          oficial, para que el pie no tenga que cargar ocho entradas. */}
      <Route path="/normativa" component={NormativaPage} />
      {/* Ficha del encargado: lo que la empresa necesita para declarar a
          LibroDigital en el SIPDP (rol, alojamiento y flujo transfronterizo). */}
      <Route path="/encargado" component={EncargadoPage} />

      {/* Nosotros y contacto: página pública con el formulario de contacto. */}
      <Route path="/contacto" component={ContactoPage} />
      <Route path="/nosotros"><Redirect to="/contacto" /></Route>

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
      <Route path="/payments"><Redirect to="/pagos" /></Route>
      <Route path="/integrations"><Redirect to="/integraciones" /></Route>
      <Route path="/status"><Redirect to="/estado" /></Route>
      <Route path="/accessibility"><Redirect to="/accesibilidad" /></Route>
      <Route path="/terms"><Redirect to="/terminos" /></Route>
      <Route path="/privacy"><Redirect to="/privacidad" /></Route>
      <Route path="/legal"><Redirect to="/aviso-legal" /></Route>

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
          {/* Cada cambio de ruta empieza en la parte superior (ver el componente). */}
          <ScrollToTop />
          <Router />
          <CookieNotice />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
