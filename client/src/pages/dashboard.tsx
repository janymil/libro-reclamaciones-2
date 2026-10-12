import { useDashboardMetrics } from "@/hooks/use-complaints";
import AppLayout from "@/components/layout/app-layout";
import StatsCards from "@/components/dashboard/stats-cards";
import AlertsSection from "@/components/dashboard/alerts-section";
import RecentComplaintsTable from "@/components/dashboard/recent-complaints-table";
import AIAssistant from "@/components/ai/ai-assistant";
import ComplianceMonitor from "@/components/compliance/compliance-monitor";

export default function Dashboard() {
  const { data: metrics } = useDashboardMetrics();

  return (
    <AppLayout title="Panel de Gestión">
      <div className="space-y-6" data-testid="dashboard">
        {/* Indicadores reales del negocio */}
        <StatsCards metrics={metrics} />

        {/* Reclamos próximos a vencer */}
        <AlertsSection alerts={metrics?.urgentAlerts} />

        {/* Últimos reclamos recibidos */}
        <RecentComplaintsTable complaints={metrics?.recentComplaints} />

        {/* Asistente IA: clasificación automática y redacción asistida */}
        <AIAssistant />

        {/* Estado real de cumplimiento: DS 011-2011-PCM, DS 101-2022-PCM, Ley 29733 */}
        <ComplianceMonitor />
      </div>
    </AppLayout>
  );
}
