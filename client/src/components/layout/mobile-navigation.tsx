import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const navigation = [
  {
    name: 'Panel',
    href: '/panel',
    icon: 'dashboard'
  },
  {
    name: 'Reclamos',
    href: '/reclamos',
    icon: 'assignment'
  },
  {
    name: 'Libros',
    href: '/libros',
    icon: 'menu_book'
  },
  {
    name: 'Reportes',
    href: '/reportes',
    icon: 'assessment'
  },
  {
    name: 'Mi Perfil',
    href: '/perfil',
    icon: 'account_circle'
  }
];

export default function MobileNavigation() {
  const [location] = useLocation();

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50" data-testid="mobile-navigation">
      <div className="grid grid-cols-5 gap-1">
        {navigation.map((item) => {
          const isActive = location === item.href;
          
          return (
            <Link key={item.name} href={item.href}>
              <a
                className={cn(
                  "flex flex-col items-center py-2 px-1 transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-gray-600"
                )}
                data-testid={`mobile-nav-${item.name.toLowerCase()}`}
              >
                <span className="material-icons text-sm">{item.icon}</span>
                <span className="text-xs font-medium">{item.name}</span>
              </a>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
