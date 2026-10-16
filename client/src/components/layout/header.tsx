import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useUserBusinesses, type UserBusiness } from "@/hooks/use-subscription";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Business } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  title?: string;
  subtitle?: string;
}

interface NotificationItem {
  id: string;
  isRead: boolean;
}

const INDECOPI_HELP_URL = "https://www.indecopi.gob.pe/libro-de-reclamaciones";

export default function Header({
  title = "Panel de Gestión",
  subtitle,
}: HeaderProps) {
  const [, setLocation] = useLocation();
  const { user, logoutMutation } = useAuth();

  const { data: business } = useQuery<Business>({
    queryKey: ["/api/businesses/current"],
  });

  // Multi-RUC switcher (Phase 2.7): the businesses this login may manage
  const { data: userBusinesses } = useUserBusinesses();

  const { data: notifications } = useQuery<NotificationItem[]>({
    queryKey: ["/api/notifications"],
  });

  const userName = user
    ? `${user.firstName} ${user.lastName}`.trim() || user.email
    : "";
  const businessName = business?.businessName ?? "";
  const notificationCount = (notifications ?? []).filter((n) => !n.isRead).length;

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      setLocation("/acceso");
    }
  };

  const switchableBusinesses: UserBusiness[] = (userBusinesses ?? []).filter(
    (entry) => !entry.isActive,
  );

  const handleSwitchBusiness = async (businessId: string) => {
    try {
      await apiRequest("POST", "/api/auth/switch-business", { businessId });
      // The whole cache belongs to the previous business: drop everything
      queryClient.clear();
      setLocation("/panel");
      window.location.reload();
    } catch {
      // Non fatal: the dropdown simply stays
    }
  };

  return (
    <header className="border-b border-[#e3d9c6] bg-[#fdfaf3]/90 px-6 py-4 backdrop-blur-sm" data-testid="header">
      <div className="flex items-center justify-between">
        <div data-testid="header-info">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-[#1b1611]">{title}</h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#5c5246]">{subtitle || businessName}</p>
        </div>

        <div className="flex items-center space-x-4">
          {/* Multi-RUC switcher (Phase 2.7) */}
          {switchableBusinesses.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="max-w-[220px] border-[#e3d9c6] bg-transparent text-[#1b1611] hover:bg-[#f3eadc]"
                  title="Cambiar de empresa (RUC)"
                  data-testid="business-switcher"
                >
                  <span className="material-icons mr-1 text-sm">business</span>
                  <span className="truncate">{businessName || "Empresa"}</span>
                  <span className="material-icons ml-1 text-sm">expand_more</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Cambiar de empresa</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {switchableBusinesses.map((entry) => (
                  <DropdownMenuItem
                    key={entry.businessId}
                    onClick={() => handleSwitchBusiness(entry.businessId)}
                    data-testid={`switch-business-${entry.ruc}`}
                  >
                    <span className="flex flex-col">
                      <span className="font-medium truncate">{entry.businessName}</span>
                      <span className="text-xs text-gray-500">RUC {entry.ruc}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Notification Bell */}
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={() => setLocation("/panel")}
            title="Notificaciones"
            data-testid="notifications-button"
          >
            <span className="material-icons">notifications</span>
            {notificationCount > 0 && (
              <span
                className="absolute -top-1 -right-1 bg-secondary text-white text-xs w-5 h-5 rounded-full flex items-center justify-center"
                data-testid="notification-count"
              >
                {notificationCount}
              </span>
            )}
          </Button>

          {/* User Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center space-x-3 h-auto p-2"
                data-testid="user-profile-button"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#c02b0a] text-white shadow-[0_6px_14px_-6px_rgba(192,43,10,0.8)]">
                  <span className="text-xs font-semibold tracking-wide">
                    {userName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <div className="hidden text-left md:block">
                  <p className="text-sm font-medium text-[#1b1611]">{userName}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#5c5246]">
                    {user?.role === 'admin' ? 'Administrador' : user?.role === 'viewer' ? 'Visualizador' : 'Usuario'}
                  </p>
                </div>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Mi Cuenta</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setLocation("/perfil")}
                data-testid="profile-menu-item"
              >
                <span className="material-icons mr-2 text-sm">person</span>
                Perfil
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLocation("/empresas")}
                data-testid="businesses-menu-item"
              >
                <span className="material-icons mr-2 text-sm">business</span>
                Mi empresa y RUCs
              </DropdownMenuItem>
              {/* "Configuración" means the settings of the LIBRO (brand, templates,
                  integrations), not the company record: that one is "Mi empresa". */}
              <DropdownMenuItem
                onClick={() => setLocation("/personalizacion")}
                data-testid="settings-menu-item"
              >
                <span className="material-icons mr-2 text-sm">palette</span>
                Configuración
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLocation("/integraciones")}
                data-testid="integrations-menu-item"
              >
                <span className="material-icons mr-2 text-sm">extension</span>
                Integraciones
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setLocation("/plan")}
                data-testid="plan-menu-item"
              >
                <span className="material-icons mr-2 text-sm">workspace_premium</span>
                Plan y Cuotas
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => window.open(INDECOPI_HELP_URL, "_blank", "noopener")}
                data-testid="help-menu-item"
              >
                <span className="material-icons mr-2 text-sm">help</span>
                Ayuda
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={handleLogout}
                disabled={logoutMutation.isPending}
                className="text-red-600"
                data-testid="logout-menu-item"
              >
                <span className="material-icons mr-2 text-sm">logout</span>
                {logoutMutation.isPending ? 'Cerrando sesión...' : 'Cerrar Sesión'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
