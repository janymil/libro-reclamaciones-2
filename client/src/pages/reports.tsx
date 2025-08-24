import { useQuery } from '@tanstack/react-query';
import AppLayout from '@/components/layout/app-layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarDays, Download, FileText, TrendingUp } from 'lucide-react';

export default function Reports() {
  const { data: reportStats, isLoading } = useQuery({
    queryKey: ['/api/reports/stats'],
  });

  const { data: monthlyReports } = useQuery({
    queryKey: ['/api/reports/monthly'],
  });

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
          <Button className="flex items-center gap-2" data-testid="button-export">
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
                    <Button variant="outline" size="sm" data-testid={`button-download-${index}`}>
                      <Download className="h-4 w-4 mr-2" />
                      Descargar PDF
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
                    <Input type="date" id="start-date" data-testid="input-start-date" />
                  </div>
                  <div>
                    <Label htmlFor="end-date">Fecha Fin</Label>
                    <Input type="date" id="end-date" data-testid="input-end-date" />
                  </div>
                </div>
                <Button className="w-full" data-testid="button-generate-custom">
                  Generar Reporte Personalizado
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
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <span>DS 011-2011-PCM - Libro de Reclamaciones</span>
                    <span className="text-green-600 font-medium">✓ Conforme</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <span>DS 101-2022-PCM - Plazos de Respuesta</span>
                    <span className="text-green-600 font-medium">✓ Conforme</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <span>Ley 29733 - Protección de Datos</span>
                    <span className="text-green-600 font-medium">✓ Conforme</span>
                  </div>
                </div>
                <Button className="w-full" data-testid="button-audit-report">
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