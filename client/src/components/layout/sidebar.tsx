import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { BookOpenCheck } from "lucide-react";

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
      },
      {
        name: 'Asistente IA',
        href: '/asistente',
        icon: 'smart_toy'
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
      },
      {
        name: 'Personalización',
        href: '/personalizacion',
        icon: 'palette'
      },
      {
        name: 'Integraciones',
        href: '/integraciones',
        icon: 'extension'
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
        name: 'Plan y Cuotas',
        href: '/plan',
        icon: 'workspace_premium'
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
    <aside
      className={cn(
        "flex w-64 flex-col border-r border-[#e3d9c6] bg-[#fdfaf3] text-[#1b1611]",
        className,
      )}
    >
      <div className="border-b border-[#e3d9c6] px-5 py-5" data-testid="sidebar-header">
        <Link href="/panel">
          <span className="flex items-center gap-2.5" translate="no">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#c02b0a] text-white shadow-[0_6px_16px_-6px_rgba(192,43,10,0.7)]">
              <BookOpenCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-[17px] font-semibold leading-none tracking-tight text-[#1b1611]">
                LibroVirtual<span className="text-[#c02b0a]">.pe</span>
              </span>
              <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-[#5c5246]">
                Gestión legal
              </span>
            </span>
          </span>
        </Link>
      </div>
      
      <nav
        className="flex-1 overflow-y-auto px-3 py-4"
        aria-label="Navegación principal"
        data-testid="sidebar-navigation"
      >
        {navigationSections.map((section, sectionIndex) => (
          <div key={sectionIndex} className={sectionIndex === 0 ? "" : "mt-5"}>
            {section.title && (
              <h3 className="mb-1.5 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-[#8a7d6d]">
                {section.title}
              </h3>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = location === item.href;

                return (
                  <Link key={item.name} href={item.href}>
                    <div
                      className={cn(
                        "flex cursor-pointer items-center rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-[#c02b0a] font-medium text-white shadow-[0_8px_18px_-10px_rgba(192,43,10,0.85)]"
                          : "text-[#3d342b] hover:bg-[#f3eadc] hover:text-[#1b1611]",
                      )}
                      data-testid={`nav-link-${item.name.toLowerCase().replace(' ', '-')}`}
                    >
                      <span className="material-icons mr-3 text-[18px] leading-none">{item.icon}</span>
                      <span>{item.name}</span>
                      {item.badge && (
                        <span className="ml-auto rounded-full bg-[#1b1611]/10 px-2 py-0.5 font-mono text-[10px]">
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

      <div className="border-t border-dashed border-[#e3d9c6] px-5 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#8a7d6d]">
          DS 011-2011-PCM
        </p>
      </div>
    </aside>
  );
}
