import { useAIUsage } from "@/hooks/use-complaints";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const FEATURE_LABELS: Record<string, string> = {
  classification: "Clasificación",
  intake_classification: "Clasificación al recibir",
  draft: "Redacción de respuestas",
  intake_draft: "Borrador al recibir",
  trends: "Tendencias",
  case_summary: "Resumen ejecutivo",
  abusive_clauses: "Cláusulas abusivas",
  public_assist: "Asistente público",
  public_extract: "Autocompletado público",
  agent: "Copiloto",
  onboarding: "Onboarding",
  executive_report: "Reporte ejecutivo",
  sla_followup: "Seguimiento SLA",
  similar: "Casos similares",
};

function labelFor(feature: string): string {
  return FEATURE_LABELS[feature] ?? feature;
}

/**
 * What the AI actually did for this tenant in the last 30 days. It is a usage
 * meter, not a quota: the plans promise unlimited AI, and this makes the value
 * visible (and the cost transparent) without inventing a limit.
 */
export default function AIUsageCard() {
  const { data, isLoading } = useAIUsage(30);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Consumo de IA (30 días)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">Cargando consumo…</p>
        </CardContent>
      </Card>
    );
  }

  const usage = data?.usage;
  const feedback = data?.feedback;

  return (
    <Card data-testid="ai-usage-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="material-icons text-purple-600">insights</span>
          Consumo de IA (30 días)
        </CardTitle>
        <CardDescription>
          Llamadas realizadas por su equipo y por el asistente público. Sin límite en su plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!usage || usage.calls === 0 ? (
          <p className="text-sm text-gray-500">
            Aún no hay consumo de IA en los últimos 30 días. Use el asistente, redacte una respuesta o
            genere un reporte para empezar.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-gray-500">Llamadas</p>
                <p className="text-xl font-semibold">{usage.calls}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Tokens</p>
                <p className="text-xl font-semibold">{usage.totalTokens.toLocaleString("es-PE")}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Costo estimado</p>
                <p className="text-xl font-semibold">
                  {usage.estimatedCostUsd > 0 ? `US$ ${usage.estimatedCostUsd.toFixed(3)}` : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Valoraciones</p>
                <p className="text-xl font-semibold">
                  {feedback && feedback.total > 0
                    ? `${Math.round((feedback.acceptanceRate ?? 0) * 100)}% útil`
                    : "—"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {usage.byFeature.map((row) => (
                <Badge key={row.feature} variant="outline" className="text-xs">
                  {labelFor(row.feature)}: {row.calls}
                </Badge>
              ))}
            </div>

            {feedback && feedback.total > 0 && (
              <p className="text-xs text-gray-500">
                {feedback.positive} valoración(es) positiva(s) y {feedback.negative} negativa(s) en el
                periodo.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
