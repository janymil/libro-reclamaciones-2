import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MonthlyReport, ReportStats } from '@/lib/api-types';
import { downloadCsv, todayStamp } from '@/lib/export';
import { downloadSirecReport } from '@/lib/sirec';
import type { Complaint } from '@shared/schema';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarDays, Download, FileText, TrendingUp } from 'lucide-react';

export default function Reports() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: reportStats, isLoading } = useQuery<ReportStats>({
    queryKey: ['/api/reports/stats'],
  });

  const { data: monthlyReports } = useQuery<MonthlyReport[]>({
    queryKey: ['/api/reports/monthly'],
  });

  const { data: complaints } = useQuery<Array<Record<string, unknown>>>({
    queryKey: ['/api/complaints'],
  });

  const { data: compliance } = useQuery<any>({
    queryKey: ['/api/compliance/report'],
  });

  const exportSummary = () => {
    downloadCsv(`reporte-general-${todayStamp()}`, [{
      'Total de reclamaciones': reportStats?.totalComplaints ?? 0,
      'Variación vs mes anterior (%)': reportStats?.complaintsGrowth ?? 0,
      'Tiempo promedio de respuesta (días hábiles)': reportStats?.averageResponseTime ?? 0,
      'Tasa de resolución (%)': reportStats?.resolutionRate ?? 0,
      'Cumplimiento legal (%)': reportStats?.complianceRate ?? 0,
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
    const from = startDate ? new Date(startDate) : null;
    const to = endDate ? new Date(endDate) : null;

    const rows = (complaints ?? [])
      .filter((c: any) => {
        const submitted = new Date(c.submissionDate);
        if (from && submitted < from) return false;
        if (to && submitted > to) return false;
        return true;
      })
      .map((c: any) => ({
        'N° correlativo': c.correlativeNumber,
        Tipo: c.complaintType,
        Estado: c.status,
        Consumidor: c.consumerFullName,
        Documento: c.consumerDocumentNumber,
        'Producto/Servicio': c.productServiceName,
        Presentado: c.submissionDate ? new Date(c.submissionDate).toLocaleDateString('es-PE') : '',
        'Fecha límite': c.dueDate ? new Date(c.dueDate).toLocaleDateString('es-PE') : '',
        Vencido: c.isOverdue ? 'Sí' : 'No',
      }));

    downloadCsv(`reporte-personalizado-${todayStamp()}`, rows);
  };

  const exportSirec = () => {
    downloadSirecReport((complaints ?? []) as unknown as Complaint[]);
  };

  const exportAudit = () => {
    downloadCsv(`auditoria-cumplimiento-${todayStamp()}`, [
      { Norma: 'DS 011-2011-PCM (Reglamento del Libro)', Estado: compliance?.ds011Status ? 'Conforme' : 'Pendiente' },
      { Norma: 'DS 101-2022-PCM (15 días hábiles)', Estado: compliance?.ds101Status ? 'Conforme' : 'Pendiente' },
      { Norma: 'Ley 29733 (Protección de Datos)', Estado: compliance?.ley29733Status ? 'Conforme' : 'Pendiente' },
      ...(compliance?.nextActions ?? []).map((action: string) => ({ Norma: 'Acción pendiente', Estado: action })),
    ]);
  };

  return (
    <AppLayout>
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
              <CardTitle className="text-sm font-medium">Cumplimiento Legal</CardTitle>
              <div className="h-4 w-4 rounded-full bg-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="stat-compliance">
                {isLoading ? '...' : reportStats?.complianceRate || '100'}%
              </div>
              <p className="text-xs text-muted-foreground">
                DS 011-2011-PCM conforme
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
          </TabsList>

          <TabsContent value="monthly" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Reportes Mensuales Automáticos</CardTitle>
                <CardDescription>
                  Reportes generados automáticamente según DS 011-2011-PCM
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {monthlyReports?.map((report: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <h4 className="font-medium">{report.month}</h4>
                      <p className="text-sm text-gray-600">{report.complaints} reclamaciones procesadas</p>
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
                )) || (
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
                <div className="grid grid-cols-2 gap-4">
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
                </div>
                <Button className="w-full" onClick={exportCustomRange} data-testid="button-generate-custom">
                  Generar Reporte Personalizado
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


                </Button>
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
                    { label: 'DS 101-2022-PCM - Plazos de Respuesta', ok: compliance?.ds101Status },
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
                <Button className="w-full" onClick={exportAudit} data-testid="button-audit-report">
                  Generar Reporte de Auditoría
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}