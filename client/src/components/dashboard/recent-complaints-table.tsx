import { useState } from "react";
import { useLocation } from "wouter";
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useBusinessDays } from "@/hooks/use-business-days";
import { COMPLAINT_TYPES } from "@/lib/constants";
import ComplaintDetail from "@/components/complaints/complaint-detail";
import ComplaintResponseDialog from "@/components/complaints/complaint-response-dialog";
import AIAssistantDialog from "@/components/ai/ai-assistant-dialog";
import type { DashboardComplaint } from "@/hooks/use-complaints";

interface RecentComplaintsTableProps {
  complaints?: DashboardComplaint[];
}

export default function RecentComplaintsTable({ complaints = [] }: RecentComplaintsTableProps) {
  const { getBusinessDaysRemaining, getUrgencyLevel } = useBusinessDays();
  const [, setLocation] = useLocation();

  const [viewTarget, setViewTarget] = useState<DashboardComplaint | null>(null);
  const [respondTarget, setRespondTarget] = useState<DashboardComplaint | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

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

  const getUrgencyBadge = (dueDate: Date | string) => {
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Reclamaciones Recientes</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-purple-600"
              onClick={() => setAiOpen(true)}
              data-testid="button-recent-ai"
            >
              <span className="material-icons mr-2 text-sm">smart_toy</span>
              Asistente IA
            </Button>
            <Button
              size="sm"
              className="btn-primary"
              onClick={() => setLocation('/reclamos')}
              data-testid="button-view-all-complaints"
            >
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
            {/* Compact phones: secondary columns are hidden instead of squeezed. */}
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Correlativo</TableHead>
                  <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                  <TableHead>Consumidor</TableHead>
                  <TableHead className="hidden lg:table-cell">Establecimiento</TableHead>
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

                    <TableCell className="hidden sm:table-cell">
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

                    <TableCell className="hidden lg:table-cell">{
                      complaint.establishmentName ?? 'Sin local asignado'
                    }</TableCell>

                    <TableCell>
                      {getUrgencyBadge(complaint.dueDate)}
                    </TableCell>

                    <TableCell>
                      {getStatusBadge(complaint.status)}
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Ver detalle"
                          data-testid={`button-view-${complaint.id}`}
                          onClick={() => setViewTarget(complaint)}
                        >
                          <span className="material-icons text-sm">visibility</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-success"
                          title="Responder"
                          data-testid={`button-respond-${complaint.id}`}
                          onClick={() => setRespondTarget(complaint)}
                        >
                          <span className="material-icons text-sm">reply</span>
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

      {/* Asistente IA */}
      <AIAssistantDialog open={aiOpen} onOpenChange={setAiOpen} />
    </Card>
  );
}
