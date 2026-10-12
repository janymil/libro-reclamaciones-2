import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BusinessSummary, UserSummary } from '@/lib/api-types';
import { apiRequest } from '@/lib/queryClient';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Users, Mail, Shield, MoreVertical, UserCheck, UserX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

const createUserSchema = z.object({
  username: z.string().min(3, 'Usuario debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Contraseña debe tener al menos 6 caracteres'),
  role: z.enum(['admin', 'user', 'viewer']),
  businessId: z.string().min(1, 'Seleccione una empresa'),
});

type CreateUser = z.infer<typeof createUserSchema>;

export default function UsersPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users, isLoading } = useQuery<UserSummary[]>({
    queryKey: ['/api/users'],
  });

  const { data: businesses } = useQuery<BusinessSummary[]>({
    queryKey: ['/api/businesses'],
  });

  const form = useForm<CreateUser>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      role: 'user',
      businessId: '',
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUser) => {
      return apiRequest('/api/users', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: "Usuario creado",
        description: "El usuario se ha registrado exitosamente.",
      });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo crear el usuario. Intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return apiRequest(`/api/users/${userId}/status`, 'PATCH', { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: "Estado actualizado",
        description: "El estado del usuario se ha actualizado.",
      });
    },
  });

  const onSubmit = (data: CreateUser) => {
    createUserMutation.mutate(data);
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'user': return 'Usuario';
      case 'viewer': return 'Visualizador';
      default: return role;
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'user': return 'bg-blue-100 text-blue-800';
      case 'viewer': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="users-title">
              Gestión de Usuarios
            </h1>
            <p className="text-gray-600">
              Administra los usuarios del sistema y sus permisos
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2" data-testid="button-add-user">
                <Plus className="h-4 w-4" />
                Nuevo Usuario
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                <DialogDescription>
                  Complete la información del usuario para crear una nueva cuenta.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre de Usuario</FormLabel>
                        <FormControl>
                          <Input placeholder="usuario123" {...field} data-testid="input-username" />
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
                          <Input type="email" placeholder="usuario@empresa.com" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contraseña</FormLabel>
                        <FormControl>
                          <Input type="password" placeholder="••••••••" {...field} data-testid="input-password" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rol</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-role">
                              <SelectValue placeholder="Seleccionar rol" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="admin">Administrador</SelectItem>
                            <SelectItem value="user">Usuario</SelectItem>
                            <SelectItem value="viewer">Visualizador</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="businessId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Empresa</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-business">
                              <SelectValue placeholder="Seleccionar empresa" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {businesses?.map((business) => (
                              <SelectItem key={business.id} value={business.id}>
                                {business.businessName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                      disabled={createUserMutation.isPending}
                      data-testid="button-save-user"
                    >
                      {createUserMutation.isPending ? 'Creando...' : 'Crear Usuario'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>Usuarios del Sistema</CardTitle>
            <CardDescription>
              Gestiona los usuarios registrados y sus permisos de acceso
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center space-x-4 animate-pulse">
                    <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                      <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                    </div>
                    <div className="h-6 bg-gray-200 rounded w-20"></div>
                    <div className="h-8 w-8 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            ) : users?.length ? (
              <div className="space-y-4">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-center space-x-4">
                      <Avatar>
                        <AvatarFallback>{getInitials(`${user.firstName} ${user.lastName}`.trim() || user.email)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="font-medium" data-testid={`user-name-${user.id}`}>{`${user.firstName} ${user.lastName}`.trim() || user.email}</h4>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Mail className="h-3 w-3" />
                          <span>{user.email}</span>
                        </div>
                        <p className="text-sm text-gray-500">{user.businessName}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Badge className={getRoleColor(user.role)} data-testid={`user-role-${user.id}`}>
                        <Shield className="h-3 w-3 mr-1" />
                        {getRoleLabel(user.role)}
                      </Badge>
                      <Badge 
                        variant={user.isActive ? 'default' : 'secondary'} 
                        data-testid={`user-status-${user.id}`}
                      >
                        {user.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                      <div className="flex space-x-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleUserStatusMutation.mutate({
                            userId: user.id,
                            isActive: !user.isActive
                          })}
                          data-testid={`button-toggle-${user.id}`}
                        >
                          {user.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </Button>
                        <Button variant="outline" size="sm" data-testid={`button-more-${user.id}`}>
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No hay usuarios registrados</h3>
                <p className="text-gray-600 mb-4">Comience agregando usuarios al sistema.</p>
                <Button onClick={() => setIsDialogOpen(true)} data-testid="button-add-first-user">
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar Primer Usuario
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}