import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUpdateComplaint, useAISuggestResponse } from "@/hooks/use-complaints";
import { useBusinessDays } from "@/hooks/use-business-days";
import type { Complaint } from "@shared/schema";

interface ComplaintResponseDialogProps {
  complaint: Complaint | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Provider response workflow. The response is stored on the complaint and the
 * consumer receives it by email (server side, see PATCH /api/complaints/:id).
 * Answering within 15 business days is the legal obligation of DS 101-2022-PCM.
 */
export default function ComplaintResponseDialog({ complaint, open, onOpenChange }: ComplaintResponseDialogProps) {
  const { toast } = useToast();
  const { getBusinessDaysRemaining, getUrgencyLevel } = useBusinessDays();
  const updateComplaint = useUpdateComplaint();
  const suggestResponse = useAISuggestResponse();

  const [providerActions, setProviderActions] = useState("");
  const [providerResponse, setProviderResponse] = useState("");
  const [responseMethod, setResponseMethod] = useState("email");

  useEffect(() => {
    if (open && complaint) {
      setProviderActions(complaint.providerActions ?? "");
      setProviderResponse(complaint.providerResponse ?? "");
      setResponseMethod(complaint.responseMethod ?? "email");
    }
  }, [open, complaint]);

  if (!complaint) {
    return null;
  }

  const remaining = getBusinessDaysRemaining(new Date(complaint.dueDate));
  const urgency = getUrgencyLevel(new Date(complaint.dueDate));

  const handleSuggest = async () => {
    try {
      const result = await suggestResponse.mutateAsync({
        complaintText: `${complaint.complaintDetail}\n\nPedido del consumidor: ${complaint.consumerRequest ?? 'No especificado'}`,
        complaintType: complaint.complaintType,
      });
      setProviderResponse(result.suggestion);
      toast({
        title: "Sugerencia generada",
        description: "Revise y ajuste la respuesta antes de enviarla.",
      });
    } catch (error) {
      toast({
        title: "No se pudo generar la sugerencia",
        description: "Verifique la conexión con el servicio de IA e intente nuevamente.",
        variant: "destructive",
      });
    }
  };

  const submit = async (status?: string) => {
    if (!providerResponse.trim()) {
      toast({
        title: "Respuesta requerida",
        description: "Escriba la respuesta que se enviará al consumidor.",
        variant: "destructive",
      });
      return;
    }

    try {
      await updateComplaint.mutateAsync({
        id: complaint.id,
        data: {
          providerActions: providerActions.trim() || null,
          providerResponse: providerResponse.trim(),
          responseMethod,
          ...(status ? { status } : {}),
        },
      });

      toast({
        title: status === 'resolved' ? "Reclamo respondido y resuelto" : "Respuesta enviada",
        description: `Se notificó al consumidor en ${complaint.consumerEmail}.`,
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "No se pudo enviar la respuesta",
        description: "Intente nuevamente en unos instantes.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Responder reclamación {complaint.correlativeNumber}</DialogTitle>
          <DialogDescription>
            El consumidor recibirá la respuesta por correo. Plazo legal: 15 días hábiles (DS 101-2022-PCM).
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge className={complaint.complaintType === 'reclamo' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}>
            {complaint.complaintType === 'reclamo' ? 'Reclamo' : 'Queja'}
          </Badge>
          <Badge className={urgency === 'overdue' || urgency === 'urgent' ? 'bg-red-100 text-red-800' : urgency === 'warning' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}>
            {urgency === 'overdue' ? 'Plazo vencido' : `${remaining} día(s) hábil(es)`}
          </Badge>
          <span className="text-sm text-gray-500">
            {complaint.consumerFullName} · {complaint.consumerEmail}
          </span>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border bg-gray-50 p-4">
            <Label className="text-gray-500">Detalle presentado por el consumidor</Label>
            <p className="mt-1 whitespace-pre-wrap text-sm">{complaint.complaintDetail}</p>
            {complaint.consumerRequest && (
              <p className="mt-2 text-sm">
                <span className="font-medium">Pedido:</span> {complaint.consumerRequest}
              </p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label htmlFor="provider-response">Respuesta para el consumidor *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSuggest}
                disabled={suggestResponse.isPending}
                data-testid="button-ai-suggest-inline"
              >
                <span className="material-icons mr-1 text-sm">psychology</span>
                {suggestResponse.isPending ? "Generando..." : "Sugerir con IA"}
              </Button>
            </div>
            <Textarea
              id="provider-response"
              rows={7}
              value={providerResponse}
              onChange={(e) => setProviderResponse(e.target.value)}
              placeholder="Explique al consumidor la solución adoptada o la justificación de la decisión..."
              data-testid="textarea-provider-response"
            />
          </div>

          <div>
            <Label htmlFor="provider-actions">Acciones adoptadas (opcional)</Label>
            <Textarea
              id="provider-actions"
              rows={3}
              value={providerActions}
              onChange={(e) => setProviderActions(e.target.value)}
              placeholder="Medidas correctivas, devoluciones, reembolsos, etc."
              data-testid="textarea-provider-actions"
            />
          </div>

          <div>
            <Label>Medio de respuesta</Label>
            <Select value={responseMethod} onValueChange={setResponseMethod}>
              <SelectTrigger className="mt-1" data-testid="select-response-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Correo electrónico</SelectItem>
                <SelectItem value="letter">Carta / Cargo</SelectItem>
                <SelectItem value="phone">Teléfono</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => submit('resolved')}
            disabled={updateComplaint.isPending}
            data-testid="button-respond-resolve"
          >
            Enviar y marcar resuelto
          </Button>
          <Button
            className="btn-primary"
            onClick={() => submit()}
            disabled={updateComplaint.isPending}
            data-testid="button-respond-send"
          >
            {updateComplaint.isPending ? "Enviando..." : "Enviar respuesta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
