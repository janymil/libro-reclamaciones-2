import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import ComplaintDetail from "@/components/complaints/complaint-detail";
import ComplaintResponseDialog from "@/components/complaints/complaint-response-dialog";
import { useBusinessDays } from "@/hooks/use-business-days";
import type { DashboardComplaint } from "@/hooks/use-complaints";

interface AlertsSectionProps {
  alerts?: DashboardComplaint[];
}

export default function AlertsSection({ alerts = [] }: AlertsSectionProps) {
  const [viewTarget, setViewTarget] = useState<DashboardComplaint | null>(null);
  const [respondTarget, setRespondTarget] = useState<DashboardComplaint | null>(null);
  const { getBusinessDaysRemaining, isOverdue } = useBusinessDays();

  /**
   * The card used to print "vence hoy / vence mañana" from a boolean, so a
   * complaint due in two business days said "mañana" and an overdue one said
   * "hoy". This reads the real calendar (Peru holidays included).
   */
  const dueLabel = (dueDate: Date | string): string => {
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
      return 'con plazo pendiente';
    }
    if (isOverdue(due)) {
      return 'venció';
    }
    const remaining = getBusinessDaysRemaining(due);
    return remaining <= 1 ? 'vence hoy o mañana' : `vence en ${remaining} días hábiles`;
  };

  if (alerts.length === 0) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="text-center">
              <span className="material-icons text-green-600 text-4xl mb-2">check_circle</span>
              <h3 className="text-lg font-semibold text-green-800 mb-1">Todo al día</h3>
              <p className="text-green-600">No hay alertas urgentes en este momento</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-red-200 bg-red-50" data-testid="alerts-section">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-semibold text-red-800">Alertas Urgentes</CardTitle>
            <span className="material-icons text-red-600">warning</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-lg p-4 border border-red-200"
                data-testid={`alert-item-${alert.id}`}
              >
                <div className="flex min-w-0 items-start space-x-3">
                  <span className="material-icons text-red-600">timer</span>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      Reclamo #{alert.correlativeNumber} {dueLabel(alert.dueDate)}
                    </p>
                    <p className="text-sm text-gray-600">
                      Establecimiento: {alert.establishmentName ?? 'Sin local asignado'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewTarget(alert)}
                    data-testid={`button-view-alert-${alert.id}`}
                  >
                    Ver
                  </Button>
                  <Button
                    className="btn-primary"
                    size="sm"
                    onClick={() => setRespondTarget(alert)}
                    data-testid={`button-review-${alert.id}`}
                  >
                    Revisar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Ver detalle */}
      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogTitle>Reclamación N° {viewTarget?.correlativeNumber}</DialogTitle>
          {viewTarget && <ComplaintDetail complaint={viewTarget} />}
        </DialogContent>
      </Dialog>

      {/* Responder */}
      <ComplaintResponseDialog
        complaint={respondTarget}
        open={!!respondTarget}
        onOpenChange={(open) => !open && setRespondTarget(null)}
      />
    </>
  );
}
