import { ReactNode } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import Sidebar from "./sidebar";
import Header from "./header";
import MobileNavigation from "./mobile-navigation";
import { Button } from "@/components/ui/button";

interface AppLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export default function AppLayout({ children, title, subtitle }: AppLayoutProps) {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen flex bg-surface">
      {/* Sidebar - Hidden on mobile */}
      {!isMobile && <Sidebar />}
      
      {/* Main Content */}
      <main className="flex-1 min-h-screen">
        <Header title={title} subtitle={subtitle} />
        
        <div className="p-6 pb-20 lg:pb-6">
          {children}
        </div>
      </main>
      
      {/* Mobile Navigation - Only shown on mobile */}
      {isMobile && <MobileNavigation />}
      
      {/* Floating Action Button */}
      <Button
        className="fixed bottom-20 lg:bottom-6 right-6 w-14 h-14 btn-primary rounded-full shadow-lg z-40"
        data-testid="fab-add-complaint"
      >
        <span className="material-icons">add</span>
      </Button>
    </div>
  );
}
