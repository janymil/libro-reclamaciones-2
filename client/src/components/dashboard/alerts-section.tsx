import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Complaint } from "@shared/schema";

interface AlertsSectionProps {
  alerts?: Complaint[];
}

export default function AlertsSection({ alerts = [] }: AlertsSectionProps) {
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
              className="flex items-center justify-between bg-white rounded-lg p-4 border border-red-200"
              data-testid={`alert-item-${alert.id}`}
            >
              <div className="flex items-center space-x-3">
                <span className="material-icons text-red-600">timer</span>
                <div>
                  <p className="font-medium text-gray-900">
                    Reclamo #{alert.correlativeNumber} vence {new Date(alert.dueDate) <= new Date() ? 'hoy' : 'mañana'}
                  </p>
                  <p className="text-sm text-gray-600">
                    Establecimiento: {alert.establishmentId}
                  </p>
                </div>
              </div>
              <Button
                className="btn-primary"
                size="sm"
                data-testid={`button-review-${alert.id}`}
              >
                Revisar
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
