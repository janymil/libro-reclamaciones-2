import { Card, CardContent } from "@/components/ui/card";

interface StatsCardsProps {
  metrics?: {
    activeComplaints: number;
    urgentComplaints: number;
    overdueComplaints: number;
    slaCompliance: number;
    resolvedThisMonth: number;
    resolutionRate: number;
    averageResponseTime: number;
  };
}

export default function StatsCards({ metrics }: StatsCardsProps) {
  const defaultMetrics = {
    activeComplaints: 0,
    urgentComplaints: 0,
    overdueComplaints: 0,
    slaCompliance: 0,
    resolvedThisMonth: 0,
    resolutionRate: 0,
    averageResponseTime: 0,
  };

  const data = metrics || defaultMetrics;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="stats-cards">
      <Card className="border border-gray-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Reclamaciones Activas</p>
              <p className="text-3xl font-bold text-gray-900" data-testid="stat-active">{data.activeComplaints}</p>
              <p className="text-sm text-gray-500 mt-2">
                <span className="text-secondary font-medium">{data.overdueComplaints} vencidas</span>
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <span className="material-icons text-primary">assignment_late</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-gray-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">SLA Cumplimiento</p>
              <p className="text-3xl font-bold text-success" data-testid="stat-sla">{data.slaCompliance}%</p>
              <p className="text-sm text-gray-500 mt-2">Respondidas dentro de 15 días hábiles</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <span className="material-icons text-success">schedule</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-gray-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Resueltas Este Mes</p>
              <p className="text-3xl font-bold text-gray-900" data-testid="stat-resolved">{data.resolvedThisMonth}</p>
              <p className="text-sm text-gray-500 mt-2">Tasa de atención: {data.resolutionRate}%</p>
            </div>
            <div className="w-12 h-12 bg-emerald-100 rounded-lg flex items-center justify-center">
              <span className="material-icons text-emerald-600">check_circle</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border border-gray-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Tiempo de Respuesta</p>
              <p className="text-3xl font-bold text-gray-900" data-testid="stat-response-time">
                {data.averageResponseTime} <span className="text-base font-normal">días hábiles</span>
              </p>
              <p className="text-sm text-gray-500 mt-2">Promedio de reclamos respondidos</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <span className="material-icons text-yellow-600">timer</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
