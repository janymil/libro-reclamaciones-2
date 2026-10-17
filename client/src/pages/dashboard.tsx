import { Link } from "wouter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { ADMIN_PATH } from "@/lib/admin-path";
import { useDashboardMetrics } from "@/hooks/use-complaints";
import AppLayout from "@/components/layout/app-layout";
import StatsCards from "@/components/dashboard/stats-cards";
import AlertsSection from "@/components/dashboard/alerts-section";
import RecentComplaintsTable from "@/components/dashboard/recent-complaints-table";
import GettingStarted from "@/components/dashboard/getting-started";
import AIAssistant from "@/components/ai/ai-assistant";
import ComplianceMonitor from "@/components/compliance/compliance-monitor";

export default function Dashboard() {
  const { data: metrics } = useDashboardMetrics();
  const { user } = useAuth();

  /**
   * A platform operator owns no business, so this panel would be an empty shell
   * (0 reclamos, 0 sucursales). Nothing is redirected automatically - the two
   * areas stay independent - so the operator is simply told where its own console
   * is and continues from there.
   */
  if (user?.isPlatformAdmin && !user.businessId) {
    return (
      <AppLayout title="Panel de Gestión">
        <Card>
          <CardHeader>
            <CardTitle>Cuenta de operador</CardTitle>
            <CardDescription>
              Este panel es el de los clientes. Su cuenta gestiona clientes y no tiene empresa
              propia, así que su lugar es la consola del equipo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href={ADMIN_PATH}>
              <Button className="bg-[#c02b0a] text-white hover:bg-[#a02408]">
                Abrir la consola de operaciones
              </Button>
            </Link>
          </CardContent>
        </Card>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Panel de Gestión">
      <div className="space-y-6" data-testid="dashboard">
        {/* Primeros pasos: solo mientras quede algo pendiente (y el cliente no lo
            haya cerrado). Responde las dudas que aparecen DESPUÉS de registrar:
            sucursales faltantes, libros por sucursal, correo sin confirmar. */}
        <GettingStarted />

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
