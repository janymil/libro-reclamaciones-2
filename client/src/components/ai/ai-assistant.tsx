import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUpgradeToast } from "@/hooks/use-plan-upgrade";
import {
  useAIClassification,
  useAIFeedback,
  useAISuggestResponse,
  useAIStatus,
  useAITrends,
  useComplaints,
  useSlaPrediction,
  type ResponseLength,
  type ResponseTone,
} from "@/hooks/use-complaints";
import { useSubscription } from "@/hooks/use-subscription";
import PlanGate from "@/components/plan/plan-gate";
import AIFeedbackButtons from "@/components/ai/ai-feedback-buttons";
import ComplaintPicker from "@/components/ai/complaint-picker";
import { COMPLAINT_TYPES } from "@/lib/constants";
import { buildComplaintAIText } from "@/lib/ai-classification";

interface AIAssistantProps {
  onSuggestionAccept?: (suggestion: string) => void;
}

export default function AIAssistant({ onSuggestionAccept }: AIAssistantProps) {
  const [analysisText, setAnalysisText] = useState("");
  const [selectedComplaintId, setSelectedComplaintId] = useState("manual");
  const [responseText, setResponseText] = useState("");
  const [selectedResponseComplaintId, setSelectedResponseComplaintId] = useState("manual");
  const [responseType, setResponseType] = useState<"reclamo" | "queja">("reclamo");
  const [tone, setTone] = useState<ResponseTone | "auto">("auto");
  const [length, setLength] = useState<ResponseLength | "auto">("auto");
  const feedback = useAIFeedback();
  
  const { toast } = useToast();
  const upgradeToast = useUpgradeToast();
  const { data: aiStatus } = useAIStatus();
  const { data: complaints = [], isLoading: complaintsLoading } = useComplaints();
  const selectedComplaint =
    selectedComplaintId === "manual"
      ? null
      : complaints.find((complaint) => complaint.id === selectedComplaintId) ?? null;
  const selectedResponseComplaint =
    selectedResponseComplaintId === "manual"
      ? null
      : complaints.find((complaint) => complaint.id === selectedResponseComplaintId) ?? null;
  const { data: subscription } = useSubscription();
  const trendsMutation = useAITrends();
  // Drafting, SLA prediction and trends are all part of the Pro `aiDrafting`
  // feature. While the subscription loads we keep the request enabled (the
  // server remains the source of truth), then disable it for other plans.
  const canUseAIDrafting = subscription ? subscription.plan.features.aiDrafting : true;
  const { data: slaPrediction } = useSlaPrediction(canUseAIDrafting);
  const classifyMutation = useAIClassification();
  const suggestResponseMutation = useAISuggestResponse();

  /**
   * Choosing a stored complaint fills the textarea with what the AI needs, and
   * the id travels with the request so the server can add the record's own
   * metadata (status, priority, correlative, date) from the database.
   */
  const handleComplaintSelect = (value: string) => {
    setSelectedComplaintId(value);
    classifyMutation.reset();

    if (value === "manual") {
      return;
    }

    const complaint = complaints.find((entry) => entry.id === value);
    if (complaint) {
      setAnalysisText(buildComplaintAIText(complaint));
    }
  };

  const handleClearAnalysis = () => {
    setAnalysisText("");
    setSelectedComplaintId("manual");
    classifyMutation.reset();
  };

  const handleResponseComplaintSelect = (value: string) => {
    setSelectedResponseComplaintId(value);
    suggestResponseMutation.reset();

    if (value === "manual") {
      return;
    }

    const complaint = complaints.find((entry) => entry.id === value);
    if (complaint) {
      setResponseText(buildComplaintAIText(complaint));
      setResponseType(complaint.complaintType === "queja" ? "queja" : "reclamo");
    }
  };

  const handleClassification = async () => {
    if (!analysisText.trim()) {
      toast({
        title: "Error",
        description: "Ingrese el texto a analizar",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await classifyMutation.mutateAsync({
        text: analysisText,
        complaintId: selectedComplaint?.id ?? null,
      });
      toast({
        title: result.source === 'fallback' ? "Análisis heurístico local" : "Análisis completado",
        description:
          result.source === 'fallback'
            ? "La asistencia de IA no está disponible en este momento: se aplicaron reglas locales."
            : "El texto ha sido clasificado exitosamente",
      });
    } catch (error) {
      toast({
        title: "Error en análisis",
        description: "No se pudo procesar el análisis. Intente nuevamente.",
        variant: "destructive",
      });
    }
  };

  const handleResponseSuggestion = async () => {
    if (!responseText.trim()) {
      toast({
        title: "Error",
        description: "Ingrese el texto de la reclamación",
        variant: "destructive",
      });
      return;
    }

    try {
      const result = await suggestResponseMutation.mutateAsync({
        complaintText: responseText,
        complaintType: responseType,
        complaintId: selectedResponseComplaint?.id ?? null,
        tone: tone === "auto" ? undefined : tone,
        length: length === "auto" ? undefined : length,
      });
      
      if (onSuggestionAccept) {
        onSuggestionAccept(result.suggestion);
      }

      toast({
        title: result.source === 'fallback' ? "IA no disponible" : "Sugerencia generada",
        description:
          result.source === 'fallback'
            ? "La asistencia de IA no está disponible en este momento: redacte la respuesta manualmente."
            : "Se ha generado una respuesta sugerida. Revísela antes de enviarla.",
      });
    } catch (error) {
      upgradeToast(error, 'No se pudo generar la respuesta');
    }
  };

  return (
    <div className="space-y-6" data-testid="ai-assistant">
      {/* Header */}
      <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
        <CardHeader>
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <span className="material-icons text-purple-600">psychology</span>
            </div>
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                Asistente IA - ReclamoBot
                {aiStatus && (
                  <Badge
                    className={aiStatus.enabled ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}
                    data-testid="badge-ai-status"
                  >
                    {aiStatus.enabled ? 'IA activa' : 'IA inactiva'}
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-gray-600">Inteligencia artificial para gestión eficiente</p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-purple-200">
              <CardContent className="pt-4">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="material-icons text-purple-600 text-sm">auto_awesome</span>
                  <h4 className="font-medium text-gray-900">Clasificación Automática</h4>
                </div>
                <p className="text-sm text-gray-600">Clasifica automáticamente reclamos y quejas según su gravedad y riesgo legal</p>
              </CardContent>
            </Card>
            
            <Card className="border-purple-200">
              <CardContent className="pt-4">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="material-icons text-purple-600 text-sm">edit</span>
                  <h4 className="font-medium text-gray-900">Redacción Asistida</h4>
                </div>
                <p className="text-sm text-gray-600">Genera respuestas profesionales y conformes a la normativa legal</p>
              </CardContent>
            </Card>
            
            <Card className="border-purple-200">
              <CardContent className="pt-4">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="material-icons text-purple-600 text-sm">trending_up</span>
                  <h4 className="font-medium text-gray-900">Análisis Predictivo</h4>
                </div>
                <p className="text-sm text-gray-600">Identifica patrones y riesgos para mejorar el servicio</p>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Classification and response drafting share one row on desktop. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
      {/* Classification Tool */}
      <Card data-testid="ai-classification-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span className="material-icons text-blue-600">auto_awesome</span>
            <span>Clasificación Inteligente</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ComplaintPicker
            id="analysis-complaint"
            label="Reclamo a analizar"
            testIdPrefix="analysis-complaint"
            complaints={complaints}
            isLoading={complaintsLoading}
            value={selectedComplaintId}
            onChange={handleComplaintSelect}
          />

          <div>
            <label className="block text-sm font-medium mb-2">
              Texto a analizar
            </label>
            <Textarea
              value={analysisText}
              onChange={(e) => setAnalysisText(e.target.value)}
              placeholder="Pegue aquí el texto de la reclamación para que la IA lo analice y clasifique..."
              rows={4}
              data-testid="textarea-analysis"
            />
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleClassification}
              disabled={classifyMutation.isPending}
              className="w-full sm:w-auto"
              data-testid="button-classify"
            >
              {classifyMutation.isPending ? "Analizando..." : "Analizar con IA"}
            </Button>
            {(analysisText || selectedComplaintId !== "manual" || classifyMutation.data) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAnalysis}
                data-testid="button-clear-analysis"
              >
                Limpiar
              </Button>
            )}
          </div>

          {/* Classification Results */}
          {classifyMutation.data && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-4">
                <h4 className="font-medium mb-3">Resultado del Análisis</h4>
                {classifyMutation.data.source === 'fallback' && (
                  <Badge className="mb-3 bg-yellow-100 text-yellow-800">
                    Heurístico local (IA no disponible)
                  </Badge>
                )}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Tipo</label>
                    <div>
                      <Badge className={classifyMutation.data.type === 'reclamo' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}>
                        {COMPLAINT_TYPES[classifyMutation.data.type as keyof typeof COMPLAINT_TYPES]}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Confianza</label>
                    <p className="font-medium">{Math.round(classifyMutation.data.confidence * 100)}%</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Categoría</label>
                    <p className="font-medium capitalize">{classifyMutation.data.category}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500">Prioridad</label>
                    <Badge className={`priority-${classifyMutation.data.priority}`}>
                      {classifyMutation.data.priority}
                    </Badge>
                  </div>
                </div>
                
                {classifyMutation.data.keywords && classifyMutation.data.keywords.length > 0 && (
                  <div className="mt-3">
                    <label className="text-xs font-medium text-gray-500">Palabras clave</label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {classifyMutation.data.keywords.map((keyword: string, index: number) => (
                        <Badge key={index} variant="outline" className="text-xs">
                          {keyword}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Quick Tips: fills the left column under the classifier. */}
      <Card data-testid="ai-tips-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span className="material-icons text-yellow-600">lightbulb</span>
            <span>Consejos para Mejores Resultados</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start space-x-2">
              <span className="material-icons text-xs mt-1">check_circle</span>
              <span>Proporcione el texto completo de la reclamación para un análisis más preciso</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="material-icons text-xs mt-1">check_circle</span>
              <span>Revise siempre las sugerencias de IA antes de enviarlas al consumidor</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="material-icons text-xs mt-1">check_circle</span>
              <span>La IA redacta siguiendo la normativa peruana vigente (DS 011-2011-PCM, DS 101-2022-PCM)</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="material-icons text-xs mt-1">check_circle</span>
              <span>Use la clasificación automática para priorizar reclamaciones urgentes</span>
            </li>
          </ul>
        </CardContent>
      </Card>
      </div>

      {/* Pro AI tools: drafting, SLA prediction and trends share one gate so a
          customer on a lower plan sees one clear upgrade card instead of three
          buttons that answer 402. */}
      <PlanGate
        feature="aiDrafting"
        title="Redacción y análisis con IA"
        description="El asistente de respuesta, la predicción de vencimientos y el análisis de tendencias están incluidos desde el plan Pro."
      >
        <div className="space-y-6">
      {/* Response Suggestion Tool */}
      <Card data-testid="ai-response-card">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span className="material-icons text-green-600">edit</span>
            <span>Asistente de Respuesta</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ComplaintPicker
            id="response-complaint"
            label="Reclamo para la respuesta"
            testIdPrefix="response-complaint"
            complaints={complaints}
            isLoading={complaintsLoading}
            value={selectedResponseComplaintId}
            onChange={handleResponseComplaintSelect}
          />

          <div>
            <label className="block text-sm font-medium mb-2">
              Tipo de reclamación
            </label>
            <div className="flex space-x-4">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  value="reclamo"
                  checked={responseType === "reclamo"}
                  onChange={(e) => setResponseType(e.target.value as "reclamo" | "queja")}
                  className="h-4 w-4 text-primary"
                />
                <span>Reclamo</span>
              </label>
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  value="queja"
                  checked={responseType === "queja"}
                  onChange={(e) => setResponseType(e.target.value as "reclamo" | "queja")}
                  className="h-4 w-4 text-primary"
                />
                <span>Queja</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Texto de la reclamación
            </label>
            <Textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              placeholder="Pegue aquí el detalle de la reclamación para generar una respuesta sugerida..."
              rows={4}
              data-testid="textarea-response-text"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Select value={tone} onValueChange={(value) => setTone(value as ResponseTone | "auto")}>
              <SelectTrigger className="h-9 w-[170px]" aria-label="Tono de la respuesta">
                <SelectValue placeholder="Tono" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Tono automático</SelectItem>
                <SelectItem value="empatico">Empático</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="firme">Firme</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={length}
              onValueChange={(value) => setLength(value as ResponseLength | "auto")}
            >
              <SelectTrigger className="h-9 w-[170px]" aria-label="Extensión de la respuesta">
                <SelectValue placeholder="Extensión" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Extensión automática</SelectItem>
                <SelectItem value="breve">Breve</SelectItem>
                <SelectItem value="estandar">Estándar</SelectItem>
                <SelectItem value="detallada">Detallada</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleResponseSuggestion}
            disabled={suggestResponseMutation.isPending}
            className="w-full sm:w-auto"
            data-testid="button-suggest-response"
          >
            {suggestResponseMutation.isPending ? "Generando..." : "Generar Respuesta"}
          </Button>

          {/* Response Suggestion Results */}
          {suggestResponseMutation.data && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium">Respuesta Sugerida</h4>
                  {suggestResponseMutation.data.source === 'fallback' && (
                    <Badge className="bg-yellow-100 text-yellow-800">
                      IA no disponible
                    </Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(suggestResponseMutation.data.suggestion)}
                    data-testid="button-copy-suggestion"
                  >
                    <span className="material-icons mr-1 text-sm">content_copy</span>
                    Copiar
                  </Button>
                </div>
                <div className="bg-white p-4 rounded border border-green-200">
                  <p className="whitespace-pre-wrap text-sm">{suggestResponseMutation.data.suggestion}</p>
                </div>
                <div className="mt-3 flex space-x-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      onSuggestionAccept?.(suggestResponseMutation.data.suggestion);
                      // Acceptance signal for the feedback loop.
                      feedback.mutate({ feature: "draft_accepted", rating: 1 });
                    }}
                    data-testid="button-accept-suggestion"
                  >
                    Usar esta respuesta
                  </Button>
                  <AIFeedbackButtons feature="draft" />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResponseSuggestion}
                    data-testid="button-regenerate"
                  >
                    Regenerar
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* SLA-breach prediction */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span className="material-icons text-orange-600">schedule</span>
            <span>Predicción de riesgo de vencimiento (SLA)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3" data-testid="sla-prediction">
          {slaPrediction ? (
            <>
              <p className="text-sm text-gray-600">
                {slaPrediction.summary.highRisk} de {slaPrediction.summary.total} reclamaciones
                abiertas con alto riesgo de vencer el plazo legal de 15 días hábiles
                (DS 101-2022-PCM). Atienda primero las de mayor riesgo.
              </p>
              {slaPrediction.assessments.slice(0, 5).map((assessment) => (
                <div key={assessment.complaintId} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-medium">{assessment.correlativeNumber}</span>
                    <Badge
                      className={
                        assessment.riskLevel === 'high'
                          ? 'bg-red-100 text-red-800'
                          : assessment.riskLevel === 'medium'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                      }
                    >
                      {assessment.riskLevel === 'high' ? 'Riesgo alto' : assessment.riskLevel === 'medium' ? 'Riesgo medio' : 'En control'}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {assessment.consumerFullName} · {assessment.businessDaysRemaining} días hábiles restantes
                  </p>
                  <ul className="text-xs text-gray-600 mt-1 list-disc list-inside">
                    {assessment.reasons.map((reason: string, index: number) => (
                      <li key={index}>{reason}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {slaPrediction.assessments.length === 0 && (
                <p className="text-sm text-gray-500">No hay reclamaciones abiertas.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">Cargando predicción...</p>
          )}
        </CardContent>
      </Card>

      {/* Trend Analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span className="material-icons text-purple-600">trending_up</span>
            <span>Análisis de Tendencias</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Analiza las reclamaciones abiertas de su negocio para detectar patrones, problemas
            frecuentes y áreas de riesgo legal.
          </p>
          <Button
            onClick={() => trendsMutation.mutate()}
            disabled={trendsMutation.isPending}
            data-testid="button-analyze-trends"
          >
            {trendsMutation.isPending ? "Analizando..." : "Analizar tendencias"}
          </Button>

          {trendsMutation.data && (
            <Card className="bg-purple-50 border-purple-200" data-testid="trends-results">
              <CardContent className="pt-4 space-y-3">
                {trendsMutation.data.source === 'fallback' && (
                  <Badge className="bg-yellow-100 text-yellow-800">
                    Heurístico local (IA no disponible)
                  </Badge>
                )}
                <div>
                  <h4 className="font-medium">Problemas frecuentes</h4>
                  {trendsMutation.data.commonIssues.length > 0 ? (
                    <ul className="list-disc list-inside text-sm text-gray-700">
                      {trendsMutation.data.commonIssues.map((issue: string, index: number) => (
                        <li key={index}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">
                      Sin datos suficientes para identificar patrones.
                    </p>
                  )}
                </div>
                {trendsMutation.data.recommendations.length > 0 && (
                  <div>
                    <h4 className="font-medium">Recomendaciones</h4>
                    <ul className="list-disc list-inside text-sm text-gray-700">
                      {trendsMutation.data.recommendations.map((recommendation: string, index: number) => (
                        <li key={index}>{recommendation}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {trendsMutation.data.riskAreas.length > 0 && (
                  <div>
                    <h4 className="font-medium">Áreas de riesgo</h4>
                    <ul className="list-disc list-inside text-sm text-gray-700">
                      {trendsMutation.data.riskAreas.map((risk: string, index: number) => (
                        <li key={index}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  {trendsMutation.data.analyzedCount} reclamaciones abiertas analizadas.
                </p>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
        </div>
      </PlanGate>
      </div>

    </div>
  );
}
