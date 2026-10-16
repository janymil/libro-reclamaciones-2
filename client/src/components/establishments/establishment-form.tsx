import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useUpgradeToast } from "@/hooks/use-plan-upgrade";
import { establishmentFormSchema, type EstablishmentFormData } from "@/lib/validation";
import { apiRequest } from "@/lib/queryClient";
import type { Establishment } from "@shared/schema";

interface EstablishmentFormProps {
  establishment?: Establishment;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function EstablishmentForm({
  establishment,
  onSuccess,
  onCancel
}: EstablishmentFormProps) {
  const { toast } = useToast();
  const upgradeToast = useUpgradeToast();
  const queryClient = useQueryClient();

  const form = useForm<EstablishmentFormData>({
    resolver: zodResolver(establishmentFormSchema),
    defaultValues: {
      name: establishment?.name || "",
      address: establishment?.address || "",
      phone: establishment?.phone || "",
      email: establishment?.email || "",
      identificationCode: establishment?.identificationCode || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: EstablishmentFormData) => {
      const response = await apiRequest('POST', '/api/establishments', data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/establishments'] });
      toast({
        title: "Establecimiento creado",
        description: "El establecimiento ha sido registrado exitosamente",
      });
      form.reset();
      onSuccess?.();
    },
    onError: (error) => {
      // Reaching the plan's locale limit must explain itself and offer the
      // upgrade, instead of a generic "hubo un problema".
      upgradeToast(error, 'No se pudo registrar el establecimiento');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: EstablishmentFormData) => {
      const response = await apiRequest('PATCH', `/api/establishments/${establishment!.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/establishments'] });
      toast({
        title: "Establecimiento actualizado",
        description: "Los cambios han sido guardados exitosamente",
      });
      onSuccess?.();
    },
    onError: () => {
      toast({
        title: "Error al actualizar establecimiento",
        description: "Hubo un problema al guardar los cambios",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EstablishmentFormData) => {
    if (establishment) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Card data-testid="establishment-form">
      <CardHeader>
        <CardTitle>
          {establishment ? 'Editar Establecimiento' : 'Nuevo Establecimiento'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <Label htmlFor="name">Nombre del Establecimiento *</Label>
            <Input
              id="name"
              {...form.register("name")}
              data-testid="input-establishment-name"
            />
            {form.formState.errors.name && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div>
            <Label htmlFor="address">Dirección *</Label>
            <Input
              id="address"
              {...form.register("address")}
              data-testid="input-establishment-address"
            />
            {form.formState.errors.address && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.address.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                type="tel"
                {...form.register("phone")}
                data-testid="input-establishment-phone"
              />
              {form.formState.errors.phone && (
                <p className="text-sm text-red-600 mt-1">{form.formState.errors.phone.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                data-testid="input-establishment-email"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-red-600 mt-1">{form.formState.errors.email.message}</p>
              )}
            </div>
          </div>

          <div>
            <Label htmlFor="identificationCode">Código de Identificación *</Label>
            <Input
              id="identificationCode"
              {...form.register("identificationCode")}
              placeholder="Código único para este establecimiento"
              data-testid="input-identification-code"
            />
            {form.formState.errors.identificationCode && (
              <p className="text-sm text-red-600 mt-1">{form.formState.errors.identificationCode.message}</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Este código se usará para correlacionar reclamaciones según DS 011-2011-PCM
            </p>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button
              type="submit"
              disabled={isLoading}
              className="btn-primary"
              data-testid="button-save-establishment"
            >
              {isLoading ? "Guardando..." : establishment ? "Actualizar" : "Crear Establecimiento"}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
