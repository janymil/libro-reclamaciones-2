import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { User, Mail, Phone, MapPin, Calendar, Lock, Save, Shield } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

const profileSchema = z.object({
  email: z.string().email('Email inválido'),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  address: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual requerida'),
  newPassword: z.string().min(6, 'Nueva contraseña debe tener al menos 6 caracteres'),
  confirmPassword: z.string().min(1, 'Confirme la nueva contraseña'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function Profile() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ['/api/auth/user'],
  });

  const { data: userStats } = useQuery({
    queryKey: ['/api/users/stats'],
  });

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    values: {
      email: user?.email || '',
      phone: user?.phone || '',
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      address: user?.address || '',
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

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      return apiRequest('/api/users/profile', 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: "Perfil actualizado",
        description: "Su información se ha guardado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "No se pudo actualizar el perfil. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordForm) => {
      return apiRequest('/api/users/change-password', 'POST', data);
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

  const onProfileSubmit = (data: ProfileForm) => {
    updateProfileMutation.mutate(data);
  };

  const onPasswordSubmit = (data: PasswordForm) => {
    changePasswordMutation.mutate(data);
  };

  const getInitials = (firstName?: string, lastName?: string, username?: string) => {
    if (firstName && lastName) {
      return (firstName[0] + lastName[0]).toUpperCase();
    }
    if (username) {
      return username.slice(0, 2).toUpperCase();
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="profile-title">
              Mi Perfil
            </h1>
            <p className="text-gray-600">
              Gestione su información personal y configuración de cuenta
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Profile Summary */}
          <Card className="lg:col-span-1">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <Avatar className="h-20 w-20">
                  <AvatarFallback className="text-lg">
                    {getInitials(user?.firstName, user?.lastName, user?.username)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <CardTitle data-testid="user-name">
                {user?.firstName && user?.lastName 
                  ? `${user.firstName} ${user.lastName}`
                  : user?.username || 'Usuario'
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
                <Badge variant="default">Activo</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Empresa</span>
                <span className="text-sm font-medium">{user?.businessName || 'N/A'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="h-4 w-4" />
                <span>Miembro desde {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('es-PE') : 'N/A'}</span>
              </div>
            </CardContent>
          </Card>

          {/* Profile Forms */}
          <Card className="lg:col-span-2">
            <Tabs defaultValue="profile" className="w-full">
              <CardHeader>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="profile" data-testid="tab-profile">Información Personal</TabsTrigger>
                  <TabsTrigger value="security" data-testid="tab-security">Seguridad</TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent>
                <TabsContent value="profile" className="space-y-6">
                  <Form {...profileForm}>
                    <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={profileForm.control}
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
                          control={profileForm.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Apellidos</FormLabel>
                              <FormControl>
                                <Input placeholder="Apellidos" {...field} data-testid="input-last-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={profileForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input type="email" placeholder="email@ejemplo.com" {...field} data-testid="input-email" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={profileForm.control}
                        name="phone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Teléfono</FormLabel>
                            <FormControl>
                              <Input placeholder="+51 999 999 999" {...field} data-testid="input-phone" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={profileForm.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dirección</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Dirección completa" {...field} data-testid="input-address" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button 
                        type="submit" 
                        disabled={updateProfileMutation.isPending}
                        className="w-full"
                        data-testid="button-save-profile"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        {updateProfileMutation.isPending ? 'Guardando...' : 'Guardar Cambios'}
                      </Button>
                    </form>
                  </Form>
                </TabsContent>

                <TabsContent value="security" className="space-y-6">
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
      </div>
    </AppLayout>
  );
}