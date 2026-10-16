import { useState } from 'react';
import { Link } from 'wouter';

import AdminLayout from '@/components/layout/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  useAdminCustomers,
  useDeleteCustomer,
  useIsOperator,
  useUpdateCustomer,
  type AdminCustomer,
} from '@/hooks/use-admin';
import { adminPathFor } from '@/lib/admin-path';
import { PLAN_LIST } from '@shared/plans';
import { PAYMENT_CURRENCY_SYMBOL } from '@shared/payments';

/**
 * Clientes: la cartera completa.
 *
 * Aquí el equipo cambia un plan o un vencimiento cuando alguien pagó por
 * transferencia, desactiva una cuenta morosa y (con el RUC escrito a mano)
 * elimina un cliente. La ficha de cada cliente tiene el resto.
 */

export const PERIODS = ['monthly', 'annual'] as const;
export const STATUSES = ['trialing', 'active', 'past_due', 'canceled', 'trial_ended'] as const;

export const STATUS_LABELS: Record<string, string> = {
  trialing: 'Prueba',
  active: 'Activo',
  past_due: 'Vencido',
  canceled: 'Cancelado',
  trial_ended: 'Prueba terminada',
};

export const money = (cents: number) =>
  `${PAYMENT_CURRENCY_SYMBOL} ${(cents / 100).toFixed(2)}`;

export const fecha = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('es-PE') : '—';

export const toDateInput = (value: string | null) => (value ? value.slice(0, 10) : '');

export default function AdminCustomersPage() {
  const isOperator = useIsOperator();
  const { toast } = useToast();
  const customers = useAdminCustomers(isOperator);
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const [search, setSearch] = useState('');

  const term = search.trim().toLowerCase();
  const rows = (customers.data ?? []).filter((row) =>
    term
      ? [row.business.businessName, row.business.ruc, ...row.logins.map((login) => login.email)]
          .join(' ')
          .toLowerCase()
          .includes(term)
      : true,
  );

  return (
    <AdminLayout
      title="Clientes"
      subtitle={`${customers.data?.length ?? 0} cuentas · cambie plan, vencimiento o estado`}
    >
      <div className="space-y-4">
        <Input
          className="max-w-md border-slate-700 bg-slate-900 text-slate-100 placeholder:text-slate-500"
          placeholder="Buscar por razón social, RUC o correo..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        {customers.isLoading && <p className="text-sm text-slate-400">Cargando clientes...</p>}
        {!customers.isLoading && rows.length === 0 && (
          <p className="text-sm text-slate-400">Ningún cliente coincide.</p>
        )}

        {rows.map((row) => (
          <CustomerRow
            key={row.business.id}
            row={row}
            saving={
              updateCustomer.isPending && updateCustomer.variables?.businessId === row.business.id
            }
            deleting={
              deleteCustomer.isPending && deleteCustomer.variables?.businessId === row.business.id
            }
            onSave={async (changes) => {
              try {
                await updateCustomer.mutateAsync({ businessId: row.business.id, changes });
                toast({ title: 'Cliente actualizado', description: row.business.businessName });
              } catch (error) {
                toast({
                  title: 'No se pudo actualizar',
                  description: error instanceof Error ? error.message : 'Error',
                  variant: 'destructive',
                });
              }
            }}
            onDelete={async (confirmRuc) => {
              try {
                await deleteCustomer.mutateAsync({ businessId: row.business.id, confirmRuc });
                toast({ title: 'Cliente eliminado', description: row.business.businessName });
              } catch (error) {
                toast({
                  title: 'No se pudo eliminar',
                  description: error instanceof Error ? error.message : 'Error',
                  variant: 'destructive',
                });
              }
            }}
          />
        ))}
      </div>
    </AdminLayout>
  );
}

/** One customer: la suscripción y las acciones destructivas. */
function CustomerRow({
  row,
  saving,
  deleting,
  onSave,
  onDelete,
}: {
  row: AdminCustomer;
  saving: boolean;
  deleting: boolean;
  onSave: (changes: Record<string, unknown>) => void;
  onDelete: (confirmRuc: string) => void;
}) {
  const business = row.business;
  const [plan, setPlan] = useState(business.subscriptionPlan);
  const [period, setPeriod] = useState(business.planPeriod);
  const [status, setStatus] = useState(business.subscriptionStatus);
  const [periodEnd, setPeriodEnd] = useState(toDateInput(business.currentPeriodEnd));
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [typedRuc, setTypedRuc] = useState('');

  const inputClass = 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500';
  const triggerClass = 'border-slate-700 bg-slate-950 text-slate-100';

  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg text-slate-50">{business.businessName}</CardTitle>
            <CardDescription className="text-slate-400">
              RUC {business.ruc} · {business.establishmentCount} sucursales ·{' '}
              {row.logins.map((login) => login.email).join(', ') || 'sin accesos'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={
                business.subscriptionStatus === 'active'
                  ? 'bg-emerald-500/15 text-emerald-300'
                  : 'bg-slate-700/40 text-slate-300'
              }
            >
              {STATUS_LABELS[business.subscriptionStatus] ?? business.subscriptionStatus}
            </Badge>
            {!business.isActive && (
              <Badge className="bg-red-500/15 text-red-300">Desactivado</Badge>
            )}
            <span className="text-sm font-semibold text-slate-100">{money(row.paidCents)}</span>
            <span className="text-xs text-slate-400">
              {row.paymentCount} pagos
              {row.pendingCents > 0 ? ` · ${money(row.pendingCents)} pendiente` : ''}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs text-slate-400">Plan</p>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger className={`w-40 ${triggerClass}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_LIST.map((definition) => (
                  <SelectItem key={definition.id} value={definition.id}>
                    {definition.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-slate-400">Periodo</p>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className={`w-32 ${triggerClass}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value === 'annual' ? 'Anual' : 'Mensual'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-slate-400">Estado</p>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className={`w-40 ${triggerClass}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {STATUS_LABELS[value] ?? value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-slate-400">Vence</p>
            <Input
              type="date"
              className={`w-40 ${inputClass}`}
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
            />
          </div>

          <Button
            size="sm"
            className="bg-amber-500 text-slate-950 hover:bg-amber-400"
            disabled={saving}
            onClick={() =>
              onSave({
                subscriptionPlan: plan,
                planPeriod: period,
                subscriptionStatus: status,
                // Una fecha vacía borra el vencimiento (plan abierto).
                currentPeriodEnd: periodEnd
                  ? new Date(`${periodEnd}T00:00:00.000Z`).toISOString()
                  : null,
              })
            }
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
            disabled={saving}
            onClick={() => onSave({ isActive: !business.isActive })}
          >
            {business.isActive ? 'Desactivar' : 'Activar'}
          </Button>

          <Link href={adminPathFor(`/clientes/${business.id}`)}>
            <Button
              size="sm"
              variant="ghost"
              className="text-amber-300 hover:bg-slate-800 hover:text-amber-200"
            >
              Ver ficha
            </Button>
          </Link>

          {!confirmingDelete ? (
            <Button
              size="sm"
              variant="ghost"
              className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
              onClick={() => setConfirmingDelete(true)}
            >
              Eliminar
            </Button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-2">
              <span className="text-xs text-red-200">
                Escriba el RUC {business.ruc} para borrar todo el cliente:
              </span>
              <Input
                className="h-8 w-36 border-red-500/40 bg-slate-950 text-slate-100"
                value={typedRuc}
                onChange={(event) => setTypedRuc(event.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={deleting || typedRuc.trim() !== business.ruc}
                onClick={() => onDelete(typedRuc.trim())}
              >
                {deleting ? 'Eliminando...' : 'Confirmar'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-slate-300 hover:bg-slate-800"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancelar
              </Button>
            </div>
          )}
        </div>

        <p className="text-xs text-slate-500">
          Alta {fecha(business.createdAt)} · vence {fecha(business.currentPeriodEnd)}
        </p>
      </CardContent>
    </Card>
  );
}
