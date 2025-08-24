import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAIClassification, useAISuggestResponse } from "@/hooks/use-complaints";
import { COMPLAINT_TYPES } from "@/lib/constants";

interface AIAssistantProps {
  onSuggestionAccept?: (suggestion: string) => void;
}

export default function AIAssistant({ onSuggestionAccept }: AIAssistantProps) {
  const [analysisText, setAnalysisText] = useState("");
  const [responseText, setResponseText] = useState("");
  const [responseType, setResponseType] = useState<"reclamo" | "queja">("reclamo");
  
  const { toast } = useToast();
  const classifyMutation = useAIClassification();
  const suggestResponseMutation = useAISuggestResponse();

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
      await classifyMutation.mutateAsync(analysisText);
      toast({
        title: "Análisis completado",
        description: "El texto ha sido clasificado exitosamente",
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
      });
      
      if (onSuggestionAccept) {
        onSuggestionAccept(result.suggestion);
      }
      
      toast({
        title: "Sugerencia generada",
        description: "Se ha generado una respuesta sugerida",
      });
    } catch (error) {
      toast({
        title: "Error en sugerencia",
        description: "No se pudo generar la respuesta. Intente nuevamente.",
        variant: "destructive",
      });
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
              <CardTitle>Asistente IA - ReclamoBot</CardTitle>
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
                <p className="text-sm text-gray-600">Detecta automáticamente si es reclamo o queja con 95% de precisión</p>
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

      {/* Classification Tool */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span className="material-icons text-blue-600">auto_awesome</span>
            <span>Clasificación Inteligente</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
          
          <Button
            onClick={handleClassification}
            disabled={classifyMutation.isPending}
            className="w-full sm:w-auto"
            data-testid="button-classify"
          >
            {classifyMutation.isPending ? "Analizando..." : "Analizar con IA"}
          </Button>

          {/* Classification Results */}
          {classifyMutation.data && (
            <Card className="bg-blue-50 border-blue-200">
              <CardContent className="pt-4">
                <h4 className="font-medium mb-3">Resultado del Análisis</h4>
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

      {/* Response Suggestion Tool */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span className="material-icons text-green-600">edit</span>
            <span>Asistente de Respuesta</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
                    onClick={() => onSuggestionAccept?.(suggestResponseMutation.data.suggestion)}
                    data-testid="button-accept-suggestion"
                  >
                    Usar esta respuesta
                  </Button>
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

      {/* Quick Tips */}
      <Card>
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
              <span>La IA está entrenada con la normativa peruana vigente (DS 011-2011-PCM, DS 101-2022-PCM)</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="material-icons text-xs mt-1">check_circle</span>
              <span>Use la clasificación automática para priorizar reclamaciones urgentes</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
