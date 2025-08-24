import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Building2, MapPin, Users, Settings } from 'lucide-react';
import { insertBusinessSchema, type InsertBusiness } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';

export default function Businesses() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: businesses, isLoading } = useQuery({
    queryKey: ['/api/businesses'],
  });

  const form = useForm<InsertBusiness>({
    resolver: zodResolver(insertBusinessSchema.extend({
      ruc: insertBusinessSchema.shape.ruc.min(11, 'RUC debe tener 11 dígitos'),
    })),
    defaultValues: {
      name: '',
      ruc: '',
      address: '',
      phone: '',
      email: '',
      legalRepresentative: '',
      businessSector: '',
      subscriptionStatus: 'active',
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
                      name="name"
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
                            <Input placeholder="+51 999 999 999" {...field} data-testid="input-business-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="contacto@empresa.com" {...field} data-testid="input-business-email" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="legalRepresentative"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Representante Legal</FormLabel>
                          <FormControl>
                            <Input placeholder="Nombre completo" {...field} data-testid="input-legal-representative" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="businessSector"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sector Empresarial</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-business-sector">
                                <SelectValue placeholder="Seleccionar sector" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="retail">Retail</SelectItem>
                              <SelectItem value="services">Servicios</SelectItem>
                              <SelectItem value="manufacturing">Manufactura</SelectItem>
                              <SelectItem value="technology">Tecnología</SelectItem>
                              <SelectItem value="healthcare">Salud</SelectItem>
                              <SelectItem value="finance">Finanzas</SelectItem>
                              <SelectItem value="education">Educación</SelectItem>
                              <SelectItem value="other">Otro</SelectItem>
                            </SelectContent>
                          </Select>
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
            businesses.map((business: any) => (
              <Card key={business.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2" data-testid={`business-name-${business.id}`}>
                        <Building2 className="h-5 w-5" />
                        {business.name}
                      </CardTitle>
                      <CardDescription>RUC: {business.ruc}</CardDescription>
                    </div>
                    <Badge 
                      variant={business.subscriptionStatus === 'active' ? 'default' : 'secondary'}
                      data-testid={`business-status-${business.id}`}
                    >
                      {business.subscriptionStatus === 'active' ? 'Activo' : 'Inactivo'}
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
                    <span>{business.legalRepresentative}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-sm font-medium text-blue-600">
                      {business.establishmentCount || 0} sucursales
                    </span>
                    <Button variant="outline" size="sm" data-testid={`button-manage-${business.id}`}>
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
      </div>
    </AppLayout>
  );
}