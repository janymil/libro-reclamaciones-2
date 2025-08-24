import { Card, CardContent } from "@/components/ui/card";

interface StatsCardsProps {
  metrics?: {
    activeComplaints: number;
    urgentComplaints: number;
    slaCompliance: number;
    resolvedThisMonth: number;
    npsScore: number;
  };
}

export default function StatsCards({ metrics }: StatsCardsProps) {
  const defaultMetrics = {
    activeComplaints: 0,
    urgentComplaints: 0,
    slaCompliance: 0,
    resolvedThisMonth: 0,
    npsScore: 0,
  };

  const data = metrics || defaultMetrics;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" data-testid="stats-cards">
      <Card className="border border-gray-200">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Reclamaciones Activas</p>
              <p className="text-3xl font-bold text-gray-900">{data.activeComplaints}</p>
              <p className="text-sm text-gray-500 mt-2">
                <span className="text-secondary font-medium">{data.urgentComplaints} urgentes</span>
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
              <p className="text-3xl font-bold text-success">{data.slaCompliance}%</p>
              <p className="text-sm text-gray-500 mt-2">15 días hábiles</p>
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
              <p className="text-3xl font-bold text-gray-900">{data.resolvedThisMonth}</p>
              <p className="text-sm text-success mt-2">+12% vs mes anterior</p>
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
              <p className="text-sm font-medium text-gray-600">Satisfacción NPS</p>
              <p className="text-3xl font-bold text-gray-900">{data.npsScore}</p>
              <p className="text-sm text-gray-500 mt-2">Puntuación promedio</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <span className="material-icons text-yellow-600">sentiment_satisfied</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
