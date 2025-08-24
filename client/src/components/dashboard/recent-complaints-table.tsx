import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useBusinessDays } from "@/hooks/use-business-days";
import { COMPLAINT_TYPES } from "@/lib/constants";
import type { Complaint } from "@shared/schema";

interface RecentComplaintsTableProps {
  complaints?: Complaint[];
}

export default function RecentComplaintsTable({ complaints = [] }: RecentComplaintsTableProps) {
  const { getBusinessDaysRemaining, getUrgencyLevel } = useBusinessDays();

  const getStatusBadge = (status: string) => {
    const statusLabels = {
      new: 'Nuevo',
      in_progress: 'En Proceso',
      responded: 'Respondido',
      resolved: 'Resuelto',
      overdue: 'Vencido'
    };

    return (
      <Badge className={`status-${status.replace('_', '-')}`}>
        {statusLabels[status as keyof typeof statusLabels] || status}
      </Badge>
    );
  };

  const getUrgencyBadge = (dueDate: string) => {
    const urgency = getUrgencyLevel(new Date(dueDate));
    const remaining = getBusinessDaysRemaining(new Date(dueDate));

    const variants = {
      overdue: "bg-red-100 text-red-800",
      urgent: "bg-red-100 text-red-800",
      warning: "bg-yellow-100 text-yellow-800",
      normal: "bg-green-100 text-green-800",
    };

    const labels = {
      overdue: "Vencido",
      urgent: `${remaining} día`,
      warning: `${remaining} días`,
      normal: `${remaining} días`,
    };

    return (
      <Badge className={variants[urgency]}>
        {labels[urgency]}
      </Badge>
    );
  };

  return (
    <Card data-testid="recent-complaints-table">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Reclamaciones Recientes</CardTitle>
          <div className="flex items-center space-x-3">
            <Button variant="outline" size="sm" className="text-purple-600">
              <span className="material-icons mr-2 text-sm">smart_toy</span>
              Asistente IA
            </Button>
            <Button size="sm" className="btn-primary">
              Ver Todas
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        {complaints.length === 0 ? (
          <div className="text-center py-8">
            <span className="material-icons text-4xl text-gray-400 mb-2">inbox</span>
            <p className="text-gray-600">No hay reclamaciones recientes</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Correlativo</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Consumidor</TableHead>
                  <TableHead>Establecimiento</TableHead>
                  <TableHead>Días Restantes</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {complaints.map((complaint) => (
                  <TableRow key={complaint.id} data-testid={`complaint-row-${complaint.id}`}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{complaint.correlativeNumber}</div>
                        <div className="text-sm text-gray-500">
                          {new Date(complaint.submissionDate).toLocaleDateString('es-PE')}
                        </div>
                      </div>
                    </TableCell>
                    
                    <TableCell>
                      <Badge className={complaint.complaintType === 'reclamo' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}>
                        {COMPLAINT_TYPES[complaint.complaintType as keyof typeof COMPLAINT_TYPES]}
                      </Badge>
                    </TableCell>
                    
                    <TableCell>
                      <div>
                        <div className="font-medium">{complaint.consumerFullName}</div>
                        <div className="text-sm text-gray-500">{complaint.consumerEmail}</div>
                      </div>
                    </TableCell>
                    
                    <TableCell>{complaint.establishmentId}</TableCell>
                    
                    <TableCell>
                      {getUrgencyBadge(complaint.dueDate)}
                    </TableCell>
                    
                    <TableCell>
                      {getStatusBadge(complaint.status)}
                    </TableCell>
                    
                    <TableCell>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`button-view-${complaint.id}`}
                        >
                          <span className="material-icons text-sm">visibility</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-success"
                          data-testid={`button-respond-${complaint.id}`}
                        >
                          <span className="material-icons text-sm">reply</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-purple-600"
                          data-testid={`button-ai-${complaint.id}`}
                        >
                          <span className="material-icons text-sm">psychology</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
