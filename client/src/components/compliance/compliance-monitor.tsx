import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { COMPLIANCE_STATUSES } from "@/lib/constants";

interface ComplianceItem {
  type: string;
  status: 'compliant' | 'pending' | 'overdue' | 'not_applicable';
  description: string;
  dueDate?: string;
  actions: string[];
}

interface ComplianceReport {
  ds011Status: boolean;
  ds101Status: boolean;
  ley29733Status: boolean;
  nextActions: string[];
  overdueItems: ComplianceItem[];
}

export default function ComplianceMonitor() {
  const { data: report, isLoading, error } = useQuery({
    queryKey: ['/api/compliance/report'],
    queryFn: async () => {
      const response = await fetch('/api/compliance/report', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch compliance report');
      }
      return response.json() as Promise<ComplianceReport>;
    },
  });

  const { data: tracking } = useQuery({
    queryKey: ['/api/compliance/tracking'],
    queryFn: async () => {
      const response = await fetch('/api/compliance/tracking', {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch compliance tracking');
      }
      return response.json() as Promise<ComplianceItem[]>;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="border-red-200 bg-red-50">
        <span className="material-icons text-red-600">error</span>
        <AlertDescription>
          Error al cargar el reporte de cumplimiento. Intente nuevamente.
        </AlertDescription>
      </Alert>
    );
  }

  const getComplianceScore = () => {
    if (!report) return 0;
    const total = 3;
    const compliant = [report.ds011Status, report.ds101Status, report.ley29733Status].filter(Boolean).length;
    return Math.round((compliant / total) * 100);
  };

  const getStatusBadge = (status: string) => {
    const variants = {
      compliant: "bg-green-100 text-green-800",
      pending: "bg-yellow-100 text-yellow-800",
      overdue: "bg-red-100 text-red-800",
      not_applicable: "bg-gray-100 text-gray-800",
    };

    return (
      <Badge className={variants[status as keyof typeof variants] || "bg-gray-100 text-gray-800"}>
        {COMPLIANCE_STATUSES[status as keyof typeof COMPLIANCE_STATUSES] || status}
      </Badge>
    );
  };

  const complianceScore = getComplianceScore();

  return (
    <div className="space-y-6" data-testid="compliance-monitor">
      {/* Overall Compliance Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <span className="material-icons text-blue-600">security</span>
            <span>Estado General de Cumplimiento</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-3xl font-bold text-gray-900">{complianceScore}%</div>
              <p className="text-sm text-gray-600">Cumplimiento Legal</p>
            </div>
            <div className="w-24 h-24 relative">
              <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-gray-200"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray={`${complianceScore * 2.51} 251`}
                  className={complianceScore >= 80 ? "text-green-500" : complianceScore >= 60 ? "text-yellow-500" : "text-red-500"}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold">{complianceScore}%</span>
              </div>
            </div>
          </div>
          
          <Progress value={complianceScore} className="w-full" />
          
          <div className="mt-4 text-sm text-gray-600">
            {complianceScore >= 80 && (
              <p className="text-green-600">✓ Excelente cumplimiento legal</p>
            )}
            {complianceScore >= 60 && complianceScore < 80 && (
              <p className="text-yellow-600">⚠ Cumplimiento parcial - Revisar pendientes</p>
            )}
            {complianceScore < 60 && (
              <p className="text-red-600">⚠ Atención requerida - Riesgo de incumplimiento</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Legal Framework Compliance */}
      <Card>
        <CardHeader>
          <CardTitle>Monitor de Cumplimiento Legal</CardTitle>
          <p className="text-sm text-gray-600">Estado actual de conformidad normativa</p>
        </CardHeader>
        
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              {/* DS 011-2011-PCM */}
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center space-x-3">
                  <span className="material-icons text-success">check_circle</span>
                  <div>
                    <h4 className="font-medium text-green-800">DS 011-2011-PCM</h4>
                    <p className="text-sm text-green-600">Reglamento del Libro de Reclamaciones</p>
                  </div>
                </div>
                {getStatusBadge(report?.ds011Status ? 'compliant' : 'pending')}
              </div>
              
              {/* DS 101-2022-PCM */}
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center space-x-3">
                  <span className="material-icons text-success">check_circle</span>
                  <div>
                    <h4 className="font-medium text-green-800">DS 101-2022-PCM</h4>
                    <p className="text-sm text-green-600">15 días hábiles improrrogables</p>
                  </div>
                </div>
                {getStatusBadge(report?.ds101Status ? 'compliant' : 'pending')}
              </div>
              
              {/* Ley 29733 + DS 016-2024-JUS */}
              <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-center space-x-3">
                  <span className="material-icons text-warning">warning</span>
                  <div>
                    <h4 className="font-medium text-yellow-800">Ley 29733 + DS 016-2024-JUS</h4>
                    <p className="text-sm text-yellow-600">Protección de Datos Personales</p>
                  </div>
                </div>
                {getStatusBadge(report?.ley29733Status ? 'compliant' : 'pending')}
              </div>
            </div>
            
            {/* Next Actions */}
            <div className="space-y-4">
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-4">
                  <h4 className="font-medium text-blue-800 mb-2">Próximas Acciones Requeridas</h4>
                  {report?.nextActions && report.nextActions.length > 0 ? (
                    <ul className="space-y-2 text-sm text-blue-700">
                      {report.nextActions.map((action, index) => (
                        <li key={index} className="flex items-center space-x-2">
                          <span className="material-icons text-xs">circle</span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-blue-700">No hay acciones pendientes</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Compliance Tracking */}
      {tracking && tracking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Seguimiento Detallado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {tracking.map((item, index) => (
                <div key={index} className="border rounded-lg p-4" data-testid={`compliance-item-${index}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{item.description}</h4>
                    {getStatusBadge(item.status)}
                  </div>
                  
                  {item.dueDate && (
                    <p className="text-sm text-gray-600 mb-2">
                      Vencimiento: {new Date(item.dueDate).toLocaleDateString('es-PE')}
                    </p>
                  )}
                  
                  {item.actions && item.actions.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-1">Acciones:</p>
                      <ul className="text-sm text-gray-600 space-y-1">
                        {item.actions.map((action, actionIndex) => (
                          <li key={actionIndex} className="flex items-start space-x-2">
                            <span className="material-icons text-xs mt-1">arrow_right</span>
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Acciones Rápidas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
              data-testid="button-generate-report"
            >
              <span className="material-icons text-blue-600">description</span>
              <div className="text-center">
                <div className="font-medium">Generar Reporte</div>
                <div className="text-xs text-gray-500">Compliance completo</div>
              </div>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
              data-testid="button-rnpd-assistant"
            >
              <span className="material-icons text-purple-600">assignment</span>
              <div className="text-center">
                <div className="font-medium">Asistente RNPD</div>
                <div className="text-xs text-gray-500">Registro datos</div>
              </div>
            </Button>
            
            <Button
              variant="outline"
              className="h-auto p-4 flex flex-col items-center space-y-2"
              data-testid="button-legal-documents"
            >
              <span className="material-icons text-green-600">gavel</span>
              <div className="text-center">
                <div className="font-medium">Documentos Legales</div>
                <div className="text-xs text-gray-500">Avisos y políticas</div>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Legal Reference */}
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle className="text-sm">Marco Legal de Referencia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <h5 className="font-medium mb-1">DS 011-2011-PCM</h5>
              <p className="text-gray-600">Reglamento del Libro de Reclamaciones del Código de Protección y Defensa del Consumidor</p>
            </div>
            <div>
              <h5 className="font-medium mb-1">DS 101-2022-PCM</h5>
              <p className="text-gray-600">Modificación del plazo de respuesta a 15 días hábiles improrrogables</p>
            </div>
            <div>
              <h5 className="font-medium mb-1">Ley 29733 + DS 016-2024-JUS</h5>
              <p className="text-gray-600">Ley de Protección de Datos Personales y su nuevo Reglamento (vigente desde 30/03/2025)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
