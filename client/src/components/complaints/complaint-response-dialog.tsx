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
import { useUpgradeToast } from "@/hooks/use-plan-upgrade";
import { useUpdateComplaint, useAISuggestResponse, useSimilarComplaints, useCaseSummary, type CaseSummaryResult } from "@/hooks/use-complaints";
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
  const upgradeToast = useUpgradeToast();
  const { getBusinessDaysRemaining, getUrgencyLevel } = useBusinessDays();
  const updateComplaint = useUpdateComplaint();
  const suggestResponse = useAISuggestResponse();
  const { data: similarComplaints } = useSimilarComplaints(complaint?.id ?? "", open);

  const [providerActions, setProviderActions] = useState("");
  const [providerResponse, setProviderResponse] = useState("");
  const [responseMethod, setResponseMethod] = useState("email");
  const [caseSummary, setCaseSummary] = useState<CaseSummaryResult | null>(null);

  const caseSummaryMutation = useCaseSummary();

  useEffect(() => {
    if (open && complaint) {
      setProviderActions(complaint.providerActions ?? "");
      // Pre-fill with the AI draft generated when the complaint was received
      // (background enrichment) so staff can review, adjust and send in one
      // pass instead of writing from scratch.
      setProviderResponse(complaint.providerResponse ?? complaint.aiSuggestedResponse ?? "");
      setResponseMethod(complaint.responseMethod ?? "email");
      setCaseSummary(null);
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
        title: result.source === 'fallback' ? "IA no disponible" : "Sugerencia generada",
        description:
          result.source === 'fallback'
            ? "No hay proveedor de IA configurado: redacte la respuesta manualmente."
            : "Revise y ajuste la respuesta antes de enviarla.",
      });
    } catch (error) {
      upgradeToast(error, 'No se pudo generar la sugerencia');
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

          {similarComplaints && similarComplaints.length > 0 && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4" data-testid="similar-complaints">
              <Label className="text-purple-700">Casos similares ({similarComplaints.length})</Label>
              <p className="text-xs text-purple-600 mt-1 mb-2">
                Reclamaciones anteriores parecidas a esta. Reutilice una respuesta ya enviada si aplica.
              </p>
              <div className="space-y-2">
                {similarComplaints.map((similar) => (
                  <div key={similar.complaintId} className="bg-white rounded border border-purple-100 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-medium">{similar.correlativeNumber}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {Math.round(similar.similarity * 100)}% similar
                        </Badge>
                        {similar.providerResponse && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setProviderResponse(similar.providerResponse as string)}
                            data-testid={`button-reuse-${similar.complaintId}`}
                          >
                            Reutilizar respuesta
                          </Button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{similar.complaintDetail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label htmlFor="provider-response">Respuesta para el consumidor *</Label>
              {complaint.aiSuggestedResponse && !complaint.providerResponse && (
                <span className="text-xs text-purple-600">
                  Borrador IA precargado — revíselo y ajústelo antes de enviar
                </span>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const result = await caseSummaryMutation.mutateAsync(complaint.id);
                      setCaseSummary(result);
                    } catch {
                      setCaseSummary(null);
                      toast({
                        title: "No se pudo generar el resumen",
                        description: "Intente nuevamente en unos momentos.",
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={caseSummaryMutation.isPending}
                  data-testid="button-case-summary"
                >
                  <span className="material-icons mr-1 text-sm">summarize</span>
                  {caseSummaryMutation.isPending ? "Resumiendo..." : "Resumen ejecutivo"}
                </Button>
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
            </div>

            {caseSummary && (
              <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3" data-testid="case-summary-result">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className={
                    caseSummary.riskLevel === 'high'
                      ? 'bg-red-100 text-red-800'
                      : caseSummary.riskLevel === 'medium'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-green-100 text-green-800'
                  }>
                    Riesgo {caseSummary.riskLevel === 'high' ? 'alto' : caseSummary.riskLevel === 'medium' ? 'medio' : 'bajo'}
                  </Badge>
                  {caseSummary.source === 'fallback' && (
                    <Badge className="bg-gray-100 text-gray-600">IA no disponible</Badge>
                  )}
                </div>
                <p className="text-sm text-gray-800">{caseSummary.summary}</p>
                {caseSummary.keyFacts.length > 0 && (
                  <ul className="mt-2 list-disc list-inside text-xs text-gray-600">
                    {caseSummary.keyFacts.map((fact, index) => (
                      <li key={index}>{fact}</li>
                    ))}
                  </ul>
                )}
                {caseSummary.recommendedAction && (
                  <p className="mt-2 text-xs font-medium text-blue-900">
                    Siguiente paso: {caseSummary.recommendedAction}
                  </p>
                )}
              </div>
            )}

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
