import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import RnpdAssistantDialog from "@/components/compliance/rnpd-assistant-dialog";
import LegalDocumentsDialog from "@/components/compliance/legal-documents-dialog";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob, todayStamp } from "@/lib/export";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { summarizeCompliance, type ComplianceStatus } from "@/lib/compliance-score";

interface ComplianceStandard {
  id: "ds_011" | "ds_101" | "ley_29733" | "rnpd";
  label: string;
  status: ComplianceStatus;
  /** Evidence behind the status, with real numbers. */
  detail: string;
  /** What to do when it is not met. */
  action: string | null;
  /** In-app page that fixes it. */
  href: string | null;
  /** In-app assistant that fixes it (the processing-activities dialog). */
  actionTarget?: "rnpd-assistant";
  /** Official procedure filed outside the platform (RNPD / SIPDP). */
  external?: { href: string; label: string };
}

interface ComplianceReport {
  standards: ComplianceStandard[];
  applicableStandards: number;
  compliantStandards: number;
  /** Declaration about the RNPD inscription (never a verification). */
  rnpd?: {
    registered: boolean;
    answered: boolean;
    code: string | null;
    completedDate: string | null;
  };
}

const STATUS_LABELS: Record<ComplianceStatus, string> = {
  compliant: "Conforme",
  pending: "Pendiente",
  overdue: "Incumplido",
  not_applicable: "Sin datos",
};

/**
 * Each row uses its real status. `not_applicable` means "there is nothing to
 * evaluate yet" (e.g. the 15-day deadline before the first complaint), which is
 * why it says "Sin datos" and never counts as either met or breached.
 */
const STATUS_TONES: Record<
  ComplianceStatus,
  { card: string; title: string; detail: string; icon: string; iconClass: string; badge: string }
> = {
  compliant: {
    card: "bg-green-50 border-green-200",
    title: "text-green-900",
    detail: "text-green-800",
    icon: "check_circle",
    iconClass: "text-success",
    badge: "bg-green-100 text-green-800",
  },
  pending: {
    card: "bg-amber-50 border-amber-200",
    title: "text-amber-900",
    detail: "text-amber-800",
    icon: "schedule",
    iconClass: "text-warning",
    badge: "bg-amber-100 text-amber-900",
  },
  overdue: {
    card: "bg-red-50 border-red-200",
    title: "text-red-900",
    detail: "text-red-800",
    icon: "error",
    iconClass: "text-destructive",
    badge: "bg-red-100 text-red-800",
  },
  not_applicable: {
    card: "bg-gray-50 border-gray-200",
    title: "text-gray-800",
    detail: "text-gray-600",
    icon: "remove_circle_outline",
    iconClass: "text-gray-400",
    badge: "bg-gray-200 text-gray-700",
  },
};

const FIX_LABELS: Record<string, string> = {
  "/sucursales": "Ir a Sucursales",
  "/libros": "Ir a Libros",
  "/reclamos": "Ir a Reclamos",
  "/cumplimiento": "Ir a Cumplimiento",
};

export default function ComplianceMonitor() {
  const [rnpdOpen, setRnpdOpen] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const { toast } = useToast();
  const { data: report, isLoading, error } = useQuery({
    queryKey: ['/api/compliance/report'],
    queryFn: async () => {
      const response = await fetch('/api/compliance/report', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch compliance report');
      }
      return response.json() as Promise<ComplianceReport>;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <span className="material-icons text-red-600">error</span>
        <AlertDescription>
          Error al cargar el reporte de cumplimiento. Intente nuevamente.
        </AlertDescription>
      </Alert>
    );
  }

  /**
   * Only applicable standards count. Before the first complaint the 15-day
   * deadline has no data, so it is excluded instead of being scored as "met".
   */
  const summary = summarizeCompliance(report?.standards);

  const scoreRing = {
    unknown: "text-gray-200",
    ok: "text-green-500",
    partial: "text-yellow-500",
    risk: "text-red-500",
  }[summary.tone];

  const scoreBar = {
    unknown: "bg-gray-300",
    ok: "bg-green-600",
    partial: "bg-yellow-500",
    risk: "bg-red-600",
  }[summary.tone];

  const scoreText = {
    unknown: "text-gray-500",
    ok: "text-green-600",
    partial: "text-yellow-600",
    risk: "text-red-600",
  }[summary.tone];

  const downloadReport = async () => {
    try {
      const response = await fetch('/api/compliance/report/download', { credentials: 'include' });
      if (!response.ok) {
        throw new Error('download failed');
      }
      downloadBlob(`reporte-cumplimiento-${todayStamp()}.pdf`, await response.blob());
    } catch (error) {
      toast({ title: "No se pudo generar el reporte", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6" data-testid="compliance-monitor">
      {/* Overall status + per-obligation detail */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span className="material-icons text-blue-600">security</span>
            <span>Estado General de Cumplimiento</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div
                className={`font-bold text-gray-900 ${summary.tone === "unknown" ? "text-xl" : "text-3xl"}`}
                data-testid="compliance-score"
              >
                {summary.tone === "unknown"
                  ? "Sin datos"
                  : `${summary.compliant} de ${summary.applicable}`}
              </div>
              <p className="text-sm text-gray-600">Obligaciones cumplidas</p>
              {summary.notApplicable > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {summary.notApplicable} obligación(es) sin datos todavía: no se cuentan en el resultado.
                </p>
              )}
            </div>
            <div className="w-24 h-24 relative">
              <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-gray-200"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={`${summary.ratio * 251} 251`}
                  className={scoreRing}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold">
                  {summary.tone === "unknown" ? "—" : `${summary.compliant}/${summary.applicable}`}
                </span>
              </div>
            </div>
          </div>

          <div
            className="h-4 w-full overflow-hidden rounded-full bg-gray-200"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={summary.applicable || 1}
            aria-valuenow={summary.compliant}
            aria-label="Obligaciones legales cumplidas"
          >
            <div
              className={`h-full rounded-full transition-all ${scoreBar}`}
              style={{ width: `${summary.ratio * 100}%` }}
            />
          </div>

          <p className={`mt-4 text-sm ${scoreText}`} data-testid="compliance-message">
            {summary.message}
          </p>

          {report?.standards && report.standards.length > 0 && (
            <div className="mt-5 space-y-3">
              {report.standards.map((standard) => {
                const tone = STATUS_TONES[standard.status];
                return (
                  <div
                    key={standard.id}
                    className={`rounded-lg border p-4 ${tone.card}`}
                    data-testid={`compliance-standard-${standard.id}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2 sm:gap-3">
                        <span className={`material-icons ${tone.iconClass}`}>{tone.icon}</span>
                        <div className="min-w-0">
                          <h4 className={`text-sm font-semibold ${tone.title}`}>{standard.label}</h4>
                          <p className={`mt-1 text-sm ${tone.detail}`}>{standard.detail}</p>
                          {standard.action && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">Cómo corregirlo:</span>
                              <span className="text-sm text-gray-700">{standard.action}</span>
                              {standard.actionTarget === "rnpd-assistant" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setRnpdOpen(true)}
                                  data-testid="button-fix-ley29733"
                                >
                                  Ver mi registro de actividades
                                </Button>
                              ) : standard.href ? (
                                <Link href={standard.href}>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    data-testid={`button-fix-${standard.id}`}
                                  >
                                    {FIX_LABELS[standard.href] ?? "Ir a corregir"}
                                  </Button>
                                </Link>
                              ) : null}
                              {standard.external && (
                                <a
                                  href={standard.external.href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-2"
                                  data-testid={`link-external-${standard.id}`}
                                >
                                  {standard.external.label}
                                  <span className="material-icons text-sm" aria-hidden="true">
                                    open_in_new
                                  </span>
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <Badge className={`shrink-0 ${tone.badge}`}>{STATUS_LABELS[standard.status]}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Acciones Rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
              data-testid="button-generate-report"
              onClick={downloadReport}
            >
              <span className="material-icons text-blue-600">description</span>
              <div className="text-center">
                <div className="font-medium">Generar Reporte</div>
                <div className="text-xs text-gray-500">Compliance completo</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
              data-testid="button-rnpd-assistant"
              onClick={() => setRnpdOpen(true)}
            >
              <span className="material-icons text-purple-600">assignment</span>
              <div className="text-center">
                <div className="font-medium">Registro de actividades</div>
                <div className="text-xs text-gray-500">Datos personales</div>
              </div>
            </Button>

            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
              data-testid="button-legal-documents"
              onClick={() => setDocumentsOpen(true)}
            >
              <span className="material-icons text-green-600">gavel</span>
              <div className="text-center">
                <div className="font-medium">Documentos Legales</div>
                <div className="text-xs text-gray-500">Avisos y políticas</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Legal Reference */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="text-sm">Marco Legal de Referencia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <h5 className="font-medium mb-1">DS 011-2011-PCM</h5>
              <p className="text-gray-600">Reglamento del Libro de Reclamaciones del Código de Protección y Defensa del Consumidor (modificado por el DS 006-2014-PCM y el DS 101-2022-PCM)</p>
            </div>
            <div>
              <h5 className="font-medium mb-1">Ley 29571 (art. 152) + Ley 31435</h5>
              <p className="text-gray-600">Plazo de 15 días hábiles improrrogables para responder reclamos y quejas; el DS 101-2022-PCM adecúa el Reglamento a ese plazo</p>
            </div>
            <div>
              <h5 className="font-medium mb-1">Ley 29733 + DS 016-2024-JUS</h5>
              <p className="text-gray-600">Ley de Protección de Datos Personales y su nuevo Reglamento (DS N.° 016-2024-JUS, publicado el 30/11/2024)</p>
            </div>
          </div>
          <p className="mt-4 text-xs">
            <a href="/normativa" className="text-primary underline">
              Ver el marco normativo completo y los enlaces oficiales
            </a>
          </p>
        </CardContent>
      </Card>

      {/* Asistente RNPD: registro de actividades de tratamiento */}
      <RnpdAssistantDialog open={rnpdOpen} onOpenChange={setRnpdOpen} />

      {/* Documentos legales descargables */}
      <LegalDocumentsDialog open={documentsOpen} onOpenChange={setDocumentsOpen} />
    </div>
  );
}
