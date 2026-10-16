import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, apiErrorMessage } from '@/lib/queryClient';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Building2, MapPin, Users, Settings, Save, MailQuestion, CheckCircle2, XCircle, Loader2, Trash2 } from 'lucide-react';
import { businessProfileSchema, type BusinessProfile, type InsertBusiness } from '@shared/schema';
import type { BusinessSummary } from '@/lib/api-types';
import { useToast } from '@/hooks/use-toast';
import { useUpgradeToast } from '@/hooks/use-plan-upgrade';
import { useSubscription } from '@/hooks/use-subscription';
import { PlanLockedAction, PlanUsageHint, planLimitReason } from '@/components/subscription/plan-limit';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/use-auth';

export default function Businesses() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [manageTarget, setManageTarget] = useState<BusinessSummary | null>(null);
  const [manageForm, setManageForm] = useState<Partial<InsertBusiness>>({});
  const { toast } = useToast();
  const upgradeToast = useUpgradeToast();
  const queryClient = useQueryClient();

  // Creating and editing a tenant is admin-only server-side
  // (POST /api/businesses, PATCH /api/businesses/:id).
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const adminOnlyHint = 'Solo un administrador puede gestionar empresas';

  const { data: businesses, isLoading } = useQuery<BusinessSummary[]>({
    queryKey: ['/api/businesses'],
  });

  // Plan quota on RUCs (gratis/básico = 1, pro = 2, empresarial = 5). Shown
  // BEFORE the click so a free account never completes a form it cannot submit.
  const { data: subscription } = useSubscription();
  const businessLimit = subscription?.plan.limits.businesses ?? null;
  const businessesUsed = subscription?.usage.businesses ?? businesses?.length ?? 0;
  const atBusinessLimit = businessLimit !== null && businessesUsed >= businessLimit;
  const businessLimitReason = atBusinessLimit
    ? planLimitReason(subscription?.plan.name ?? null, businessLimit as number, 'empresa(s) (RUC)')
    : '';

  // Set when the admin starts "Cerrar empresa" on a card.
  const [closeTarget, setCloseTarget] = useState<BusinessSummary | null>(null);
  const [closeConfirmation, setCloseConfirmation] = useState('');

  // Exactly the shape the server accepts (businessProfileSchema). Plan,
  // subscription status, trial dates and isActive are server-assigned, so the
  // form does not carry them at all - a legacy `subscriptionPlan: 'basic'`
  // default used to travel in every create request.
  const form = useForm<BusinessProfile>({
    resolver: zodResolver(businessProfileSchema.extend({
      ruc: businessProfileSchema.shape.ruc.min(11, 'RUC debe tener 11 dígitos'),
    })),
    defaultValues: {
      ruc: '',
      businessName: '',
      commercialName: '',
      phone: '',
      address: '',
      distrito: '',
      provincia: '',
      departamento: '',
      website: '',
    },
  });

  const createBusinessMutation = useMutation({
    mutationFn: async (data: BusinessProfile) => {
      return apiRequest('POST', '/api/businesses', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/businesses'] });
      toast({
        title: "Empresa creada",
        description: "La empresa se ha registrado exitosamente.",
      });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      const raw = error instanceof Error ? error.message : '';

      // RUC already registered: not a plan problem, and no longer a dead end.
      if (raw.includes('ruc_already_registered')) {
        let businessName = 'otra cuenta';
        try {
          const body = JSON.parse(raw.replace(/^\d{3}:\s*/, ''));
          if (body?.businessName) businessName = body.businessName;
        } catch {
          // Not our JSON envelope: the generic wording is fine.
        }
        setTakenRuc({ ruc: form.getValues('ruc'), businessName });
        return;
      }

      // The number of RUCs a login may manage is a plan limit.
      upgradeToast(error, 'No se pudo crear la empresa');
    },
  });

  const onSubmit = (data: BusinessProfile) => {
    createBusinessMutation.mutate(data);
  };

  const manageMutation = useMutation({
    mutationFn: async () => {
      if (!manageTarget) return null;
      const response = await apiRequest('PATCH', `/api/businesses/${manageTarget.id}`, manageForm);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/businesses'] });
      toast({
        title: "Empresa actualizada",
        description: "Los datos de la empresa se guardaron correctamente.",
      });
      setManageTarget(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudieron guardar los cambios. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  // "Cerrar empresa": the customer abandons the app. The server decides what
  // happens to the data (a tenant with no complaints is erased; one with records
  // keeps them for the legal 2-year retention), so the dialog explains both
  // outcomes instead of promising a deletion it may not perform.
  const closeBusinessMutation = useMutation({
    mutationFn: async (businessId: string) => {
      const response = await apiRequest('POST', `/api/businesses/${businessId}/close`);
      return response.json() as Promise<{ message: string; purged: boolean; complaintCount: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/businesses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/businesses/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/businesses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
      setCloseTarget(null);
      setCloseConfirmation('');
      toast({
        title: data.purged ? 'Empresa eliminada' : 'Empresa cerrada',
        description: data.message,
      });
    },
    onError: (error) => {
      toast({
        title: 'No se pudo cerrar la empresa',
        description: apiErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const openManage = (business: BusinessSummary) => {
    setManageTarget(business);
    setManageForm({
      businessName: business.businessName,
      commercialName: business.commercialName ?? '',
      phone: business.phone ?? '',
      address: business.address,
      distrito: business.distrito,
      provincia: business.provincia,
      departamento: business.departamento,
      website: business.website ?? '',
      isActive: business.isActive,
    });
  };

  // ---- Access requests (duplicate RUC) --------------------------------------
  // A RUC belongs to one tenant. The second legitimate person - the accountant
  // of a client, a new partner, staff turnover - asks here, and an administrator
  // of that tenant approves or rejects.

  interface AccessRequestSummary {
    id: string;
    businessName: string;
    ruc: string;
    requesterEmail: string;
    requesterName: string | null;
    message: string | null;
    status: string;
    createdAt: string;
  }

  // Incoming: only an admin of the target tenant may see or decide these.
  const { data: incomingRequests } = useQuery<AccessRequestSummary[]>({
    queryKey: ['/api/businesses/access-requests'],
    enabled: isAdmin,
  });

  // Sent by this login, so it can follow up on its own request.
  const { data: myRequests } = useQuery<AccessRequestSummary[]>({
    queryKey: ['/api/businesses/access-requests/mine'],
  });

  const pendingIncoming = (incomingRequests ?? []).filter((r) => r.status === 'pending');

  // Set when the create dialog hit a RUC that already exists, so the page can
  // offer "solicitar acceso" instead of a dead end.
  const [takenRuc, setTakenRuc] = useState<{ ruc: string; businessName: string } | null>(null);

  const decideMutation = useMutation({
    mutationFn: async (input: { id: string; action: 'approve' | 'reject' }) => {
      const response = await apiRequest(
        'POST',
        `/api/businesses/access-requests/${input.id}/${input.action}`,
      );
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/businesses/access-requests'] });
      queryClient.invalidateQueries({ queryKey: ['/api/businesses/access-requests/mine'] });
      queryClient.invalidateQueries({ queryKey: ['/api/businesses'] });
      toast({ title: 'Solicitud atendida', description: data.message });
    },
    onError: (error) => {
      toast({
        title: 'No se pudo atender la solicitud',
        description: apiErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const requestAccessMutation = useMutation({
    mutationFn: async (ruc: string) => {
      const response = await apiRequest('POST', '/api/businesses/access-requests', { ruc });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/businesses/access-requests/mine'] });
      toast({ title: 'Solicitud enviada', description: data.message });
      setTakenRuc(null);
    },
    onError: (error) => {
      toast({
        title: 'No se pudo enviar la solicitud',
        description: apiErrorMessage(error),
        variant: 'destructive',
      });
    },
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="businesses-title">
              Gestión de Empresas
            </h1>
            <p className="text-gray-600">
              Administra las empresas registradas en el sistema
            </p>
            <PlanUsageHint
              label="Empresas (RUCs)"
              used={businessesUsed}
              limit={businessLimit}
              planName={subscription?.plan.name ?? null}
            />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <PlanLockedAction locked={atBusinessLimit} reason={businessLimitReason}>
              <DialogTrigger asChild>
                <Button
                  className="flex items-center gap-2"
                  data-testid="button-add-business"
                  disabled={!isAdmin || atBusinessLimit}
                  title={isAdmin ? (atBusinessLimit ? businessLimitReason : undefined) : adminOnlyHint}
                >
                  <Plus className="h-4 w-4" />
                  Nueva Empresa
                </Button>
              </DialogTrigger>
            </PlanLockedAction>
            <DialogContent className="max-w-2xl">
              {takenRuc && (
                <div
                  role="alert"
                  data-testid="notice-ruc-taken"
                  className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
                >
                  <p className="font-medium">
                    El RUC {takenRuc.ruc} ya está registrado en {takenRuc.businessName}.
                  </p>
                  <p className="mt-1">
                    Un RUC solo puede tener una empresa registrada. Si trabajas en esa empresa, solicita
                    acceso: el administrador actual recibirá tu pedido y deberá aprobarlo.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-3"
                    disabled={requestAccessMutation.isPending}
                    onClick={() => requestAccessMutation.mutate(takenRuc.ruc)}
                    data-testid="button-request-access"
                  >
                    {requestAccessMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Enviando…
                      </>
                    ) : (
                      <>
                        <MailQuestion className="h-4 w-4 mr-2" />
                        Solicitar acceso a esta empresa
                      </>
                    )}
                  </Button>
                </div>
              )}
              <DialogHeader>
                <DialogTitle>Registrar Nueva Empresa</DialogTitle>
                <DialogDescription>
                  Complete la información de la empresa para el registro en el sistema.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="businessName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Razón Social</FormLabel>
                          <FormControl>
                            <Input placeholder="Nombre de la empresa" {...field} data-testid="input-business-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ruc"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>RUC</FormLabel>
                          <FormControl>
                            <Input placeholder="12345678901" maxLength={11} {...field} data-testid="input-business-ruc" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Dirección</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Dirección completa de la empresa" {...field} data-testid="input-business-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Teléfono</FormLabel>
                          <FormControl>
                            <Input placeholder="+51 999 999 999" {...field} value={field.value ?? ''} data-testid="input-business-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="commercialName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Nombre Comercial</FormLabel>
                          <FormControl>
                            <Input placeholder="Nombre comercial" {...field} value={field.value ?? ''} data-testid="input-business-commercial-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="distrito"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Distrito</FormLabel>
                          <FormControl>
                            <Input placeholder="Miraflores" {...field} data-testid="input-business-distrito" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="provincia"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Provincia</FormLabel>
                          <FormControl>
                            <Input placeholder="Lima" {...field} data-testid="input-business-provincia" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="departamento"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Departamento</FormLabel>
                          <FormControl>
                            <Input placeholder="Lima" {...field} data-testid="input-business-departamento" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sitio web (opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="https://empresa.pe" {...field} value={field.value ?? ''} data-testid="input-business-website" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  </div>

                  <div className="flex justify-end space-x-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      Cancelar
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={createBusinessMutation.isPending}
                      data-testid="button-save-business"
                    >
                      {createBusinessMutation.isPending ? 'Guardando...' : 'Registrar Empresa'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Business Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="h-3 bg-gray-200 rounded"></div>
                    <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : businesses?.length ? (
            businesses.map((business) => (
              <Card key={business.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2" data-testid={`business-name-${business.id}`}>
                        <Building2 className="h-5 w-5" />
                        {business.businessName}
                      </CardTitle>
                      <CardDescription>RUC: {business.ruc}</CardDescription>
                    </div>
                    <Badge 
                      variant={business.isActive ? 'default' : 'secondary'}
                      data-testid={`business-status-${business.id}`}
                    >
                      {business.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <MapPin className="h-4 w-4" />
                    <span className="truncate">{business.address}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Users className="h-4 w-4" />
                    <span>{business.userCount || 0} usuarios</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-sm font-medium text-blue-600">
                      {business.establishmentCount || 0} sucursales
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openManage(business)}
                        disabled={!isAdmin}
                        title={isAdmin ? undefined : adminOnlyHint}
                        data-testid={`button-manage-${business.id}`}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Gestionar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => {
                          setCloseConfirmation('');
                          setCloseTarget(business);
                        }}
                        disabled={!isAdmin}
                        title={isAdmin ? 'Cerrar y eliminar esta empresa' : adminOnlyHint}
                        data-testid={`button-close-${business.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay empresas registradas</h3>
              <p className="text-gray-600 mb-4">Comience registrando su primera empresa en el sistema.</p>
              <PlanLockedAction locked={atBusinessLimit} reason={businessLimitReason}>
                <Button onClick={() => setIsDialogOpen(true)} disabled={!isAdmin || atBusinessLimit} title={isAdmin ? (atBusinessLimit ? businessLimitReason : undefined) : adminOnlyHint} data-testid="button-add-first-business">
                  <Plus className="h-4 w-4 mr-2" />
                  Registrar Primera Empresa
                </Button>
              </PlanLockedAction>
            </div>
          )}
        </div>
        {/* Solicitudes de acceso recibidas: solo un admin de la empresa destino */}
        {isAdmin && pendingIncoming.length > 0 && (
          <Card data-testid="card-incoming-access-requests">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MailQuestion className="h-5 w-5 text-amber-600" />
                Solicitudes de acceso pendientes
              </CardTitle>
              <CardDescription>
                Personas que piden administrar una empresa cuyo RUC ya está registrado. Aprobar les
                da acceso a esa empresa; rechazar no concede nada.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pendingIncoming.map((request) => (
                <div
                  key={request.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {request.requesterName ?? request.requesterEmail}
                    </p>
                    <p className="text-sm text-gray-600">{request.requesterEmail}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Solicita acceso a <strong>{request.businessName}</strong> (RUC {request.ruc})
                    </p>
                    {request.message && (
                      <p className="mt-1 text-sm italic text-gray-500">“{request.message}”</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      onClick={() => decideMutation.mutate({ id: request.id, action: 'approve' })}
                      disabled={decideMutation.isPending}
                      data-testid={`button-approve-${request.id}`}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Aprobar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => decideMutation.mutate({ id: request.id, action: 'reject' })}
                      disabled={decideMutation.isPending}
                      data-testid={`button-reject-${request.id}`}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Rechazar
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Mis solicitudes de acceso enviadas */}
        {(myRequests ?? []).length > 0 && (
          <Card data-testid="card-my-access-requests">
            <CardHeader>
              <CardTitle className="text-lg">Mis solicitudes de acceso</CardTitle>
              <CardDescription>
                El estado de los accesos que has pedido a empresas ya registradas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(myRequests ?? []).map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-gray-900">{request.businessName}</p>
                    <p className="text-gray-600">RUC {request.ruc}</p>
                  </div>
                  <Badge
                    variant={
                      request.status === 'approved'
                        ? 'default'
                        : request.status === 'pending'
                          ? 'secondary'
                          : 'destructive'
                    }
                    data-testid={`badge-access-request-${request.status}`}
                  >
                    {request.status === 'approved'
                      ? 'Aprobada'
                      : request.status === 'pending'
                        ? 'Pendiente'
                        : 'Rechazada'}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Gestionar empresa */}
        <Dialog open={!!manageTarget} onOpenChange={(open) => !open && setManageTarget(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Gestionar empresa</DialogTitle>
              <DialogDescription>
                Actualice los datos de {manageTarget?.businessName ?? 'la empresa'}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="manage-business-name">Razón social</Label>
                  <Input id="manage-business-name" value={manageForm.businessName ?? ''} onChange={(e) => setManageForm({ ...manageForm, businessName: e.target.value })} data-testid="input-manage-name" />
                </div>
                <div>
                  <Label htmlFor="manage-commercial-name">Nombre comercial</Label>
                  <Input id="manage-commercial-name" value={manageForm.commercialName ?? ''} onChange={(e) => setManageForm({ ...manageForm, commercialName: e.target.value })} data-testid="input-manage-commercial" />
                </div>
                <div>
                  <Label htmlFor="manage-phone">Teléfono</Label>
                  <Input id="manage-phone" value={manageForm.phone ?? ''} onChange={(e) => setManageForm({ ...manageForm, phone: e.target.value })} data-testid="input-manage-phone" />
                </div>
                <div>
                  <Label htmlFor="manage-website">Sitio web</Label>
                  <Input id="manage-website" value={manageForm.website ?? ''} onChange={(e) => setManageForm({ ...manageForm, website: e.target.value })} data-testid="input-manage-website" />
                </div>
              </div>

              <div>
                <Label htmlFor="manage-address">Dirección</Label>
                <Input id="manage-address" value={manageForm.address ?? ''} onChange={(e) => setManageForm({ ...manageForm, address: e.target.value })} data-testid="input-manage-address" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="manage-distrito">Distrito</Label>
                  <Input id="manage-distrito" value={manageForm.distrito ?? ''} onChange={(e) => setManageForm({ ...manageForm, distrito: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="manage-provincia">Provincia</Label>
                  <Input id="manage-provincia" value={manageForm.provincia ?? ''} onChange={(e) => setManageForm({ ...manageForm, provincia: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="manage-departamento">Departamento</Label>
                  <Input id="manage-departamento" value={manageForm.departamento ?? ''} onChange={(e) => setManageForm({ ...manageForm, departamento: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="manage-active"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={manageForm.isActive ?? true}
                  onChange={(e) => setManageForm({ ...manageForm, isActive: e.target.checked })}
                />
                <Label htmlFor="manage-active">Empresa activa</Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setManageTarget(null)}>
                Cancelar
              </Button>
              <Button className="btn-primary" onClick={() => manageMutation.mutate()} disabled={manageMutation.isPending} data-testid="button-manage-save">
                <Save className="h-4 w-4 mr-1" />
                {manageMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cerrar empresa: irreversible, so it asks for the name in writing and
            explains the two possible outcomes before the click. */}
        <AlertDialog
          open={!!closeTarget}
          onOpenChange={(open) => {
            if (!open) {
              setCloseTarget(null);
              setCloseConfirmation('');
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cerrar y eliminar {closeTarget?.businessName}</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2 leading-relaxed">
                <span className="block">
                  Se da de baja el RUC {closeTarget?.ruc}: su Libro de Reclamaciones deja de estar en
                  línea y no se le cobrará más.
                </span>
                <span className="block">
                  Si la empresa <strong>nunca recibió reclamos</strong>, se elimina todo (datos y
                  usuarios). Si <strong>tiene reclamos</strong>, estos se conservan 2 años por
                  obligación legal —usted aún puede responderlos— y se eliminan al terminar ese plazo.
                </span>
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-2">
              <Label htmlFor="close-confirmation">
                Escriba <strong>{closeTarget?.businessName}</strong> para confirmar
              </Label>
              <Input
                id="close-confirmation"
                value={closeConfirmation}
                onChange={(event) => setCloseConfirmation(event.target.value)}
                placeholder={closeTarget?.businessName ?? ''}
                data-testid="input-close-confirmation"
              />
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-close-business">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={
                  closeBusinessMutation.isPending ||
                  closeConfirmation.trim().toLowerCase() !== (closeTarget?.businessName ?? '').trim().toLowerCase()
                }
                onClick={(event) => {
                  event.preventDefault();
                  if (closeTarget) closeBusinessMutation.mutate(closeTarget.id);
                }}
                data-testid="button-confirm-close-business"
              >
                {closeBusinessMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cerrando…
                  </>
                ) : (
                  'Cerrar empresa'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </AppLayout>
  );
}