import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowUpRight, LogOut, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { ADMIN_LOGIN_URL, ADMIN_SECTIONS, adminPathFor } from '@/lib/admin-path';
import { cn } from '@/lib/utils';

/**
 * The operator console's shell.
 *
 * Deliberately NOT the customer application: no Libro de Reclamaciones sidebar,
 * no complaint screens, no copilot widget. Whoever runs the platform is doing a
 * different job - selling, reconciling, keeping the thing alive - so the console
 * has its own dark frame and its own sections (see `ADMIN_SECTIONS`), and nothing
 * else.
 *
 * It also owns the access check: `requirePlatformAdmin` on the API is what
 * actually protects the data, and this makes sure a customer who lands here sees
 * an explanation instead of a half-rendered screen.
 */
export default function AdminLayout({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Optional header buttons (refresh, export...). */
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { user, isLoading, logoutMutation } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        <p className="text-sm">Comprobando la sesión...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <Card className="w-full max-w-md border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-50">
              <ShieldCheck className="h-5 w-5 text-amber-400" aria-hidden="true" />
              Consola del equipo
            </CardTitle>
            <CardDescription className="text-slate-400">
              Esta página es privada. Inicie sesión con su cuenta de operador para continuar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={ADMIN_LOGIN_URL}>
              <Button className="bg-amber-500 text-slate-950 hover:bg-amber-400">
                Iniciar sesión
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user.isPlatformAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <Card className="w-full max-w-md border-slate-800 bg-slate-900 text-slate-100">
          <CardHeader>
            <CardTitle className="text-slate-50">Acceso restringido</CardTitle>
            <CardDescription className="text-slate-400">
              Esta consola es del equipo de LibroDigital. Su cuenta es de cliente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/panel">
              <Button
                variant="outline"
                className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
              >
                Ir a mi panel
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 flex-col border-r border-slate-800 bg-slate-900/80 lg:flex">
          <div className="border-b border-slate-800 px-5 py-5">
            <p className="font-mono text-[10px] tracking-[0.22em] text-amber-400 uppercase">
              LibroDigital
            </p>
            <p className="mt-1 font-display text-lg leading-none font-semibold text-slate-50">
              Consola de operaciones
            </p>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Navegación de la consola">
            {ADMIN_SECTIONS.map((section) => {
              const isActive =
                location === section.href ||
                (section.href !== adminPathFor() && location.startsWith(`${section.href}/`));
              return (
                <Link key={section.href} href={section.href}>
                  <div
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                      isActive
                        ? 'bg-amber-500 font-medium text-slate-950'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-slate-50',
                    )}
                  >
                    <span className="material-icons text-[18px] leading-none">{section.icon}</span>
                    <span>{section.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="space-y-2 border-t border-slate-800 px-4 py-4 text-xs text-slate-400">
            <p className="truncate">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate font-mono text-[11px] text-slate-500">{user.email}</p>
            {/* An operator normally owns no business, so the customer panel would be
                an empty shell: send them to the public site instead. */}
            <Link href={user.businessId ? '/panel' : '/'}>
              <span className="inline-flex cursor-pointer items-center gap-1 text-slate-300 hover:text-amber-300">
                {user.businessId ? 'Ir a la app' : 'Ver el sitio público'}{' '}
                <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </span>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full justify-start gap-2 text-slate-300 hover:bg-slate-800 hover:text-slate-50"
              disabled={logoutMutation.isPending}
              onClick={() => {
                void logoutMutation.mutateAsync().finally(() => {
                  // The shared sign-in page: logging in again sends a customer to
                  // their panel and an operator back to this console.
                  window.location.assign('/acceso');
                });
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Cerrar sesión
            </Button>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header className="border-b border-slate-800 bg-slate-900/60 px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-semibold text-slate-50">{title}</h1>
                {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
              </div>
              {actions}
            </div>

            {/* The console has no room for the customer sidebar: on phones the
                sections live here instead. */}
            <nav className="mt-4 flex flex-wrap gap-2 lg:hidden" aria-label="Secciones">
              {ADMIN_SECTIONS.map((section) => (
                <Link key={section.href} href={section.href}>
                  <span
                    className={cn(
                      'inline-flex cursor-pointer rounded-full border px-3 py-1 text-xs',
                      location === section.href
                        ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                        : 'border-slate-700 text-slate-300',
                    )}
                  >
                    {section.label}
                  </span>
                </Link>
              ))}
            </nav>
          </header>

          <div className="px-6 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
