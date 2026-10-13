import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import Sidebar from "./sidebar";
import Header from "./header";
import MobileNavigation from "./mobile-navigation";
import ComplianceAgentWidget from "@/components/ai/compliance-agent-widget";

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
      <main id="main-content" className="flex-1 min-h-screen">
        <Header title={title} subtitle={subtitle} />
        
        <div className="p-6 pb-20 lg:pb-6">
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
