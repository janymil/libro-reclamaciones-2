import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, MailCheck, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';

import AdminLayout from '@/components/layout/admin-layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  useAdminConfigHistory,
  useAdminPaymentSettings,
  useAdminPlatformSettings,
  useIsOperator,
  useSendTestEmail,
  useUpdatePaymentSettings,
  useUpdatePlatformSettings,
  type PlatformSettingsInput,
} from '@/hooks/use-admin';
import { CONFIG_AREA_LABELS_TEXT } from '@/lib/admin-area-labels';
import {
  BANK_ACCOUNT_CURRENCIES,
  BANK_ACCOUNT_CURRENCY_LABELS,
  EMPTY_PAYMENT_DETAILS,
  MAX_BANK_ACCOUNTS,
  PREVIEW_PAYMENT,
  buildTransferInstructions,
  normalizePaymentDetails,
  type BankAccountCurrency,
  type BankAccountDetails,
  type PaymentCollectionDetails,
} from '@shared/payment-details';

/**
 * Configuración: dónde cobra LibroDigital.
 *
 * Antes esto vivía en la variable de entorno `PAYMENTS_MANUAL_INSTRUCTIONS`, así
 * que cambiar el número de Yape o abrir una cuenta nueva exigía un despliegue
 * mientras el cliente seguía leyendo la cuenta antigua. Aquí un operador lo
 * cambia y el siguiente cobro ya dice lo correcto.
 *
 * Tres decisiones que se ven en la pantalla:
 *   * la vista previa usa `buildTransferInstructions`, la MISMA función con la que
 *     el checkout arma el mensaje, así que no puede mentir;
 *   * la variable de entorno sigue siendo el respaldo si aquí no hay nada, y la
 *     pantalla lo dice en lugar de fingir que ya está configurado;
 *   * se guarda con `PUT`: lo que se borra aquí, se borra de verdad.
 */

const inputClass = 'border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500';

const fecha = (value: string | null) => (value ? new Date(value).toLocaleString('es-PE') : '—');

/** The form edits text, so a `null` field is just an empty box. */
const text = (value: string | null) => value ?? '';

/** Nothing configured yet: the platform form starts empty rather than invented. */
const EMPTY_PLATFORM_FORM: PlatformSettingsInput = {
  alertEmail: '',
  legalName: '',
  commercialName: '',
  ruc: '',
  fiscalAddress: '',
  contactEmail: '',
  contactPhone: '',
  website: '',
  allowFreePlanChange: false,
};

/** The stored values, in the shape the form uses (nullable columns become ""). */
function toPlatformForm(response: {
  stored: {
    alertEmail: string | null;
    legalName: string | null;
    commercialName: string | null;
    ruc: string | null;
    fiscalAddress: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
    allowFreePlanChange: boolean;
  };
}): PlatformSettingsInput {
  return {
    alertEmail: text(response.stored.alertEmail),
    legalName: text(response.stored.legalName),
    commercialName: text(response.stored.commercialName),
    ruc: text(response.stored.ruc),
    fiscalAddress: text(response.stored.fiscalAddress),
    contactEmail: text(response.stored.contactEmail),
    contactPhone: text(response.stored.contactPhone),
    website: text(response.stored.website),
    allowFreePlanChange: response.stored.allowFreePlanChange,
  };
}

export default function AdminSettingsPage() {
  const isOperator = useIsOperator();
  const { toast } = useToast();
  const stored = useAdminPaymentSettings(isOperator);
  const platform = useAdminPlatformSettings(isOperator);
  const history = useAdminConfigHistory(isOperator, 20);
  const save = useUpdatePaymentSettings();
  const savePlatform = useUpdatePlatformSettings();
  const testEmail = useSendTestEmail();

  const [form, setForm] = useState<PaymentCollectionDetails>(EMPTY_PAYMENT_DETAILS);
  const [platformForm, setPlatformForm] = useState<PlatformSettingsInput>(EMPTY_PLATFORM_FORM);

  // The server is the source of truth: the form is filled from it, and refilling
  // after a save is what proves that what the operator typed is what a customer
  // will read.
  useEffect(() => {
    if (stored.data?.settings) {
      setForm(stored.data.settings);
    }
  }, [stored.data]);

  useEffect(() => {
    if (platform.data) {
      setPlatformForm(toPlatformForm(platform.data));
    }
  }, [platform.data]);

  const setPlatformField = <K extends keyof PlatformSettingsInput>(
    key: K,
    value: PlatformSettingsInput[K],
  ) => setPlatformForm((current) => ({ ...current, [key]: value }));

  const handleSavePlatform = async (changes?: Partial<PlatformSettingsInput>) => {
    const payload = { ...platformForm, ...(changes ?? {}) };
    try {
      await savePlatform.mutateAsync(payload);
      setPlatformForm(payload);
      history.refetch();
      toast({
        title: 'Configuración guardada',
        description: 'El cambio quedó registrado en el historial.',
      });
    } catch (error) {
      toast({
        title: 'No se pudo guardar',
        description: error instanceof Error ? error.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  const setField = <K extends keyof PaymentCollectionDetails>(
    key: K,
    value: PaymentCollectionDetails[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const updateAccount = (index: number, patch: Partial<BankAccountDetails>) =>
    setForm((current) => ({
      ...current,
      bankAccounts: current.bankAccounts.map((account, position) =>
        position === index ? { ...account, ...patch } : account,
      ),
    }));

  const addAccount = () =>
    setForm((current) => ({
      ...current,
      bankAccounts: [
        ...current.bankAccounts,
        {
          bank: '',
          accountType: null,
          accountNumber: '',
          cci: null,
          currency: 'PEN' as const,
          holder: null,
        },
      ],
    }));

  const removeAccount = (index: number) =>
    setForm((current) => ({
      ...current,
      bankAccounts: current.bankAccounts.filter((_account, position) => position !== index),
    }));

  // Built with the checkout's own function over the same normalized data the API
  // stores, so an incomplete account row disappears here exactly as it will there.
  const preview = useMemo(
    () => buildTransferInstructions(PREVIEW_PAYMENT, normalizePaymentDetails(form)) ?? null,
    [form],
  );

  const configured = Boolean(preview);
  const fallbackOnly = !configured && stored.data?.envFallbackConfigured === true;

  const handleSave = async () => {
    try {
      // The raw form is sent on purpose (one PUT of the whole record): if a bank row
      // is incomplete the API answers 400 with the row number, instead of this
      // screen quietly dropping what the operator typed and reporting success.
      const response = (await save.mutateAsync(form)) as {
        settings?: PaymentCollectionDetails;
      } | null;

      if (response?.settings) {
        setForm(response.settings);
      }
      toast({
        title: 'Datos de pago guardados',
        description: 'El cliente los verá en el siguiente cobro por transferencia o Yape.',
      });
    } catch (error) {
      toast({
        title: 'No se pudieron guardar',
        description: error instanceof Error ? error.message : 'Error',
        variant: 'destructive',
      });
    }
  };

  return (
    <AdminLayout
      title="Configuración"
      subtitle="Datos de pago que lee el cliente en una transferencia o Yape"
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
            onClick={() => stored.refetch()}
            disabled={stored.isFetching}
          >
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Recargar
          </Button>
          <Button
            size="sm"
            className="bg-amber-500 text-slate-950 hover:bg-amber-400"
            disabled={save.isPending}
            data-testid="button-save-payment-settings"
            onClick={() => {
              void handleSave();
            }}
          >
            <Save className="mr-2 h-4 w-4" aria-hidden="true" />
            {save.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <Card
          className={
            configured ? 'border-slate-800 bg-slate-900' : 'border-amber-500/40 bg-slate-900'
          }
        >
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-slate-50">
              {configured ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-300" aria-hidden="true" />
              )}
              {configured
                ? 'El cliente ya sabe dónde pagar'
                : fallbackOnly
                  ? 'Todavía se usa el texto de la variable de entorno'
                  : 'Falta cargar los datos de pago'}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {configured
                ? 'Estos datos aparecen en el paso «transferencia / Yape directo» y en el resumen del pago pendiente.'
                : fallbackOnly
                  ? 'Mientras no guarde nada aquí, el mensaje es el de PAYMENTS_MANUAL_INSTRUCTIONS. Al guardar, esta pantalla manda.'
                  : 'Sin un número de Yape o una cuenta bancaria, el cliente solo lee «pídanos los datos de pago», que es mala primera impresión para alguien que ya decidió pagar.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <Badge
              className={
                configured ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'
              }
            >
              {configured ? 'Operativo' : fallbackOnly ? 'Respaldo (.env)' : 'Sin configurar'}
            </Badge>
            <span>
              Última edición {fecha(stored.data?.updatedAt ?? null)}
              {stored.data?.updatedByEmail ? ` por ${stored.data.updatedByEmail}` : ''}
            </span>
            <span>Se guarda con «Guardar»: hasta entonces el cliente sigue viendo lo anterior.</span>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Titular y billeteras</CardTitle>
            <CardDescription className="text-slate-400">
              El titular es lo que el cliente compara antes de confirmar una transferencia: si no
              coincide con el número, no paga por miedo a equivocarse.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="holder-name">
                Titular de la cuenta
              </Label>
              <Input
                id="holder-name"
                className={inputClass}
                placeholder="LibroDigital S.A.C."
                value={text(form.holderName)}
                onChange={(event) => setField('holderName', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="holder-ruc">
                RUC del titular
              </Label>
              <Input
                id="holder-ruc"
                className={inputClass}
                placeholder="20601234567"
                inputMode="numeric"
                maxLength={11}
                value={text(form.holderRuc)}
                onChange={(event) => setField('holderRuc', event.target.value)}
              />
              <p className="text-xs text-slate-500">11 dígitos, o vacío si no quiere publicarlo.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="yape-number">
                Número de Yape
              </Label>
              <Input
                id="yape-number"
                className={inputClass}
                placeholder="999 888 777"
                value={text(form.yapeNumber)}
                onChange={(event) => setField('yapeNumber', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="plin-number">
                Número de Plin
              </Label>
              <Input
                id="plin-number"
                className={inputClass}
                placeholder="999 888 777"
                value={text(form.plinNumber)}
                onChange={(event) => setField('plinNumber', event.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Cuentas bancarias</CardTitle>
            <CardDescription className="text-slate-400">
              Cada cuenta se imprime con su banco, su número y su CCI: el CCI es lo que necesita un
              cliente que transfiere desde otro banco. Una fila con banco pero sin número (o al
              revés) no se puede guardar: la pantalla avisa con el número de la cuenta a corregir
              (hasta {MAX_BANK_ACCOUNTS} cuentas).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {form.bankAccounts.length === 0 && (
              <p className="text-sm text-slate-400">
                Sin cuentas bancarias: el cliente solo verá las billeteras de arriba.
              </p>
            )}

            {form.bankAccounts.map((account, index) => (
              <div
                key={index}
                className="grid gap-3 border-b border-slate-800 pb-4 last:border-b-0 lg:grid-cols-12"
              >
                <div className="space-y-2 lg:col-span-3">
                  <Label className="text-slate-300">Banco</Label>
                  <Input
                    className={inputClass}
                    placeholder="BCP"
                    data-testid={`bank-account-bank-${index}`}
                    value={account.bank}
                    onChange={(event) => updateAccount(index, { bank: event.target.value })}
                  />
                </div>

                <div className="space-y-2 lg:col-span-2">
                  <Label className="text-slate-300">Tipo</Label>
                  <Input
                    className={inputClass}
                    placeholder="corriente"
                    value={text(account.accountType)}
                    onChange={(event) => updateAccount(index, { accountType: event.target.value })}
                  />
                </div>

                <div className="space-y-2 lg:col-span-3">
                  <Label className="text-slate-300">Número de cuenta</Label>
                  <Input
                    className={inputClass}
                    placeholder="193-1234567-0-12"
                    data-testid={`bank-account-number-${index}`}
                    value={account.accountNumber}
                    onChange={(event) => updateAccount(index, { accountNumber: event.target.value })}
                  />
                </div>

                <div className="space-y-2 lg:col-span-3">
                  <Label className="text-slate-300">CCI</Label>
                  <Input
                    className={inputClass}
                    placeholder="002-193-001234567012-15"
                    data-testid={`bank-account-cci-${index}`}
                    value={text(account.cci)}
                    onChange={(event) => updateAccount(index, { cci: event.target.value })}
                  />
                </div>

                <div className="flex items-end gap-2 lg:col-span-1">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Moneda</Label>
                    <select
                      className="h-10 rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100"
                      value={account.currency}
                      onChange={(event) =>
                        updateAccount(index, {
                          currency: event.target.value as BankAccountCurrency,
                        })
                      }
                    >
                      {BANK_ACCOUNT_CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>
                          {BANK_ACCOUNT_CURRENCY_LABELS[currency]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Quitar la cuenta ${index + 1}`}
                    className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
                    onClick={() => removeAccount(index)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}

            <Button
              size="sm"
              variant="outline"
              className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
              disabled={form.bankAccounts.length >= MAX_BANK_ACCOUNTS}
              data-testid="button-add-bank-account"
              onClick={addAccount}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Añadir cuenta
            </Button>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Comprobantes e indicaciones</CardTitle>
            <CardDescription className="text-slate-400">
              Dónde envía el cliente el voucher o el número de operación. Sin este dato no se lo
              pedimos y muchos confirman el pago sin avisar, así que el cobro se queda en «Por
              confirmar» hasta que alguien mire el banco.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="voucher-email">
                Correo para el comprobante
              </Label>
              <Input
                id="voucher-email"
                className={inputClass}
                placeholder="pagos@librodigital.pe"
                value={text(form.voucherEmail)}
                onChange={(event) => setField('voucherEmail', event.target.value)}
              />
              <p className="text-xs text-slate-500">
                Puede ser el mismo buzón del equipo; llegue a donde llegue, alguien lo lee.
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="voucher-whatsapp">
                WhatsApp para el comprobante
              </Label>
              <Input
                id="voucher-whatsapp"
                className={inputClass}
                placeholder="+51 999 888 777"
                value={text(form.voucherWhatsapp)}
                onChange={(event) => setField('voucherWhatsapp', event.target.value)}
              />
              <p className="text-xs text-slate-500">
                Si pone los dos, el mensaje ofrece ambos canales.
              </p>
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-slate-300" htmlFor="payment-notes">
                Indicaciones adicionales
              </Label>
              <Textarea
                id="payment-notes"
                className={inputClass}
                rows={3}
                placeholder="Atendemos de lunes a viernes, 9am a 6pm. Los pagos fuera de horario se confirman el siguiente día útil."
                value={text(form.notes)}
                onChange={(event) => setField('notes', event.target.value)}
              />
              <p className="text-xs text-slate-500">
                Texto libre que aparece al final del mensaje. Útil para horarios o para recordar que
                el plan solo se activa al confirmar el pago.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Mensaje que verá el cliente</CardTitle>
            <CardDescription className="text-slate-400">
              Se genera con la misma función que usa el cobro, sobre un pago de ejemplo{' '}
              {PREVIEW_PAYMENT.reference} por S/ {(PREVIEW_PAYMENT.amountCents / 100).toFixed(2)}. El
              importe y la referencia reales son siempre del pago que el cliente está haciendo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {preview ? (
              <pre
                className="whitespace-pre-wrap rounded-lg bg-slate-950 p-4 text-xs text-slate-100"
                data-testid="payment-settings-preview"
              >
                {preview}
              </pre>
            ) : (
              <p className="text-sm text-amber-300">
                Todavía no hay nada que mostrar: cargue un número de Yape o una cuenta bancaria y la
                vista previa aparece aquí antes de que lo vea un cliente.
              </p>
            )}

            <p className="text-xs text-slate-400">
              Los cambios no llegan al cliente hasta pulsar «Guardar». Si borra un dato y guarda, deja
              de aparecer: nada queda escondido en el mensaje.
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Alertas y correo</CardTitle>
            <CardDescription className="text-slate-400">
              El correo de alertas recibe avisos que necesitan a una persona, como una suscripción
              pagada que no se pudo asignar a ninguna cuenta. Las credenciales SMTP siguen en el
              servidor (`.env`): aquí solo se prueba que el envío funciona.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="alert-email">
                Correo de alertas
              </Label>
              <Input
                id="alert-email"
                className={`max-w-md ${inputClass}`}
                placeholder="alertas@librodigital.pe"
                value={platformForm.alertEmail}
                onChange={(event) => setPlatformField('alertEmail', event.target.value)}
              />
              <p className="text-xs text-slate-500">
                {platform.data?.effective.alertEmailSource === 'env'
                  ? `Vacío ahora mismo: se usa PAYMENTS_ALERT_EMAIL (${platform.data.env.alertEmail ?? '—'}).`
                  : platform.data?.effective.alertEmailSource === 'panel'
                    ? 'Configurado aquí: tiene prioridad sobre la variable de entorno.'
                    : 'Sin configurar: un pago que no se pueda asignar solo queda en el log del servidor.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3 text-xs text-slate-400">
              <Badge className="bg-slate-800 text-slate-300">
                SMTP {platform.data?.env.smtpHost ? `${platform.data.env.smtpHost}:${platform.data.env.smtpPort ?? ''}` : 'sin configurar'}
              </Badge>
              <span>
                Remitente: {platform.data?.env.smtpFromEmail ?? '—'}
                {platform.data?.env.smtpUser ? ` · usuario ${platform.data.env.smtpUser}` : ''}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="border-slate-700 bg-transparent text-slate-200 hover:bg-slate-800"
                disabled={testEmail.isPending}
                data-testid="button-send-test-email"
                onClick={async () => {
                  try {
                    const response = (await testEmail.mutateAsync(undefined)) as
                      | { message?: string }
                      | null;
                    toast({
                      title: 'Correo de prueba',
                      description: response?.message ?? 'Enviado a su correo de acceso.',
                    });
                  } catch (error) {
                    toast({
                      title: 'El correo de prueba falló',
                      description: error instanceof Error ? error.message : 'Error',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                <MailCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                {testEmail.isPending ? 'Enviando...' : 'Probar SMTP'}
              </Button>
              <span>El mensaje de prueba llega a su propio correo de acceso, nunca a otro.</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Identidad de la plataforma</CardTitle>
            <CardDescription className="text-slate-400">
              Lo que la plataforma dice de sí misma en comprobantes, avisos y la página pública. Si
              deja un campo vacío se omite; nunca se inventa un RUC ni una dirección.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="legal-name">
                Razón social
              </Label>
              <Input
                id="legal-name"
                className={inputClass}
                placeholder="LibroDigital S.A.C."
                value={platformForm.legalName}
                onChange={(event) => setPlatformField('legalName', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="commercial-name">
                Nombre comercial
              </Label>
              <Input
                id="commercial-name"
                className={inputClass}
                placeholder="LibroDigital.pe"
                value={platformForm.commercialName}
                onChange={(event) => setPlatformField('commercialName', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="platform-ruc">
                RUC de la plataforma
              </Label>
              <Input
                id="platform-ruc"
                className={inputClass}
                placeholder="20601234567"
                inputMode="numeric"
                maxLength={11}
                value={platformForm.ruc}
                onChange={(event) => setPlatformField('ruc', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="platform-website">
                Sitio web
              </Label>
              <Input
                id="platform-website"
                className={inputClass}
                placeholder="https://librodigital.pe"
                value={platformForm.website}
                onChange={(event) => setPlatformField('website', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="contact-email">
                Correo de contacto (atención al cliente)
              </Label>
              <Input
                id="contact-email"
                className={inputClass}
                placeholder="hola@librodigital.pe"
                value={platformForm.contactEmail}
                onChange={(event) => setPlatformField('contactEmail', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-slate-300" htmlFor="contact-phone">
                Teléfono de contacto
              </Label>
              <Input
                id="contact-phone"
                className={inputClass}
                placeholder="+51 999 888 777"
                value={platformForm.contactPhone}
                onChange={(event) => setPlatformField('contactPhone', event.target.value)}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label className="text-slate-300" htmlFor="fiscal-address">
                Dirección fiscal
              </Label>
              <Input
                id="fiscal-address"
                className={inputClass}
                placeholder="Av. Ejemplo 123, Miraflores, Lima"
                value={platformForm.fiscalAddress}
                onChange={(event) => setPlatformField('fiscalAddress', event.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <Button
                className="bg-amber-500 text-slate-950 hover:bg-amber-400"
                disabled={savePlatform.isPending}
                data-testid="button-save-platform-settings"
                onClick={() => void handleSavePlatform()}
              >
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                {savePlatform.isPending ? 'Guardando...' : 'Guardar alertas e identidad'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-500/30 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Operación</CardTitle>
            <CardDescription className="text-slate-400">
              Ajustes que cambian cómo se comporta la plataforma. El interruptor de abajo permite
              activar un plan <strong>sin cobrar</strong>: para facturación fuera de la app. La prueba
              gratuita (días) y los precios se editan en <strong>Planes</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 p-4">
              <div className="max-w-xl space-y-1">
                <p className="text-sm text-slate-100">Permitir cambiar de plan sin pago</p>
                <p className="text-xs text-slate-400">
                  Cuando está activo, cualquier administrador de un cliente puede aplicar un plan
                  desde «Plan y Cuotas» sin que entre dinero. Es la vía para facturación manual; en
                  producción, déjelo apagado.
                  {platform.data?.effective.allowFreePlanChangeFromEnv
                    ? ' Ahora mismo también está activo por PAYMENTS_ALLOW_FREE_PLAN_CHANGE en el servidor.'
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  className={
                    platform.data?.effective.allowFreePlanChange
                      ? 'bg-red-500/15 text-red-300'
                      : 'bg-emerald-500/15 text-emerald-300'
                  }
                >
                  {platform.data?.effective.allowFreePlanChange ? 'ACTIVO' : 'Desactivado'}
                </Badge>
                <Switch
                  checked={platformForm.allowFreePlanChange}
                  disabled={savePlatform.isPending}
                  data-testid="switch-free-plan-change"
                  onCheckedChange={(checked) => {
                    if (
                      checked &&
                      !window.confirm(
                        '¿Activar el cambio de plan SIN pago?\n\nCualquier administrador de un cliente podrá aplicar un plan sin que entre dinero. Queda registrado en el historial con su correo.',
                      )
                    ) {
                      return;
                    }
                    void handleSavePlatform({ allowFreePlanChange: checked });
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-slate-50">Historial de cambios</CardTitle>
            <CardDescription className="text-slate-400">
              Quién cambió qué, con fecha. Se guarda para siempre: es lo que permite responder «¿por
              qué esta cuenta tiene el plan gratis?» o «¿quién cambió el número de Yape?» sin depender
              de un log que ya rotó.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.isLoading && <p className="text-sm text-slate-400">Cargando historial...</p>}
            {!history.isLoading && (history.data?.changes ?? []).length === 0 && (
              <p className="text-sm text-slate-400">Todavía no hay cambios registrados.</p>
            )}

            {(history.data?.changes ?? []).map((change) => (
              <div
                key={change.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 py-2 text-sm last:border-b-0"
              >
                <div>
                  <p className="text-slate-100">{change.summary}</p>
                  <p className="text-xs text-slate-500">
                    {change.email ?? 'operador'} · {fecha(change.createdAt)}
                  </p>
                </div>
                <Badge className="bg-slate-800 text-slate-300">
                  {CONFIG_AREA_LABELS_TEXT[change.area] ?? change.area}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

