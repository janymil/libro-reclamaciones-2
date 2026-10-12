import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
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
import { Plus, Building2, MapPin, Users, Settings, Save } from 'lucide-react';
import { insertBusinessSchema, type InsertBusiness } from '@shared/schema';
import type { BusinessSummary } from '@/lib/api-types';
import { useToast } from '@/hooks/use-toast';

export default function Businesses() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [manageTarget, setManageTarget] = useState<BusinessSummary | null>(null);
  const [manageForm, setManageForm] = useState<Partial<InsertBusiness>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: businesses, isLoading } = useQuery<BusinessSummary[]>({
    queryKey: ['/api/businesses'],
  });

  const form = useForm<InsertBusiness>({
    resolver: zodResolver(insertBusinessSchema.extend({
      ruc: insertBusinessSchema.shape.ruc.min(11, 'RUC debe tener 11 dígitos'),
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
      subscriptionPlan: 'basic',
      isActive: true,
    },
  });

  const createBusinessMutation = useMutation({
    mutationFn: async (data: InsertBusiness) => {
      return apiRequest('/api/businesses', 'POST', data);
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
      toast({
        title: "Error",
        description: "No se pudo crear la empresa. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertBusiness) => {
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="businesses-title">
              Gestión de Empresas
            </h1>
            <p className="text-gray-600">
              Administra las empresas registradas en el sistema
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2" data-testid="button-add-business">
                <Plus className="h-4 w-4" />
                Nueva Empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
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
                      name="subscriptionPlan"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Plan</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-business-plan">
                                <SelectValue placeholder="Seleccionar plan" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="basic">Básico</SelectItem>
                              <SelectItem value="professional">Profesional</SelectItem>
                              <SelectItem value="enterprise">Empresarial</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openManage(business)}
                      data-testid={`button-manage-${business.id}`}
                    >
                      <Settings className="h-4 w-4 mr-1" />
                      Gestionar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No hay empresas registradas</h3>
              <p className="text-gray-600 mb-4">Comience registrando su primera empresa en el sistema.</p>
              <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-first-business">
                <Plus className="h-4 w-4 mr-2" />
                Registrar Primera Empresa
              </Button>
            </div>
          )}
        </div>
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


      </div>
    </AppLayout>
  );
}