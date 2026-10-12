import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
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

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4" data-testid="header">
      <div className="flex items-center justify-between">
        <div data-testid="header-info">
          <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-600">{subtitle || businessName}</p>
        </div>

        <div className="flex items-center space-x-4">
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
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-white text-sm font-medium">
                    {userName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </span>
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-sm font-medium text-gray-900">{userName}</p>
                  <p className="text-xs text-gray-500">
                    {user?.role === 'admin' ? 'Administrador' : user?.role === 'viewer' ? 'Visualizador' : 'Usuario'}
                  </p>
                </div>
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-56">
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
                data-testid="settings-menu-item"
              >
                <span className="material-icons mr-2 text-sm">settings</span>
                Configuración
              </DropdownMenuItem>
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
