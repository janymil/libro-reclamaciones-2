import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { UsageMeter } from "@/components/subscription/usage-meter";
import { useToast } from "@/hooks/use-toast";
import { useSubscription, useTrialDays } from "@/hooks/use-subscription";
import { apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { businessUpdateSchema, type Business, type LibroConfiguration } from "@shared/schema";
import type { CurrentUser, UserStats } from "@/lib/api-types";
import {
  Mail,
  Calendar,
  Lock,
  Save,
  Shield,
  Building2,
  Copy,
  Link2,
  QrCode,
  Users,
  Store,
  BookOpen,
  BadgeCheck,
  MailWarning,
  Trash2,
  Loader2,
} from "lucide-react";

/**
 * Mi Perfil: the account's own data and the company it belongs to, in separate
 * tabs.
 *
 * The two are kept apart on purpose. Name, surname and email belong to the
 * `users` row (PATCH /api/users/profile); razón social, RUC, teléfono,
 * dirección, ubicación and website belong to the `businesses` row and are
 * edited through PATCH /api/businesses/:id — the same endpoint the "Empresas"
 * page uses, so company data has a single write path. Plan and quotas are
 * read-only here and live in "Plan y Cuotas".
 */

const accountSchema = z.object({
  firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(100),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().email('Email inválido'),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual requerida'),
  newPassword: z.string().min(6, 'Nueva contraseña debe tener al menos 6 caracteres'),
  confirmPassword: z.string().min(1, 'Confirme la nueva contraseña'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

/**
 * Company profile form: the server's whitelist (businessUpdateSchema) with the
 * two fields a business cannot live without sharpened to required. The RUC is
 * deliberately absent - it is the legal identity and never changes.
 */
const companySchema = businessUpdateSchema.extend({
  businessName: z.string().trim().min(1, 'La razón social es obligatoria').max(200),
  address: z.string().trim().min(1, 'La dirección es obligatoria').max(500),
});

type AccountForm = z.infer<typeof accountSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;
type CompanyForm = z.infer<typeof companySchema>;

/** Label/value line for the read-only company facts. */
function FactRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-gray-600">
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export default function Profile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<'account' | 'company' | 'security'>('account');

  // "Eliminar mi cuenta": irreversible, so it asks for the word in writing and,
  // when the caller is the last administrator, also offers to close the company
  // (the server refuses to leave a tenant ownerless otherwise).
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [closeCompanyToo, setCloseCompanyToo] = useState(false);

  const { data: user, isLoading } = useQuery<CurrentUser>({
    queryKey: ['/api/auth/user'],
  });

  const { data: userStats } = useQuery<UserStats>({
    queryKey: ['/api/users/stats'],
  });

  const { data: business } = useQuery<Business | null>({
    queryKey: ['/api/businesses/current'],
  });

  // Public link, notification inbox and business type of the Libro.
  const { data: libroConfig } = useQuery<LibroConfiguration | null>({
    queryKey: ['/api/libro-configuration'],
  });

  const { data: subscription } = useSubscription();
  // The trial length in force (Planes may have changed it from the built-in default).
  const trialDays = useTrialDays();

  // Who else administers the company? The server refuses to delete the LAST
  // administrator without also closing the tenant, so the dialog has to know
  // and offer that option up front.
  const { data: team } = useQuery<Array<{ id: string; role: string; isActive: boolean }>>({
    queryKey: ['/api/users'],
  });
  const activeAdmins = (team ?? []).filter((member) => member.role === 'admin' && member.isActive);
  const isLastAdministrator =
    Boolean(business) && activeAdmins.length === 1 && activeAdmins[0].id === user?.id;

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const query = closeCompanyToo ? '?closeBusiness=true' : '';
      const response = await apiRequest('DELETE', `/api/users/me${query}`);
      return response.json() as Promise<{ message: string }>;
    },
    onSuccess: (data) => {
      // The session is gone server-side: drop every cached query and leave.
      queryClient.clear();
      toast({ title: 'Cuenta eliminada', description: data.message });
      setLocation('/');
    },
    onError: (error) => {
      toast({
        title: 'No se pudo eliminar la cuenta',
        description: apiErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  // Only an administrator may change the tenant (server-side rule on
  // PATCH /api/businesses/:id); everybody else reads the company data.
  const canEditCompany = user?.role === 'admin';

  const accountForm = useForm<AccountForm>({
    resolver: zodResolver(accountSchema),
    values: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      email: user?.email || '',
    },
  });

  const companyForm = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    values: {
      businessName: business?.businessName || '',
      commercialName: business?.commercialName || '',
      phone: business?.phone || '',
      address: business?.address || '',
      distrito: business?.distrito || '',
      provincia: business?.provincia || '',
      departamento: business?.departamento || '',
      website: business?.website || '',
    },
  });

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async (data: AccountForm) => {
      const response = await apiRequest('PATCH', '/api/users/profile', data);
      return response.json() as Promise<{ verificationSent?: boolean }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: "Perfil actualizado",
        description: data?.verificationSent
          ? "Enviamos un enlace de confirmación a tu nuevo correo. Confírmalo para seguir recibiendo los avisos de cada reclamación."
          : "Su información se ha guardado exitosamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const updateCompanyMutation = useMutation({
    mutationFn: async (data: CompanyForm) => {
      const response = await apiRequest('PATCH', `/api/businesses/${business?.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/businesses/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/businesses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/businesses'] });
      toast({
        title: "Empresa actualizada",
        description: "Los datos de la empresa se guardaron correctamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "No se pudo guardar",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordForm) => {
      return apiRequest('POST', '/api/users/change-password', data);
    },
    onSuccess: () => {
      toast({
        title: "Contraseña cambiada",
        description: "Su contraseña se ha actualizado exitosamente.",
      });
      passwordForm.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo cambiar la contraseña. Verifique su contraseña actual.",
        variant: "destructive",
      });
    },
  });

  const resendVerificationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/auth/resend-verification');
      return response.json() as Promise<{ message: string }>;
    },
    onSuccess: (data) => {
      toast({ title: "Enlace enviado", description: data.message });
    },
    onError: (error) => {
      toast({
        title: "No se pudo enviar",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const onAccountSubmit = (data: AccountForm) => updateAccountMutation.mutate(data);
  const onCompanySubmit = (data: CompanyForm) => updateCompanyMutation.mutate(data);
  const onPasswordSubmit = (data: PasswordForm) => changePasswordMutation.mutate(data);

  const getInitials = (firstName?: string, lastName?: string) => {
    if (firstName && lastName) {
      return (firstName[0] + lastName[0]).toUpperCase();
    }
    if (firstName) {
      return firstName.slice(0, 2).toUpperCase();
    }
    return 'U';
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'user': return 'Usuario';
      case 'viewer': return 'Visualizador';
      default: return role;
    }
  };

  // Same wording as "Plan y Cuotas": an ended trial is a state of its own, not a
  // plan the customer actually bought.
  const trialEnded = !!subscription && !subscription.isTrial && subscription.status === 'trial_ended';
  const subscriptionLabel = subscription?.isTrial
    ? `Prueba gratuita (${subscription.trialDaysRemaining} día(s))`
    : trialEnded
      ? 'Prueba finalizada'
      : 'Activo';

  const publicLibroUrl = libroConfig?.urlSlug
    ? `${window.location.origin}/libro/${libroConfig.urlSlug}`
    : null;

  const copyPublicLink = async () => {
    if (!publicLibroUrl) return;
    try {
      await navigator.clipboard.writeText(publicLibroUrl);
      toast({ title: "Enlace copiado", description: publicLibroUrl });
    } catch {
      // Clipboard blocked (http, permissions): show it so it can be copied.
      toast({ title: "Copia manual", description: publicLibroUrl });
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="profile-title">
              Mi Perfil
            </h1>
            <p className="text-gray-600">
              Gestione su cuenta y los datos de su empresa
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Account summary */}
          <Card className="lg:col-span-1 self-start">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="text-lg">
                    {getInitials(user?.firstName, user?.lastName)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <CardTitle data-testid="user-name">
                {user?.firstName && user?.lastName
                  ? `${user.firstName} ${user.lastName}`
                  : user?.firstName || user?.email || 'Usuario'
                }
              </CardTitle>
              <CardDescription className="flex items-center justify-center gap-2">
                <Mail className="h-4 w-4" />
                {user?.email}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Rol</span>
                <Badge variant="outline" data-testid="user-role">
                  <Shield className="h-3 w-3 mr-1" />
                  {getRoleLabel(user?.role || '')}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Estado</span>
                <Badge variant="default">{user?.isActive === false ? 'Inactivo' : 'Activo'}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Correo</span>
                {user?.isEmailVerified ? (
                  <Badge className="bg-green-100 text-green-800" data-testid="badge-email-verified">
                    <BadgeCheck className="h-3 w-3 mr-1" />
                    Confirmado
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-800" data-testid="badge-email-unverified">
                    <MailWarning className="h-3 w-3 mr-1" />
                    Sin confirmar
                  </Badge>
                )}
              </div>

              <button
                type="button"
                onClick={() => setTab('company')}
                className="flex w-full items-center justify-between rounded-md px-1 py-1 text-left transition-colors hover:bg-gray-50"
                data-testid="button-open-company-tab"
              >
                <span className="flex items-center gap-2 text-sm text-gray-600">
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  Empresa
                </span>
                <span className="text-right text-sm font-medium">
                  {business?.businessName || 'Sin configurar'}
                </span>
              </button>

              {business?.ruc && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">RUC</span>
                  <span className="font-medium">{business.ruc}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4" />
                <span>Miembro desde {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('es-PE') : 'N/A'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Account / company / security */}
          <Card className="lg:col-span-2">
            <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)} className="w-full">
              <CardHeader>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="account" data-testid="tab-profile">Mi cuenta</TabsTrigger>
                  <TabsTrigger value="company" data-testid="tab-company">Mi empresa</TabsTrigger>
                  <TabsTrigger value="security" data-testid="tab-security">Seguridad</TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent>
                {/* ---- Mi cuenta: the person ---- */}
                <TabsContent value="account" className="space-y-6">
                  {isLoading ? (
                    <p className="flex items-center gap-2 text-sm text-gray-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Cargando…
                    </p>
                  ) : (
                    <Form {...accountForm}>
                      <form onSubmit={accountForm.handleSubmit(onAccountSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <FormField
                            control={accountForm.control}
                            name="firstName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Nombres</FormLabel>
                                <FormControl>
                                  <Input placeholder="Nombres" {...field} data-testid="input-first-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={accountForm.control}
                            name="lastName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Apellidos</FormLabel>
                                <FormControl>
                                  <Input placeholder="Apellidos" {...field} value={field.value ?? ''} data-testid="input-last-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={accountForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="tu@email.com" {...field} data-testid="input-email" />
                              </FormControl>
                              <p className="text-xs text-gray-500">
                                Es el correo que inicia sesión y recibe el aviso de cada reclamación.
                                Si lo cambia, enviaremos un enlace de confirmación a la nueva dirección.
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {!user?.isEmailVerified && (
                          <div className="flex flex-col gap-3 rounded-lg border border-[#c9a227]/40 bg-[#fdf6e3] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <p className="leading-relaxed text-[#1b1611]">
                              <strong>{user?.email}</strong> aún no está confirmado. Sin confirmarlo no
                              se puede publicar el Libro de Reclamaciones de su empresa.
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              disabled={resendVerificationMutation.isPending}
                              onClick={() => resendVerificationMutation.mutate()}
                              data-testid="button-resend-verification-profile"
                            >
                              {resendVerificationMutation.isPending ? 'Enviando…' : 'Reenviar enlace'}
                            </Button>
                          </div>
                        )}

                        <Button
                          type="submit"
                          disabled={updateAccountMutation.isPending}
                          className="w-full"
                          data-testid="button-save-profile"
                        >
                          <Save className="h-4 w-4 mr-2" />
                          {updateAccountMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                        </Button>
                      </form>
                    </Form>
                  )}
                </TabsContent>

                {/* ---- Mi empresa: the tenant ---- */}
                <TabsContent value="company" className="space-y-6">
                  {!business ? (
                    <div className="space-y-4 rounded-lg border border-dashed p-6 text-center">
                      <Building2 className="mx-auto h-8 w-8 text-gray-400" aria-hidden="true" />
                      <div>
                        <p className="font-medium text-gray-900">Aún no ha registrado su empresa</p>
                        <p className="mt-1 text-sm text-gray-600">
                          Complete los datos de su empresa para publicar el Libro de Reclamaciones.
                        </p>
                      </div>
                      <Link href="/registro">
                        <Button data-testid="button-go-onboarding">Configurar mi empresa</Button>
                      </Link>
                    </div>
                  ) : (
                    <>
                      <Form {...companyForm}>
                        <form onSubmit={companyForm.handleSubmit(onCompanySubmit)} className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="font-semibold text-gray-900">Datos fiscales</h3>
                            <Badge variant="outline">RUC {business.ruc}</Badge>
                          </div>

                          {!canEditCompany && (
                            <p className="text-xs text-gray-500">
                              Solo un administrador de la empresa puede editar estos datos.
                            </p>
                          )}

                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <FormField
                              control={companyForm.control}
                              name="businessName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Razón Social</FormLabel>
                                  <FormControl>
                                    <Input disabled={!canEditCompany} {...field} data-testid="input-business-name" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={companyForm.control}
                              name="commercialName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Nombre Comercial</FormLabel>
                                  <FormControl>
                                    <Input disabled={!canEditCompany} {...field} value={field.value ?? ''} data-testid="input-commercial-name" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <FormField
                              control={companyForm.control}
                              name="phone"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Teléfono</FormLabel>
                                  <FormControl>
                                    <Input disabled={!canEditCompany} placeholder="+51 999 999 999" {...field} value={field.value ?? ''} data-testid="input-phone" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={companyForm.control}
                              name="website"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Sitio web</FormLabel>
                                  <FormControl>
                                    <Input disabled={!canEditCompany} placeholder="https://empresa.pe" {...field} value={field.value ?? ''} data-testid="input-website" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          <FormField
                            control={companyForm.control}
                            name="address"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Dirección</FormLabel>
                                <FormControl>
                                  <Textarea disabled={!canEditCompany} placeholder="Dirección completa" {...field} data-testid="input-address" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                            <FormField
                              control={companyForm.control}
                              name="departamento"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Departamento</FormLabel>
                                  <FormControl>
                                    <Input disabled={!canEditCompany} {...field} data-testid="input-departamento" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={companyForm.control}
                              name="provincia"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Provincia</FormLabel>
                                  <FormControl>
                                    <Input disabled={!canEditCompany} {...field} data-testid="input-provincia" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={companyForm.control}
                              name="distrito"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Distrito</FormLabel>
                                  <FormControl>
                                    <Input disabled={!canEditCompany} {...field} data-testid="input-distrito" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>

                          {canEditCompany && (
                            <Button
                              type="submit"
                              disabled={updateCompanyMutation.isPending}
                              className="w-full"
                              data-testid="button-save-company"
                            >
                              <Save className="h-4 w-4 mr-2" />
                              {updateCompanyMutation.isPending ? 'Guardando...' : 'Guardar empresa'}
                            </Button>
                          )}
                        </form>
                      </Form>

                      {/* Commercial state: read-only here, owned by "Plan y Cuotas" */}
                      <div className="space-y-4 border-t pt-6">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-semibold text-gray-900">Estado comercial</h3>
                          <div className="flex items-center gap-2">
                            <Badge
                              className={
                                subscription?.isTrial
                                  ? "bg-purple-100 text-purple-800"
                                  : trialEnded
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-green-100 text-green-800"
                              }
                            >
                              {subscriptionLabel}
                            </Badge>
                            <Link href="/plan">
                              <Button variant="outline" size="sm" data-testid="link-manage-plan">
                                Gestionar plan
                              </Button>
                            </Link>
                          </div>
                        </div>

                        {subscription && (
                          <>
                            <p className="text-sm text-gray-600">
                              Plan <strong>{subscription.plan.name}</strong> ·{' '}
                              {subscription.planPeriod === 'annual' ? 'anual' : 'mensual'}
                              {subscription.isTrial && ` · prueba de ${trialDays} días desde el registro`}
                            </p>
                            <div className="space-y-4">
                              {subscription.plan.limits.complaintsTotal !== null ? (
                                <UsageMeter
                                  label="Reclamos usados (total del plan Gratis)"
                                  used={subscription.usage.complaintsTotal}
                                  limit={subscription.plan.limits.complaintsTotal}
                                />
                              ) : (
                                <UsageMeter
                                  label="Reclamos este mes"
                                  used={subscription.usage.complaintsThisMonth}
                                  limit={subscription.plan.limits.complaintsPerMonth}
                                />
                              )}
                              <UsageMeter
                                label="Usuarios"
                                used={subscription.usage.users}
                                limit={subscription.plan.limits.users}
                              />
                              <UsageMeter
                                label="Sucursales"
                                used={subscription.usage.establishments}
                                limit={subscription.plan.limits.establishments}
                              />
                              <UsageMeter
                                label="Empresas (RUCs)"
                                used={subscription.usage.businesses}
                                limit={subscription.plan.limits.businesses}
                              />
                            </div>
                          </>
                        )}
                      </div>

                      {/* Public presence */}
                      <div className="space-y-4 border-t pt-6">
                        <h3 className="font-semibold text-gray-900">Presencia pública</h3>

                        {publicLibroUrl ? (
                          <div className="space-y-2">
                            <span className="flex items-center gap-2 text-sm text-gray-600">
                              <Link2 className="h-4 w-4" aria-hidden="true" />
                              Enlace del Libro de Reclamaciones
                            </span>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <Input readOnly value={publicLibroUrl} data-testid="input-public-link" />
                              <Button
                                type="button"
                                variant="outline"
                                className="shrink-0"
                                onClick={copyPublicLink}
                                data-testid="button-copy-public-link"
                              >
                                <Copy className="h-4 w-4 mr-2" />
                                Copiar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-600">
                            Su Libro aún no tiene un enlace público configurado.
                          </p>
                        )}

                        {libroConfig?.notificationEmail && (
                          <FactRow
                            icon={Mail}
                            label="Correo de notificaciones"
                            value={libroConfig.notificationEmail}
                          />
                        )}
                        {libroConfig?.businessType && (
                          <FactRow
                            icon={Store}
                            label="Tipo de negocio"
                            value={libroConfig.businessType.replace(/_/g, ' ')}
                          />
                        )}

                        <div className="flex flex-wrap gap-2">
                          <Link href="/codigo-qr">
                            <Button variant="outline" size="sm" data-testid="link-qr">
                              <QrCode className="h-4 w-4 mr-2" />
                              Código QR
                            </Button>
                          </Link>
                          <Link href="/sucursales">
                            <Button variant="outline" size="sm" data-testid="link-establishments">
                              <Store className="h-4 w-4 mr-2" />
                              Sucursales
                            </Button>
                          </Link>
                          <Link href="/usuarios">
                            <Button variant="outline" size="sm" data-testid="link-users">
                              <Users className="h-4 w-4 mr-2" />
                              Usuarios
                            </Button>
                          </Link>
                          <Link href="/libros">
                            <Button variant="outline" size="sm" data-testid="link-books">
                              <BookOpen className="h-4 w-4 mr-2" />
                              Libros
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </>
                  )}
                </TabsContent>

                {/* ---- Seguridad ---- */}
                <TabsContent value="security" className="space-y-6">
                  <div className="flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium text-gray-900">Correo de la cuenta</p>
                      <p className="text-gray-600">{user?.email}</p>
                    </div>
                    {user?.isEmailVerified ? (
                      <Badge className="bg-green-100 text-green-800">
                        <BadgeCheck className="h-3 w-3 mr-1" />
                        Confirmado
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={resendVerificationMutation.isPending}
                        onClick={() => resendVerificationMutation.mutate()}
                        data-testid="button-resend-verification"
                      >
                        {resendVerificationMutation.isPending ? 'Enviando…' : 'Confirmar correo'}
                      </Button>
                    )}
                  </div>

                  <Form {...passwordForm}>
                    <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
                      <FormField
                        control={passwordForm.control}
                        name="currentPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contraseña Actual</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} data-testid="input-current-password" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={passwordForm.control}
                        name="newPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nueva Contraseña</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} data-testid="input-new-password" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={passwordForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirmar Nueva Contraseña</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="••••••••" {...field} data-testid="input-confirm-password" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        disabled={changePasswordMutation.isPending}
                        className="w-full"
                        data-testid="button-change-password"
                      >
                        <Lock className="h-4 w-4 mr-2" />
                        {changePasswordMutation.isPending ? 'Cambiando...' : 'Cambiar Contraseña'}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>

              </CardContent>
            </Tabs>
          </Card>
        </div>

        {/* Activity Stats */}
        {userStats && (
          <Card>
            <CardHeader>
              <CardTitle>Estadísticas de Actividad</CardTitle>
              <CardDescription>
                Resumen de su actividad en el sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600" data-testid="stat-logins">
                    {userStats.totalLogins || 0}
                  </div>
                  <p className="text-sm text-gray-600">Inicios de sesión</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600" data-testid="stat-actions">
                    {userStats.actionsPerformed || 0}
                  </div>
                  <p className="text-sm text-gray-600">Acciones realizadas</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600" data-testid="stat-last-login">
                    {userStats.lastLogin ? new Date(userStats.lastLogin).toLocaleDateString('es-PE') : 'N/A'}
                  </div>
                  <p className="text-sm text-gray-600">Último acceso</p>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600" data-testid="stat-complaints-managed">
                    {userStats.complaintsManaged || 0}
                  </div>
                  <p className="text-sm text-gray-600">Reclamos gestionados</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Zona de riesgo: abandonar la app para siempre */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-red-700">
              <Trash2 className="h-5 w-5" aria-hidden="true" />
              Zona de riesgo
            </CardTitle>
            <CardDescription className="leading-relaxed">
              Eliminar su cuenta es permanente: se borra su usuario y se cierran todas sus sesiones.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-xl text-sm text-gray-600">
              ¿Abandonar LibroDigital.pe? Se eliminará <strong>{user?.email}</strong>.
              {isLastAdministrator && business
                ? ` Usted es el último administrador de ${business.businessName}, así que debe cerrar también la empresa.`
                : ''}
            </p>
            <Button
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
              disabled={!user}
              onClick={() => {
                setDeleteConfirmation('');
                setCloseCompanyToo(false);
                setDeleteAccountOpen(true);
              }}
              data-testid="button-delete-account"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar mi cuenta
            </Button>
          </CardContent>
        </Card>

        <AlertDialog
          open={deleteAccountOpen}
          onOpenChange={(open) => {
            setDeleteAccountOpen(open);
            if (!open) {
              setDeleteConfirmation('');
              setCloseCompanyToo(false);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar mi cuenta</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 leading-relaxed">
                <span className="block">
                  Se elimina <strong>{user?.email}</strong> y se cierran todas sus sesiones. Esta
                  acción no se puede deshacer.
                </span>
                <span className="block">
                  Los reclamos ya registrados y el historial de la empresa se conservan (obligación
                  legal de 2 años); su usuario, no.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>

            {isLastAdministrator && business && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <input
                  id="close-company-too"
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={closeCompanyToo}
                  onChange={(event) => setCloseCompanyToo(event.target.checked)}
                  data-testid="checkbox-close-company-too"
                />
                <label htmlFor="close-company-too" className="leading-relaxed">
                  Cerrar también <strong>{business.businessName}</strong>: su Libro de Reclamaciones
                  sale de línea, no se le cobrará más y los reclamos que tenga se conservan 2 años por
                  obligación legal.
                </label>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="delete-account-confirmation">Escriba ELIMINAR para confirmar</Label>
              <Input
                id="delete-account-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                placeholder="ELIMINAR"
                data-testid="input-delete-confirmation"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-account">
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={
                  deleteAccountMutation.isPending
                  || deleteConfirmation.trim().toUpperCase() !== 'ELIMINAR'
                  || (isLastAdministrator && !closeCompanyToo)
                }
                onClick={(event) => {
                  event.preventDefault();
                  deleteAccountMutation.mutate();
                }}
                data-testid="button-confirm-delete-account"
              >
                {deleteAccountMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Eliminando…
                  </>
                ) : (
                  'Eliminar mi cuenta'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}
