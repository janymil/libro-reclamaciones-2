import { ReactNode } from "react";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/use-mobile";
import Sidebar from "./sidebar";
import Header from "./header";
import MobileNavigation from "./mobile-navigation";
import ComplianceAgentWidget from "@/components/ai/compliance-agent-widget";
import { Button } from "@/components/ui/button";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export default function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const [, setLocation] = useLocation();

  return (
    <div className="flex min-h-screen bg-[#f7f2e8]">
      {/* Sidebar - Hidden on mobile */}
      {!isMobile && <Sidebar />}
      
      {/* Main Content */}
      <main id="main-content" className="flex-1 min-h-screen">
        <Header title={title} subtitle={subtitle} />
        
        <div className="p-6 pb-20 lg:pb-6">
          {children}
        </div>
      </main>
      
      {/* Mobile Navigation - Only shown on mobile */}
      {isMobile && <MobileNavigation />}
      
      {/* Floating Action Button - registrar una nueva reclamación */}
      <Button
        className="fixed bottom-20 right-6 z-40 h-14 w-14 rounded-full bg-[#c02b0a] text-white shadow-[0_14px_30px_-10px_rgba(192,43,10,0.7)] hover:bg-[#9c2107] lg:bottom-6"
        onClick={() => setLocation("/reclamos?nuevo=1")}
        title="Registrar nueva reclamación"
        data-testid="fab-add-complaint"
      >
        <span className="material-icons">add</span>
      </Button>

      {/* Copiloto de Cumplimiento: ventana de chat flotante en todas las páginas */}
      <ComplianceAgentWidget />
    </div>
  );
}
