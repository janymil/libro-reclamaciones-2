import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface SidebarProps {
  className?: string;
}

interface NavigationSection {
  title?: string;
  items: {
    name: string;
    href: string;
    icon: string;
    badge?: string;
  }[];
}

const navigationSections: NavigationSection[] = [
  {
    items: [
      {
        name: 'Panel',
        href: '/panel',
        icon: 'dashboard'
      }
    ]
  },
  {
    title: 'RECLAMOS',
    items: [
      {
        name: 'Reclamos',
        href: '/reclamos',
        icon: 'assignment'
      },
      {
        name: 'Reportes',
        href: '/reportes',
        icon: 'assessment'
      }
    ]
  },
  {
    title: 'EMPRESAS',
    items: [
      {
        name: 'Empresas',
        href: '/empresas',
        icon: 'business'
      },
      {
        name: 'Sucursales',
        href: '/sucursales',
        icon: 'share'
      }
    ]
  },
  {
    items: [
      {
        name: 'Libros',
        href: '/libros',
        icon: 'menu_book'
      },
      {
        name: 'Código QR',
        href: '/codigo-qr',
        icon: 'qr_code_2'
      }
    ]
  },
  {
    title: 'USUARIOS',
    items: [
      {
        name: 'Usuarios',
        href: '/usuarios',
        icon: 'people'
      }
    ]
  },
  {
    title: 'CUENTA',
    items: [
      {
        name: 'Mi Perfil',
        href: '/perfil',
        icon: 'account_circle'
      },
      {
        name: 'Historial',
        href: '/historial',
        icon: 'history'
      }
    ]
  }
];

export default function Sidebar({ className }: SidebarProps) {
  const [location] = useLocation();

  return (
    <aside className={cn("w-64 bg-white shadow-lg", className)}>
      <div className="p-6 border-b border-gray-200" data-testid="sidebar-header">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <span className="material-icons text-white text-xl">book</span>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">LibroVirtual.pe</h1>
            <p className="text-sm text-gray-500">Gestión Legal</p>
          </div>
        </div>
      </div>
      
      <nav className="p-4" data-testid="sidebar-navigation">
        {navigationSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className="mb-6">
            {section.title && (
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">
                {section.title}
              </h3>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = location === item.href;
                const isLibros = item.name === 'Libros';
                
                return (
                  <Link key={item.name} href={item.href}>
                    <div
                      className={cn(
                        "flex items-center px-3 py-2 rounded-lg transition-colors text-sm cursor-pointer",
                        isLibros
                          ? "bg-orange-500 text-white font-medium"
                          : isActive
                          ? "bg-gray-200 text-gray-700 font-medium"
                          : "text-gray-700 hover:bg-gray-100"
                      )}
                      data-testid={`nav-link-${item.name.toLowerCase().replace(' ', '-')}`}
                    >
                      <span className="material-icons mr-3 text-lg">{item.icon}</span>
                      <span>{item.name}</span>
                      {item.badge && (
                        <span className="ml-auto bg-gray-500 text-white text-xs px-2 py-0.5 rounded-full">
                          {item.badge}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
