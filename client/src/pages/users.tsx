import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { BusinessSummary, UserSummary } from '@/lib/api-types';
import { apiRequest, apiErrorMessage } from '@/lib/queryClient';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation } from 'wouter';
import { Plus, Users, Mail, Shield, MoreVertical, UserCheck, UserX, Trash2, Loader2, User, Lock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useUpgradeToast } from '@/hooks/use-plan-upgrade';
import { useSubscription } from '@/hooks/use-subscription';
import { PlanLockedAction, PlanUsageHint, planLimitReason } from '@/components/subscription/plan-limit';
import { apiFieldErrors } from '@/lib/plan-errors';
import { useAuth } from '@/hooks/use-auth';
import { MIN_PASSWORD_LENGTH } from '@shared/schema';
import { z } from 'zod';

const createUserSchema = z.object({
  username: z.string().min(3, 'Usuario debe tener al menos 3 caracteres'),
  email: z.string().email('Email inválido'),
  // Same floor as the server (MIN_PASSWORD_LENGTH): a shorter password used to
  // pass the dialog and come back as a bare "Datos inválidos".
  password: z.string().min(MIN_PASSWORD_LENGTH, `Contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`),
  role: z.enum(['admin', 'user', 'viewer']),
  businessId: z.string().min(1, 'Seleccione una empresa'),
});

type CreateUser = z.infer<typeof createUserSchema>;
type DeletableUser = Pick<UserSummary, 'id' | 'email' | 'firstName' | 'lastName'>;

export default function UsersPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  // Set when an admin picked "Eliminar" on the three-dots menu.
  const [deleteTarget, setDeleteTarget] = useState<DeletableUser | null>(null);
  const { toast } = useToast();
  const upgradeToast = useUpgradeToast();
  const queryClient = useQueryClient();

  // User administration is an admin-only capability server-side
  // (POST /api/users, PATCH /api/users/:id/status). Non-admins see the roster
  // read-only instead of buttons that would answer 403.
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';
  const adminOnlyHint = 'Solo un administrador puede gestionar usuarios';
  const [, setLocation] = useLocation();

  const { data: users, isLoading } = useQuery<UserSummary[]>({
    queryKey: ['/api/users'],
  });

  const { data: businesses } = useQuery<BusinessSummary[]>({
    queryKey: ['/api/businesses'],
  });

  // Plan quota on team members. Shown BEFORE the click: a free account allows
  // exactly one user, so the action is disabled and explains itself on hover
  // instead of failing after a completed form.
  const { data: subscription } = useSubscription();
  const userLimit = subscription?.plan.limits.users ?? null;
  const usersUsed = subscription?.usage.users ?? users?.length ?? 0;
  const atUserLimit = userLimit !== null && usersUsed >= userLimit;
  const userLimitReason = atUserLimit
    ? planLimitReason(subscription?.plan.name ?? null, userLimit as number, 'usuario(s)')
    : '';

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
      return apiRequest('POST', '/api/users', data);
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
      // A rejected form must name the field, not shrug with "Datos inválidos".
      const fieldErrors = apiFieldErrors(error);
      if (fieldErrors.length) {
        toast({
          title: 'Revisa los datos del usuario',
          description: fieldErrors.join(' · '),
          variant: 'destructive',
        });
        return;
      }

      // A plan limit (e.g. Básico = 2 usuarios) must say so and offer the
      // upgrade, not fade into a generic "intente nuevamente".
      upgradeToast(error, 'No se pudo crear el usuario');
    },
  });

  const toggleUserStatusMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return apiRequest('PATCH', `/api/users/${userId}/status`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      toast({
        title: "Estado actualizado",
        description: "El estado del usuario se ha actualizado.",
      });
    },
  });

  // Removing a team member is permanent for that login: the account is deleted,
  // not deactivated (the server refuses to remove the last administrator, which
  // would leave the tenant with nobody able to manage it).
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await apiRequest('DELETE', `/api/users/${userId}`);
      return response.json();
    },
    onSuccess: (data: { message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
      setDeleteTarget(null);
      toast({
        title: "Usuario eliminado",
        description: data?.message || "La cuenta ya no tiene acceso al sistema.",
      });
    },
    onError: (error) => {
      toast({
        title: "No se pudo eliminar el usuario",
        description: apiFieldErrors(error).join(' · ') || apiErrorMessage(error),
        variant: "destructive",
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="users-title">
              Gestión de Usuarios
            </h1>
            <p className="text-gray-600">
              Administra los usuarios del sistema y sus permisos
            </p>
            <PlanUsageHint
              label="Usuarios"
              used={usersUsed}
              limit={userLimit}
              planName={subscription?.plan.name ?? null}
            />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <PlanLockedAction locked={atUserLimit} reason={userLimitReason}>
              <DialogTrigger asChild>
                <Button
                  className="flex items-center gap-2"
                  data-testid="button-add-user"
                  disabled={!isAdmin || atUserLimit}
                  title={isAdmin ? (atUserLimit ? userLimitReason : undefined) : adminOnlyHint}
                >
                  <Plus className="h-4 w-4" />
                  Nuevo Usuario
                </Button>
              </DialogTrigger>
            </PlanLockedAction>
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
                        <p className="text-xs text-gray-500">
                          Mínimo {MIN_PASSWORD_LENGTH} caracteres.
                        </p>
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
                        {/* Deactivating yourself makes no sense, and a disabled icon
                            with no tooltip reads as a broken button: hide it. */}
                        {isAdmin && user.id !== currentUser?.id && (
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
                        )}

                        {/* The menu ALWAYS opens: on your own row it offers the
                            self-service actions, on somebody else's the
                            administrative ones. A disabled trigger with nothing
                            behind it is what made this look broken. */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              aria-label="Más opciones"
                              data-testid={`button-more-${user.id}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {user.id === currentUser?.id ? (
                              <>
                                <DropdownMenuLabel>Mi cuenta</DropdownMenuLabel>
                                <DropdownMenuItem
                                  onSelect={() => setLocation('/perfil')}
                                  data-testid={`menu-my-profile-${user.id}`}
                                >
                                  <User className="mr-2 h-4 w-4" />
                                  Mi perfil
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => setLocation('/perfil')}>
                                  <Lock className="mr-2 h-4 w-4" />
                                  Cambiar mi contraseña
                                </DropdownMenuItem>
                              </>
                            ) : isAdmin ? (
                              <>
                                <DropdownMenuLabel>Gestionar acceso</DropdownMenuLabel>
                                <DropdownMenuItem
                                  onSelect={() => toggleUserStatusMutation.mutate({
                                    userId: user.id,
                                    isActive: !user.isActive,
                                  })}
                                >
                                  {user.isActive ? (
                                    <>
                                      <UserX className="mr-2 h-4 w-4" />
                                      Desactivar
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="mr-2 h-4 w-4" />
                                      Activar
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onSelect={() => setDeleteTarget({
                                    id: user.id,
                                    email: user.email,
                                    firstName: user.firstName,
                                    lastName: user.lastName,
                                  })}
                                  className="text-red-600 focus:text-red-700"
                                  data-testid={`menu-delete-${user.id}`}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Eliminar usuario…
                                </DropdownMenuItem>
                              </>
                            ) : (
                              <>
                                <DropdownMenuLabel>Sin acciones</DropdownMenuLabel>
                                <DropdownMenuItem disabled>{adminOnlyHint}</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                <PlanLockedAction locked={atUserLimit} reason={userLimitReason}>
                  <Button
                    onClick={() => setIsDialogOpen(true)}
                    disabled={!isAdmin || atUserLimit}
                    title={isAdmin ? (atUserLimit ? userLimitReason : undefined) : adminOnlyHint}
                    data-testid="button-add-first-user"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar Primer Usuario
                  </Button>
                </PlanLockedAction>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deleting a login is permanent: confirm it in words, not in a toast. */}
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este usuario?</AlertDialogTitle>
              <AlertDialogDescription>
                Se elimina la cuenta <strong>{deleteTarget?.email}</strong> y su acceso al sistema,
                de forma permanente. Los reclamos y su historial se conservan; si vuelve a
                necesitar acceso, habrá que crearle un usuario nuevo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete-user">Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                disabled={deleteUserMutation.isPending}
                onClick={(event) => {
                  // Keep the dialog open while the request is in flight; it is
                  // closed by the mutation's own success/error handling.
                  event.preventDefault();
                  if (deleteTarget) deleteUserMutation.mutate(deleteTarget.id);
                }}
                data-testid="button-confirm-delete-user"
              >
                {deleteUserMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Eliminando…
                  </>
                ) : (
                  'Eliminar usuario'
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}