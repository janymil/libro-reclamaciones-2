import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useComplaints } from "@/hooks/use-complaints";
import { useBusinessDays } from "@/hooks/use-business-days";
import { useToast } from "@/hooks/use-toast";
import { downloadCsv, todayStamp } from "@/lib/export";
import { COMPLAINT_STATUSES, COMPLAINT_TYPES, COMPLAINT_PRIORITIES } from "@/lib/constants";
import ComplaintDetail from "@/components/complaints/complaint-detail";
import ComplaintResponseDialog from "@/components/complaints/complaint-response-dialog";
import ComplaintEditDialog from "@/components/complaints/complaint-edit-dialog";
import AIAssistantDialog from "@/components/ai/ai-assistant-dialog";
import type { Complaint, Establishment } from "@shared/schema";

// Radix UI's Select forbids items whose value is an empty string (it is reserved
// to clear the selection and show the placeholder). "Show everything" is modelled
// with this sentinel and mapped back to "" for the filter state, where an empty
// value already means "no filter" (see useComplaints).
const ALL_FILTER = "all";

interface ComplaintTableProps {
  showFilters?: boolean;
}

const EMPTY_FILTERS = {
  status: "",
  type: "",
  priority: "",
  establishmentId: "",
  dateFrom: "",
  dateTo: "",
  search: "",
};

export default function ComplaintTable({ showFilters = true }: ComplaintTableProps) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const [viewTarget, setViewTarget] = useState<Complaint | null>(null);
  const [respondTarget, setRespondTarget] = useState<Complaint | null>(null);
  const [editTarget, setEditTarget] = useState<Complaint | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  // Sucursal filter options for the current business
  const { data: establishments = [] } = useQuery<Establishment[]>({
    queryKey: ["/api/establishments"],
    queryFn: async () => {
      const response = await fetch("/api/establishments", { credentials: "include" });
      if (!response.ok) {
        return [];
      }
      return response.json();
    },
  });

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const { data: complaints = [], isLoading, error } = useComplaints(filters);
  const { getBusinessDaysRemaining, getUrgencyLevel } = useBusinessDays();
  const { toast } = useToast();

  const filteredComplaints = complaints.filter((complaint) => {
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      return (
        complaint.correlativeNumber.toLowerCase().includes(searchTerm) ||
        complaint.consumerFullName.toLowerCase().includes(searchTerm) ||
        complaint.consumerEmail.toLowerCase().includes(searchTerm)
      );
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    const variants = {
      new: "status-new",
      in_progress: "status-in-progress",
      responded: "status-responded",
      resolved: "status-resolved",
      overdue: "status-overdue",
    };

    return (
      <Badge className={variants[status as keyof typeof variants] || "bg-gray-100 text-gray-800"}>
        {COMPLAINT_STATUSES[status as keyof typeof COMPLAINT_STATUSES] || status}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const variants = {
      low: "priority-low",
      normal: "priority-normal",
      high: "priority-high",
      urgent: "priority-urgent",
    };

    return (
      <Badge className={variants[priority as keyof typeof variants] || "bg-gray-100 text-gray-800"}>
        {COMPLAINT_PRIORITIES[priority as keyof typeof COMPLAINT_PRIORITIES] || priority}
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

  const exportComplaints = () => {
    if (filteredComplaints.length === 0) {
      toast({
        title: "Nada que exportar",
        description: "No hay reclamaciones que coincidan con los filtros aplicados.",
        variant: "destructive",
      });
      return;
    }

    downloadCsv(
      `reclamaciones-${todayStamp()}`,
      filteredComplaints.map((complaint) => ({
        'N° Correlativo': complaint.correlativeNumber,
        Tipo: COMPLAINT_TYPES[complaint.complaintType as keyof typeof COMPLAINT_TYPES] || complaint.complaintType,
        Consumidor: complaint.consumerFullName,
        Documento: `${complaint.consumerDocumentType} ${complaint.consumerDocumentNumber}`,
        Email: complaint.consumerEmail,
        Teléfono: complaint.consumerPhone,
        'Producto/Servicio': complaint.productServiceName,
        Presentado: new Date(complaint.submissionDate).toLocaleDateString('es-PE'),
        'Fecha límite': new Date(complaint.dueDate).toLocaleDateString('es-PE'),
        Estado: COMPLAINT_STATUSES[complaint.status as keyof typeof COMPLAINT_STATUSES] || complaint.status,
        Prioridad: COMPLAINT_PRIORITIES[complaint.priority as keyof typeof COMPLAINT_PRIORITIES] || complaint.priority,
        Vencido: complaint.isOverdue ? 'Sí' : 'No',
      })),
    );

    toast({
      title: "Exportación lista",
      description: `${filteredComplaints.length} reclamaciones exportadas a CSV.`,
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-red-600">
            <span className="material-icons text-4xl mb-2">error</span>
            <p>Error al cargar las reclamaciones</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="complaint-table">
      {/* Filters */}
      {showFilters && (
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <Label htmlFor="filter-search" className="mb-1.5 block text-sm text-gray-600">Buscar</Label>
                <Input
                  id="filter-search"
                  placeholder="Buscar por número o consumidor…"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  data-testid="input-search"
                />
              </div>

              <div>
                <Label htmlFor="filter-status" className="mb-1.5 block text-sm text-gray-600">Estado</Label>
                <Select
                  value={filters.status || ALL_FILTER}
                  onValueChange={(value) => setFilters({ ...filters, status: value === ALL_FILTER ? "" : value })}
                >
                  <SelectTrigger id="filter-status" data-testid="select-status-filter">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>Todos los estados</SelectItem>
                    {Object.entries(COMPLAINT_STATUSES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="filter-type" className="mb-1.5 block text-sm text-gray-600">Tipo</Label>
                <Select
                  value={filters.type || ALL_FILTER}
                  onValueChange={(value) => setFilters({ ...filters, type: value === ALL_FILTER ? "" : value })}
                >
                  <SelectTrigger id="filter-type" data-testid="select-type-filter">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>Todos los tipos</SelectItem>
                    {Object.entries(COMPLAINT_TYPES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="filter-priority" className="mb-1.5 block text-sm text-gray-600">Prioridad</Label>
                <Select
                  value={filters.priority || ALL_FILTER}
                  onValueChange={(value) => setFilters({ ...filters, priority: value === ALL_FILTER ? "" : value })}
                >
                  <SelectTrigger id="filter-priority" data-testid="select-priority-filter">
                    <SelectValue placeholder="Prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>Todas las prioridades</SelectItem>
                    {Object.entries(COMPLAINT_PRIORITIES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="filter-establishment" className="mb-1.5 block text-sm text-gray-600">Sucursal</Label>
                <Select
                  value={filters.establishmentId || ALL_FILTER}
                  onValueChange={(value) =>
                    setFilters({ ...filters, establishmentId: value === ALL_FILTER ? "" : value })
                  }
                >
                  <SelectTrigger id="filter-establishment" data-testid="select-establishment-filter">
                    <SelectValue placeholder="Sucursal" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER}>Todas las sucursales</SelectItem>
                    {establishments.map((establishment) => (
                      <SelectItem key={establishment.id} value={establishment.id}>
                        {establishment.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="filter-date-from" className="mb-1.5 block text-sm text-gray-600">Desde</Label>
                <Input
                  id="filter-date-from"
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                  data-testid="input-filter-date-from"
                />
              </div>

              <div>
                <Label htmlFor="filter-date-to" className="mb-1.5 block text-sm text-gray-600">Hasta</Label>
                <Input
                  id="filter-date-to"
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                  data-testid="input-filter-date-to"
                />
              </div>
            </div>

            {hasActiveFilters && (
              <div className="mt-4 flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilters(EMPTY_FILTERS)}
                  data-testid="button-clear-filters"
                >
                  <span className="material-icons mr-1 text-sm">filter_alt_off</span>
                  Limpiar filtros
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Reclamaciones ({filteredComplaints.length})</CardTitle>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={exportComplaints}
                data-testid="button-export"
              >
                <span className="material-icons mr-2 text-sm">download</span>
                Exportar
              </Button>
              <Button
                size="sm"
                onClick={() => setAiOpen(true)}
                data-testid="button-ai-assistant"
              >
                <span className="material-icons mr-2 text-sm">smart_toy</span>
                Asistente IA
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredComplaints.length === 0 ? (
            <div className="text-center py-8">
              <span className="material-icons text-4xl text-gray-400 mb-2">inbox</span>
              <p className="text-gray-600">No se encontraron reclamaciones</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              {/* min-width keeps the columns readable on a phone: the secondary
                  columns above are hidden below their breakpoint, so the table
                  never squeezes into unreadable cells. */}
              <Table className="min-w-[560px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Correlativo</TableHead>
                    <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                    <TableHead>Consumidor</TableHead>
                    <TableHead className="hidden lg:table-cell">Establecimiento</TableHead>
                    <TableHead>Días Restantes</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden md:table-cell">Prioridad</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredComplaints.map((complaint) => (
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

                      <TableCell className="hidden lg:table-cell">{complaint.establishmentId}</TableCell>

                      <TableCell>
                        {getUrgencyBadge(complaint.dueDate)}
                      </TableCell>

                      <TableCell>
                        {getStatusBadge(complaint.status)}
                      </TableCell>

                      <TableCell className="hidden md:table-cell">
                        {getPriorityBadge(complaint.priority)}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Ver detalle"
                            onClick={() => setViewTarget(complaint)}
                            data-testid={`button-view-${complaint.id}`}
                          >
                            <span className="material-icons text-sm">visibility</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-success"
                            title="Responder"
                            onClick={() => setRespondTarget(complaint)}
                            data-testid={`button-respond-${complaint.id}`}
                          >
                            <span className="material-icons text-sm">reply</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-blue-600"
                            title="Editar estado y prioridad"
                            onClick={() => setEditTarget(complaint)}
                            data-testid={`button-edit-${complaint.id}`}
                          >
                            <span className="material-icons text-sm">edit</span>
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

      {/* Ver detalle */}
      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogTitle>Reclamación N° {viewTarget?.correlativeNumber}</DialogTitle>
          {viewTarget && <ComplaintDetail complaint={viewTarget} />}
        </DialogContent>
      </Dialog>

      {/* Responder (flujo legal de 15 días hábiles) */}
      <ComplaintResponseDialog
        complaint={respondTarget}
        open={!!respondTarget}
        onOpenChange={(open) => !open && setRespondTarget(null)}
      />

      {/* Editar estado/prioridad */}
      <ComplaintEditDialog
        complaint={editTarget}
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      />

      {/* Asistente IA */}
      <AIAssistantDialog open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}
