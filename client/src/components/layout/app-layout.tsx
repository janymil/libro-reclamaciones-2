import { ReactNode, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiErrorMessage } from "@/lib/queryClient";
import Sidebar from "./sidebar";
import Header from "./header";
import MobileNavigation from "./mobile-navigation";
import ComplianceAgentWidget from "@/components/ai/compliance-agent-widget";
import { MailCheck, Loader2 } from "lucide-react";

/**
 * Nudge to confirm the mailbox, shown while `isEmailVerified` is false.
 *
 * Not decoration: since services/verificationService.ts an unconfirmed mailbox
 * means the Libro cannot be published - no company can be created at onboarding,
 * and the public book refuses consumer complaints - because this is the address
 * that receives every complaint notification. Demo accounts are excluded: their
 * credentials are public, and there is nobody to confirm anything.
 */
function EmailVerificationBanner() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSending, setIsSending] = useState(false);

  if (!user || user.isEmailVerified || user.isDemo) {
    return null;
  }

  const resend = async () => {
    setIsSending(true);
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
      setIsSending(false);
    }
  };

  return (
    <div
      role="status"
      data-testid="banner-email-unverified"
      className="mb-5 flex flex-col gap-3 rounded-lg border border-[#c9a227]/40 bg-[#fdf6e3] px-4 py-3 text-sm text-[#1b1611] sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-2">
        <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#8a6d1f]" aria-hidden="true" />
        <p className="leading-relaxed">
          Confirma <strong>{user.email}</strong> para publicar tu Libro de Reclamaciones y recibir el
          aviso de cada nueva reclamación.
        </p>
      </div>
      <button
        type="button"
        onClick={resend}
        disabled={isSending}
        data-testid="button-resend-verification-banner"
        className="shrink-0 rounded-full border border-[#1b1611]/20 px-3 py-1.5 font-semibold text-[#1b1611] transition-colors hover:bg-[#1b1611] hover:text-[#f7f2e8] disabled:opacity-60"
      >
        {isSending ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Enviando…
          </span>
        ) : (
          "Reenviar enlace"
        )}
      </button>
    </div>
  );
}

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export default function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className="flex min-h-screen bg-[#f7f2e8]">
      {/* Sidebar - Hidden on mobile */}
      {!isMobile && <Sidebar />}
      
      {/* Main Content */}
      <main id="main-content" className="min-w-0 flex-1 min-h-screen">
        <Header title={title} subtitle={subtitle} />
        
        <div className="p-4 pb-20 sm:p-6 lg:pb-6">
          <EmailVerificationBanner />
          {children}
        </div>
      </main>
      
      {/* Mobile Navigation - Only shown on mobile */}
      {isMobile && <MobileNavigation />}
      {/* Copiloto de Cumplimiento: ventana de chat flotante en todas las páginas */}
      <ComplianceAgentWidget />
    </div>
  );
}
