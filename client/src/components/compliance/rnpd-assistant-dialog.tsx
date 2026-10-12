import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { downloadBlob } from "@/lib/export";
import type { DataProcessingActivity } from "@shared/schema";

interface RnpdAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const emptyForm = {
  activityName: "",
  purpose: "",
  legalBasis: "",
  retentionPeriod: "",
  dataCategories: "",
  dataSubjects: "",
  securityMeasures: "",
};

/** Splits a comma separated field into the jsonb array the API expects. */
const toArray = (value: string) =>
  value.split(',').map((item) => item.trim()).filter(Boolean);

/**
 * Assistant for the Registro Nacional de Protección de Datos Personales
 * (RNPD). Maintains the register of processing activities required by Ley 29733.
 */
export default function RnpdAssistantDialog({ open, onOpenChange }: RnpdAssistantDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);

  const { data: activities = [], isLoading } = useQuery<DataProcessingActivity[]>({
    queryKey: ['/api/data-processing-activities'],
    enabled: open,
  });

  const createActivity = useMutation({
    mutationFn: async () =>
      apiRequest('POST', '/api/data-processing-activities', {
        activityName: form.activityName.trim(),
        purpose: form.purpose.trim(),
        legalBasis: form.legalBasis.trim(),
        retentionPeriod: form.retentionPeriod.trim(),
        dataCategories: toArray(form.dataCategories),
        dataSubjects: toArray(form.dataSubjects),
        securityMeasures: toArray(form.securityMeasures),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/data-processing-activities'] });
      toast({ title: "Actividad registrada", description: "El banco de datos se actualizó correctamente." });
      setForm(emptyForm);
    },
    onError: () => {
      toast({
        title: "No se pudo registrar",
        description: "Complete los campos obligatorios e intente nuevamente.",
        variant: "destructive",
      });
    },
  });

  const downloadRegister = async () => {
    try {
      const response = await fetch('/api/documents/rnpd-register', { credentials: 'include' });
      if (!response.ok) throw new Error('download failed');
      downloadBlob('registro-actividades-tratamiento.pdf', await response.blob());
    } catch {
      toast({ title: "No se pudo generar el registro", variant: "destructive" });
    }
  };

  const submit = () => {
    if (!form.activityName.trim() || !form.purpose.trim() || !form.legalBasis.trim() || !form.retentionPeriod.trim()) {
      toast({
        title: "Campos obligatorios",
        description: "Complete nombre, finalidad, base legal y plazo de conservación.",
        variant: "destructive",
      });
      return;
    }
    createActivity.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Asistente RNPD</DialogTitle>
          <DialogDescription>
            Registro de Actividades de Tratamiento exigido por la Ley N° 29733 y el DS 016-2024-JUS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Actividades registradas ({activities.length})</h4>
            <Button variant="outline" size="sm" onClick={downloadRegister} data-testid="button-download-rnpd">
              <span className="material-icons mr-1 text-sm">download</span>
              Descargar registro
            </Button>
          </div>

          {isLoading ? (
            <div className="h-20 animate-pulse rounded bg-gray-100" />
          ) : activities.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-gray-500">
              Aún no ha registrado actividades de tratamiento. Agregue la primera a continuación.
            </p>
          ) : (
            <div className="space-y-2">
              {activities.map((activity) => (
                <div key={activity.id} className="rounded-lg border p-3">
                  <p className="font-medium">{activity.activityName}</p>
                  <p className="text-sm text-gray-600">{activity.purpose}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Base legal: {activity.legalBasis} · Conservación: {activity.retentionPeriod}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border bg-gray-50 p-4">
          <h4 className="font-medium">Agregar actividad de tratamiento</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rnpd-name">Nombre *</Label>
              <Input
                id="rnpd-name"
                value={form.activityName}
                onChange={(e) => setForm({ ...form, activityName: e.target.value })}
                placeholder="Atención de reclamos"
                data-testid="input-rnpd-name"
              />
            </div>
            <div>
              <Label htmlFor="rnpd-basis">Base legal *</Label>
              <Input
                id="rnpd-basis"
                value={form.legalBasis}
                onChange={(e) => setForm({ ...form, legalBasis: e.target.value })}
                placeholder="Consentimiento / Obligación legal"
                data-testid="input-rnpd-basis"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="rnpd-purpose">Finalidad *</Label>
            <Textarea
              id="rnpd-purpose"
              rows={2}
              value={form.purpose}
              onChange={(e) => setForm({ ...form, purpose: e.target.value })}
              placeholder="Atender y responder reclamos y quejas de consumidores"
              data-testid="input-rnpd-purpose"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="rnpd-retention">Plazo de conservación *</Label>
              <Input
                id="rnpd-retention"
                value={form.retentionPeriod}
                onChange={(e) => setForm({ ...form, retentionPeriod: e.target.value })}
                placeholder="5 años"
                data-testid="input-rnpd-retention"
              />
            </div>
            <div>
              <Label htmlFor="rnpd-categories">Categorías de datos (separadas por coma)</Label>
              <Input
                id="rnpd-categories"
                value={form.dataCategories}
                onChange={(e) => setForm({ ...form, dataCategories: e.target.value })}
                placeholder="Nombres, DNI, correo"
                data-testid="input-rnpd-categories"
              />
            </div>
            <div>
              <Label htmlFor="rnpd-subjects">Titulares (separados por coma)</Label>
              <Input
                id="rnpd-subjects"
                value={form.dataSubjects}
                onChange={(e) => setForm({ ...form, dataSubjects: e.target.value })}
                placeholder="Consumidores, clientes"
                data-testid="input-rnpd-subjects"
              />
            </div>
            <div>
              <Label htmlFor="rnpd-security">Medidas de seguridad (separadas por coma)</Label>
              <Input
                id="rnpd-security"
                value={form.securityMeasures}
                onChange={(e) => setForm({ ...form, securityMeasures: e.target.value })}
                placeholder="Cifrado, control de acceso"
                data-testid="input-rnpd-security"
              />
            </div>
          </div>
          <Button className="btn-primary" onClick={submit} disabled={createActivity.isPending} data-testid="button-add-rnpd">
            {createActivity.isPending ? "Registrando..." : "Registrar actividad"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
