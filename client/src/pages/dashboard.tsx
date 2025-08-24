import { useDashboardMetrics } from "@/hooks/use-complaints";
import AppLayout from "@/components/layout/app-layout";
import StatsCards from "@/components/dashboard/stats-cards";
import AlertsSection from "@/components/dashboard/alerts-section";
import RecentComplaintsTable from "@/components/dashboard/recent-complaints-table";
import AIAssistant from "@/components/ai/ai-assistant";
import ComplianceMonitor from "@/components/compliance/compliance-monitor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: metrics, isLoading, error } = useDashboardMetrics();

  return (
    <AppLayout title="Dashboard de Gestión" subtitle="SOTOMAYOR ESCOBAR ANA REGINA">
      <div className="space-y-6" data-testid="dashboard">
        {/* KPI Stats Cards */}
        <StatsCards metrics={metrics} />

        {/* Alerts Section */}
        <AlertsSection alerts={metrics?.urgentAlerts} />

        {/* Recent Complaints */}
        <RecentComplaintsTable complaints={metrics?.recentComplaints} />

        {/* AI Assistant Preview */}
        <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="material-icons text-purple-600">psychology</span>
                </div>
                <div>
                  <CardTitle>Asistente IA - ReclamoBot</CardTitle>
                  <p className="text-sm text-gray-600">Inteligencia artificial para gestión eficiente</p>
                </div>
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

        {/* Compliance Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <span className="material-icons text-green-600">verified</span>
              <span>Estado de Cumplimiento Legal</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center space-x-3">
                  <span className="material-icons text-success">check_circle</span>
                  <div>
                    <h4 className="font-medium text-green-800">DS 011-2011-PCM</h4>
                    <p className="text-sm text-green-600">Reglamento del Libro</p>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800">Conforme</Badge>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center space-x-3">
                  <span className="material-icons text-success">check_circle</span>
                  <div>
                    <h4 className="font-medium text-green-800">DS 101-2022-PCM</h4>
                    <p className="text-sm text-green-600">15 días hábiles</p>
                  </div>
                </div>
                <Badge className="bg-green-100 text-green-800">Conforme</Badge>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-center space-x-3">
                  <span className="material-icons text-warning">warning</span>
                  <div>
                    <h4 className="font-medium text-yellow-800">Ley 29733</h4>
                    <p className="text-sm text-yellow-600">Protección de Datos</p>
                  </div>
                </div>
                <Badge className="bg-yellow-100 text-yellow-800">En Proceso</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
