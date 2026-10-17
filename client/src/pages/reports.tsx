import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MonthlyReport, ReportStats } from '@/lib/api-types';
import { downloadCsv, todayStamp } from '@/lib/export';
import { downloadSirecReport } from '@/lib/sirec';
import { useReincidenceReport, useAbusiveClauses } from '@/hooks/use-complaints';
import type { Complaint, Establishment } from '@shared/schema';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { COMPLAINT_TYPES } from '@/lib/constants';
import { formatCalendarDate } from '@shared/peru-time';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import PlanGate from '@/components/plan/plan-gate';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CalendarDays, Download, FileText, TrendingUp, PackageSearch, Gavel } from 'lucide-react';

// Radix UI's Select forbids items whose value is an empty string (it is reserved
// to clear the selection and show the placeholder). "Show everything" is modelled
// with this sentinel and mapped back to "" in the filter state, where an empty
// value already means "no filter".
const ALL_FILTER = 'all';

export default function Reports() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // Custom-report filters, on top of the date range.
  const [customEstablishmentId, setCustomEstablishmentId] = useState('');
  const [customComplaintType, setCustomComplaintType] = useState('');
  const [contractText, setContractText] = useState('');

  const { toast } = useToast();

  // Phase 1.3: INDECOPI expediente download
  const [isBuildingExpediente, setIsBuildingExpediente] = useState(false);

  // Phase 3.11: reincidence panel + abusive-clause detector
  const reincidence = useReincidenceReport();
  const abusiveClauses = useAbusiveClauses();

  const downloadExpediente = async () => {
    try {
      setIsBuildingExpediente(true);
      const params = new URLSearchParams();
      if (startDate) params.set('dateFrom', startDate);
      if (endDate) params.set('dateTo', endDate);

      const response = await fetch(`/api/complaints/expediente/descargar?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('No se pudo generar el expediente');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `expediente-indecopi-${todayStamp()}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Expediente download failed:', error);
    } finally {
      setIsBuildingExpediente(false);
    }
  };

  const { data: reportStats, isLoading } = useQuery<ReportStats>({
    queryKey: ['/api/reports/stats'],
  });

  const { data: monthlyReports } = useQuery<MonthlyReport[]>({
    queryKey: ['/api/reports/monthly'],
  });

  const { data: complaints } = useQuery<Array<Record<string, unknown>>>({
    queryKey: ['/api/complaints'],
  });

  // Sucursal options for the custom-report filter
  const { data: establishments = [] } = useQuery<Establishment[]>({
    queryKey: ['/api/establishments'],
    queryFn: async () => {
      const response = await fetch('/api/establishments', { credentials: 'include' });
      if (!response.ok) {
        return [];
      }
      return response.json();
    },
  });

  const { data: compliance } = useQuery<any>({
    queryKey: ['/api/compliance/report'],
  });

  // ---- Complaint-handling compliance (DS 101-2022-PCM: 15 business days) ----
  // Derived from the real complaint dates, never from the paperwork checklist,
  // and never rendered through a falsy fallback (0% must never print as 100%).
  const slaRate = reportStats?.slaOnTimeRate ?? null;
  const answeredCount = reportStats?.answeredComplaints ?? 0;
  const totalCount = reportStats?.totalComplaints ?? 0;
  const overdueCount = reportStats?.overdueComplaints ?? 0;
  const hasComplaints = totalCount > 0;
  const deadlineComplianceOk = hasComplaints && overdueCount === 0 && slaRate === 100;
  const slaCaption = !hasComplaints
    ? 'Aún no hay reclamaciones registradas'
    : `${answeredCount} de ${totalCount} respondidas · ${overdueCount} vencida(s) sin respuesta`;
  const slaTone = !hasComplaints
    ? { dot: 'bg-gray-400', text: 'text-gray-500' }
    : overdueCount > 0
      ? { dot: 'bg-red-500', text: 'text-red-600' }
      : slaRate === 100
        ? { dot: 'bg-green-500', text: 'text-green-600' }
        : { dot: 'bg-amber-500', text: 'text-amber-600' };

  const exportSummary = () => {
    downloadCsv(`reporte-general-${todayStamp()}`, [{
      'Total de reclamaciones': reportStats?.totalComplaints ?? 0,
      'Variación vs mes anterior (%)': reportStats?.complaintsGrowth ?? 0,
      'Tiempo promedio de respuesta (días hábiles)': reportStats?.averageResponseTime ?? 0,
      'Tasa de resolución (%)': reportStats?.resolutionRate ?? 0,
      'Cumplimiento de plazo 15 días hábiles (%)': reportStats?.slaOnTimeRate ?? 'Sin datos',
      'Respondidas': reportStats?.answeredComplaints ?? 0,
      'Vencidas sin respuesta': reportStats?.overdueComplaints ?? 0,
      'Obligaciones formales registradas (%)': reportStats?.formalComplianceRate ?? 0,
    }]);
  };

  const exportMonthly = (report: MonthlyReport) => {
    downloadCsv(`reporte-${report.month.replace(/\s+/g, '-').toLowerCase()}`, [{
      Mes: report.month,
      Reclamaciones: report.complaints,
      Resueltas: report.resolved,
      Vencidas: report.overdue,
    }]);
  };

  const exportCustomRange = () => {
    const establishmentNames = new Map<string, string>(
      establishments.map((establishment): [string, string] => [establishment.id, establishment.name]),
    );

    const rows = (complaints ?? [])
      .filter((c: any) => {
        // Sucursal and tipo first, then the date range (inclusive on both ends).
        if (customEstablishmentId && c.establishmentId !== customEstablishmentId) return false;
        if (customComplaintType && c.complaintType !== customComplaintType) return false;

        // Compared as Peruvian calendar dates (YYYY-MM-DD), so a complaint
        // submitted in the evening of the selected end date is included and the
        // result does not depend on the reader's time zone.
        const submitted = c.submissionDate ? formatCalendarDate(new Date(c.submissionDate)) : '';
        if (startDate && submitted < startDate) return false;
        if (endDate && submitted > endDate) return false;
        return true;
      })
      .map((c: any) => ({
        'N° correlativo': c.correlativeNumber,
        Sucursal: establishmentNames.get(c.establishmentId) ?? c.establishmentId ?? '',
        Tipo: c.complaintType,
        Estado: c.status,
        Consumidor: c.consumerFullName,
        Documento: c.consumerDocumentNumber,
        'Producto/Servicio': c.productServiceName,
        Presentado: c.submissionDate ? new Date(c.submissionDate).toLocaleDateString('es-PE') : '',
        'Fecha límite': c.dueDate ? new Date(c.dueDate).toLocaleDateString('es-PE') : '',
        Vencido: c.isOverdue ? 'Sí' : 'No',
      }));

    if (rows.length === 0) {
      toast({
        title: 'Nada que exportar',
        description: 'No hay reclamaciones que coincidan con los filtros aplicados.',
        variant: 'destructive',
      });
      return;
    }

    downloadCsv(`reporte-personalizado-${todayStamp()}`, rows);
    toast({
      title: 'Exportación lista',
      description: `${rows.length} reclamaciones exportadas a CSV.`,
    });
  };

  const exportSirec = () => {
    downloadSirecReport((complaints ?? []) as unknown as Complaint[]);
  };

  const exportAudit = () => {
    downloadCsv(`auditoria-cumplimiento-${todayStamp()}`, [
      { Norma: 'DS 011-2011-PCM (Reglamento del Libro)', Estado: compliance?.ds011Status ? 'Conforme (checklist)' : 'Pendiente (checklist)' },
      // Derived from the real complaint dates, never from the paperwork checklist.
      { Norma: 'DS 101-2022-PCM (respuestas en 15 días hábiles)', Estado: deadlineComplianceOk ? 'Conforme' : 'Incumplido' },
      { Norma: '  · Reclamaciones vencidas sin respuesta', Estado: String(reportStats?.overdueComplaints ?? 0) },
      { Norma: '  · Respondidas dentro del plazo', Estado: `${reportStats?.answeredComplaints ?? 0} de ${reportStats?.totalComplaints ?? 0}` },
      { Norma: 'Ley 29733 (Protección de Datos)', Estado: compliance?.ley29733Status ? 'Conforme (checklist)' : 'Pendiente (checklist)' },
      ...(compliance?.nextActions ?? []).map((action: string) => ({ Norma: 'Acción pendiente', Estado: action })),
    ]);
  };

  return (
    <AppLayout>
      <PlanGate
        feature="reports"
        title="Reportes y estadísticas"
        description="Cumplimiento, tendencias, reincidencia y exportación SIREC / INDECOPI de su libro."
      >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="reports-title">
              Reportes y Estadísticas
            </h1>
            <p className="text-gray-600">
              Análisis detallado de reclamaciones y cumplimiento legal
            </p>
          </div>
          <Button className="flex items-center gap-2" onClick={exportSummary} data-testid="button-export">
            <Download className="h-4 w-4" />
            Exportar Reportes
          </Button>
        </div>

        {/* Report Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reclamaciones</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-complaints">
                {isLoading ? '...' : reportStats?.totalComplaints || '0'}
              </div>
              <p className="text-xs text-muted-foreground">
                +{reportStats?.complaintsGrowth || '0'}% desde el mes pasado
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tiempo Promedio</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-avg-time">
                {isLoading ? '...' : reportStats?.averageResponseTime || '0'} días
              </div>
              <p className="text-xs text-muted-foreground">
                Tiempo de respuesta promedio
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tasa Resolución</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-resolution-rate">
                {isLoading ? '...' : reportStats?.resolutionRate || '0'}%
              </div>
              <p className="text-xs text-muted-foreground">
                Casos resueltos satisfactoriamente
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cumplimiento de Plazo (SLA)</CardTitle>
              <div className={`h-4 w-4 rounded-full ${slaTone.dot}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${slaTone.text}`} data-testid="stat-compliance">
                {isLoading ? '...' : hasComplaints ? `${slaRate ?? 0}%` : 'Sin datos'}
              </div>
              <p className="text-xs text-muted-foreground" data-testid="stat-compliance-caption">
                {slaCaption} · plazo legal 15 días hábiles
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Report Generation */}
        <Tabs defaultValue="monthly" className="space-y-4">
          <TabsList>
            <TabsTrigger value="monthly" data-testid="tab-monthly">Reportes Mensuales</TabsTrigger>
            <TabsTrigger value="custom" data-testid="tab-custom">Reporte Personalizado</TabsTrigger>
            <TabsTrigger value="legal" data-testid="tab-legal">Cumplimiento Legal</TabsTrigger>
            <TabsTrigger value="analitica" data-testid="tab-analitica">Analítica IA</TabsTrigger>
          </TabsList>

          <TabsContent value="monthly" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Reportes Mensuales Automáticos</CardTitle>
                <CardDescription>
                  Reportes generados automáticamente según DS 011-2011-PCM. Se listan los meses
                  desde el registro de su empresa, hasta un máximo de 6.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {monthlyReports && monthlyReports.length > 0 ? (
                  monthlyReports.map((report, index) => (
                    <div
                      key={report.month}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div>
                        <h4 className="font-medium">{report.month}</h4>
                        <p className="text-sm text-gray-600">
                          {report.complaints} reclamaciones procesadas
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => exportMonthly(report)}
                        data-testid={`button-download-${index}`}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Descargar CSV
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No hay reportes disponibles
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="custom" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Generar Reporte Personalizado</CardTitle>
                <CardDescription>
                  Crea reportes específicos por fecha, establecimiento o tipo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="start-date">Fecha Inicio</Label>
                    <Input
                      type="date"
                      id="start-date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div>
                    <Label htmlFor="end-date">Fecha Fin</Label>
                    <Input
                      type="date"
                      id="end-date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      data-testid="input-end-date"
                    />
                  </div>
                  <div>
                    <Label htmlFor="custom-establishment">Establecimiento</Label>
                    <Select
                      value={customEstablishmentId || ALL_FILTER}
                      onValueChange={(value) =>
                        setCustomEstablishmentId(value === ALL_FILTER ? '' : value)
                      }
                    >
                      <SelectTrigger id="custom-establishment" data-testid="select-custom-establishment">
                        <SelectValue placeholder="Establecimiento" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FILTER}>Todos los establecimientos</SelectItem>
                        {establishments.map((establishment) => (
                          <SelectItem key={establishment.id} value={establishment.id}>
                            {establishment.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="custom-type">Tipo</Label>
                    <Select
                      value={customComplaintType || ALL_FILTER}
                      onValueChange={(value) =>
                        setCustomComplaintType(value === ALL_FILTER ? '' : value)
                      }
                    >
                      <SelectTrigger id="custom-type" data-testid="select-custom-type">
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={ALL_FILTER}>Todos los tipos</SelectItem>
                        {Object.entries(COMPLAINT_TYPES).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button className="w-full" onClick={exportCustomRange} data-testid="button-generate-custom">
                  <Download className="h-4 w-4 mr-2" />
                  Generar Reporte Personalizado
                </Button>

                <div className="border-t pt-4">
                  <p className="mb-1 text-sm font-medium">Reporte SIREC</p>
                  <p className="mb-3 text-sm text-gray-600">
                    Descargue el registro completo de reclamos con los datos exigidos por las autoridades
                    (consumidor, bien contratado, reclamo, respuesta del proveedor y plazos legales).
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={exportSirec}
                    data-testid="button-export-sirec"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Exportar reporte SIREC (CSV)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="legal" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Auditoría de Cumplimiento Legal</CardTitle>
                <CardDescription>
                  Verificación automática del cumplimiento normativo
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {[
                    { label: 'DS 011-2011-PCM - Libro de Reclamaciones', ok: compliance?.ds011Status },
                    // Deadline compliance is computed from the real complaints, not
                    // from the manual checklist (which says nothing about dates).
                    { label: 'DS 101-2022-PCM - Respuestas en 15 días hábiles', ok: deadlineComplianceOk },
                    { label: 'Ley 29733 - Protección de Datos', ok: compliance?.ley29733Status },
                  ].map(({ label, ok }) => (
                    <div
                      key={label}
                      className={`flex items-center justify-between p-3 rounded-lg ${ok ? 'bg-green-50' : 'bg-yellow-50'}`}
                    >
                      <span>{label}</span>
                      <span className={`font-medium ${ok ? 'text-green-600' : 'text-yellow-600'}`}>
                        {ok ? '✓ Conforme' : '⚠ Pendiente'}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground" data-testid="legal-deadline-source">
                  El estado de plazos se calcula con las fechas reales de sus reclamaciones: {slaCaption}
                  {' '}· Obligaciones formales registradas (checklist): {reportStats?.formalComplianceRate ?? 0}%
                </p>
                <Button className="w-full" onClick={exportAudit} data-testid="button-audit-report">
                  Generar Reporte de Auditoría
                </Button>
              </CardContent>
            </Card>

            {/* Expediente digital INDECOPI (Phase 1.3) */}
            <Card>
              <CardHeader>
                <CardTitle>Expediente digital para INDECOPI</CardTitle>
                <CardDescription>
                  Descarga un ZIP listo para remisión a la autoridad: constancias PDF de cada
                  reclamación, evidencias adjuntas, registro SIREC (CSV) y un manifiesto con marca
                  de tiempo y código de verificación. Respeta el rango de fechas seleccionado arriba.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  onClick={downloadExpediente}
                  disabled={isBuildingExpediente}
                  data-testid="button-download-expediente"
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isBuildingExpediente ? 'Generando expediente...' : 'Descargar expediente (ZIP)'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analitica" className="space-y-4">
            {/* Reincidence panel (Phase 3.11) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PackageSearch className="h-5 w-5" />
                  Panel de reincidencia
                </CardTitle>
                <CardDescription>
                  Productos y sucursales que generan reclamaciones repetidas - la señal más clara
                  de un problema estructural por corregir.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {reincidence.isLoading && <p className="text-sm text-gray-500">Calculando reincidencia...</p>}

                {reincidence.data && (
                  <>
                    <div>
                      <h4 className="text-sm font-medium mb-2">Por producto / servicio</h4>
                      {reincidence.data.byProduct.length === 0 ? (
                        <p className="text-sm text-gray-500">Sin reincidencias por producto.</p>
                      ) : (
                        <ul className="space-y-2" data-testid="reincidence-products">
                          {reincidence.data.byProduct.map((entry) => (
                            <li key={entry.key} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                              <span className="truncate">{entry.key}</span>
                              <span className="whitespace-nowrap text-gray-600">
                                {entry.total} reclamos · {entry.resolved} resueltos
                                {entry.overdue > 0 && <span className="text-red-600"> · {entry.overdue} vencidos</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <h4 className="text-sm font-medium mb-2">Por sucursal</h4>
                      {reincidence.data.byEstablishment.length === 0 ? (
                        <p className="text-sm text-gray-500">Sin reincidencias por sucursal.</p>
                      ) : (
                        <ul className="space-y-2" data-testid="reincidence-establishments">
                          {reincidence.data.byEstablishment.map((entry) => (
                            <li key={entry.key} className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm">
                              <span className="truncate">{entry.key}</span>
                              <span className="whitespace-nowrap text-gray-600">
                                {entry.total} reclamos · {entry.resolved} resueltos
                                {entry.overdue > 0 && <span className="text-red-600"> · {entry.overdue} vencidos</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Abusive-clause detector (Phase 3.11) */}
            <PlanGate
              feature="aiDrafting"
              title="Detector de cláusulas abusivas"
              description="La revisión de contratos con IA está incluida desde el plan Pro."
            >
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gavel className="h-5 w-5" />
                  Detector de cláusulas abusivas
                </CardTitle>
                <CardDescription>
                  Pegue las condiciones de sus contratos o contratos de adhesión y la IA las
                  revisará contra los artículos 49 y 50 del Código de Protección y Defensa del
                  Consumidor (cláusulas abusivas).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="contract-text">Texto del contrato / condiciones</Label>
                  <Textarea
                    id="contract-text"
                    rows={6}
                    value={contractText}
                    onChange={(e) => setContractText(e.target.value)}
                    placeholder="Pegue aquí los términos y condiciones, contratos o letras chicas..."
                    data-testid="input-contract-text"
                  />
                </div>
                <Button
                  className="w-full"
                  disabled={contractText.trim().length < 20 || abusiveClauses.isPending}
                  onClick={() => abusiveClauses.mutate(contractText)}
                  data-testid="button-analyze-clauses"
                >
                  {abusiveClauses.isPending ? 'Analizando...' : 'Analizar cláusulas'}
                </Button>

                {abusiveClauses.data && (
                  <div className="space-y-3" data-testid="abusive-clauses-result">
                    <p className={`font-medium ${abusiveClauses.data.hasAbusiveClauses ? 'text-red-600' : 'text-green-600'}`}>
                      {abusiveClauses.data.hasAbusiveClauses
                        ? '⚠ Se detectaron cláusulas potencialmente abusivas:'
                        : '✓ No se detectaron cláusulas potencialmente abusivas.'}
                    </p>
                    {abusiveClauses.data.clauses.map((clause, index) => (
                      <div key={index} className="border-l-4 border-red-400 bg-red-50 p-3 rounded">
                        <p className="text-sm font-medium text-gray-900">"{clause.quote}"</p>
                        <p className="text-sm text-gray-700 mt-1">{clause.issue}</p>
                        <p className="text-xs text-gray-500 mt-1">Base legal: {clause.legalBasis}</p>
                      </div>
                    ))}
                    {abusiveClauses.data.recommendations.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-900 mb-1">Recomendaciones:</p>
                        <ul className="list-disc list-inside text-sm text-gray-700">
                          {abusiveClauses.data.recommendations.map((recommendation, index) => (
                            <li key={index}>{recommendation}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
            </PlanGate>
          </TabsContent>
        </Tabs>
      </div>
      </PlanGate>
    </AppLayout>
  );
}