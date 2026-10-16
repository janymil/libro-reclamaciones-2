import { useState } from 'react';

import AdminLayout from '@/components/layout/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  useAdminOperators,
  useGrantOperator,
  useIsOperator,
  useRevokeOperator,
} from '@/hooks/use-admin';

/**
 * Equipo: quién puede operar la plataforma.
 *
 * Un operador no es un cliente: no tiene empresa, gestiona las de los demás. Por
 * eso el permiso vive en `users.is_platform_admin` y nunca en la columna `role`
 * (que en un cliente significa "dueño de su propia cuenta").
 */

const fecha = (value: string | null) => (value ? new Date(value).toLocaleString('es-PE') : '—');

export default function AdminTeamPage() {
  const isOperator = useIsOperator();
  const { toast } = useToast();
  const operators = useAdminOperators(isOperator);
  const grant = useGrantOperator();
  const revoke = useRevokeOperator();
  const [email, setEmail] = useState('');

  const operatorsList = operators.data?.operators ?? [];
  const candidates = (operators.data?.candidates ?? []).filter((candidate) => !candidate.isDemo);

  return (
    <AdminLayout
      title="Equipo"
      subtitle={`${operatorsList.length} operadores con acceso a esta consola`}
    >
      <div className="space-y-6">
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Operadores</CardTitle>
            <CardDescription className="text-slate-400">
              Pueden ver y cambiar clientes, confirmar pagos y asignar suscripciones. El último
              operador no se puede quitar: nadie podría volver a administrar la plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {operators.isLoading && <p className="text-sm text-slate-400">Cargando...</p>}

            {operatorsList.map((operator) => (
              <div
                key={operator.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 py-3 last:border-b-0"
              >
                <div>
                  <p className="text-sm text-slate-100">{operator.email}</p>
                  <p className="text-xs text-slate-400">
                    {operator.firstName} {operator.lastName} · último acceso{' '}
                    {fecha(operator.lastLoginAt)} · alta {fecha(operator.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {!operator.isActive && (
                    <Badge className="bg-red-500/15 text-red-300">Inactivo</Badge>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    disabled={revoke.isPending}
                    onClick={async () => {
                      try {
                        await revoke.mutateAsync({ userId: operator.id });
                        toast({ title: 'Acceso retirado', description: operator.email });
                      } catch (error) {
                        toast({
                          title: 'No se pudo quitar el acceso',
                          description: error instanceof Error ? error.message : 'Error',
                          variant: 'destructive',
                        });
                      }
                    }}
                  >
                    Quitar acceso
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Añadir operador</CardTitle>
            <CardDescription className="text-slate-400">
              La cuenta tiene que existir ya (el panel no crea cuentas: para eso está
              <span className="font-mono"> npm run db:admin</span>). La cuenta demo nunca puede ser
              operador: su contraseña es pública.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                className="max-w-xs border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
                placeholder="correo@librodigital.pe"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button
                className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                disabled={grant.isPending || email.trim().length === 0}
                onClick={async () => {
                  try {
                    await grant.mutateAsync({ email: email.trim() });
                    toast({ title: 'Operador añadido', description: email.trim() });
                    setEmail('');
                  } catch (error) {
                    toast({
                      title: 'No se pudo dar acceso',
                      description: error instanceof Error ? error.message : 'Error',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                Dar acceso
              </Button>
            </div>

            {candidates.length > 0 && (
              <div className="space-y-1 pt-2">
                <p className="text-xs text-slate-400">
                  Cuentas que aún no son operadores (haga clic para rellenar el correo):
                </p>
                <div className="flex flex-wrap gap-2">
                  {candidates.slice(0, 12).map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      onClick={() => setEmail(candidate.email)}
                      className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-amber-400 hover:text-amber-300"
                    >
                      {candidate.email}
                      {candidate.businessName ? ` · ${candidate.businessName}` : ' · sin empresa'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
