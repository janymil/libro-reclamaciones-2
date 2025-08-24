import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useComplaints } from "@/hooks/use-complaints";
import { useBusinessDays } from "@/hooks/use-business-days";
import { COMPLAINT_STATUSES, COMPLAINT_TYPES, COMPLAINT_PRIORITIES } from "@/lib/constants";
import type { Complaint } from "@shared/schema";

interface ComplaintTableProps {
  showFilters?: boolean;
}

export default function ComplaintTable({ showFilters = true }: ComplaintTableProps) {
  const [filters, setFilters] = useState({
    status: "",
    type: "",
    priority: "",
    search: "",
  });

  const { data: complaints = [], isLoading, error } = useComplaints(filters);
  const { getBusinessDaysRemaining, getUrgencyLevel } = useBusinessDays();

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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Input
                  placeholder="Buscar por número o consumidor..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  data-testid="input-search"
                />
              </div>
              
              <Select
                value={filters.status}
                onValueChange={(value) => setFilters({ ...filters, status: value })}
              >
                <SelectTrigger data-testid="select-status-filter">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los estados</SelectItem>
                  {Object.entries(COMPLAINT_STATUSES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.type}
                onValueChange={(value) => setFilters({ ...filters, type: value })}
              >
                <SelectTrigger data-testid="select-type-filter">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los tipos</SelectItem>
                  {Object.entries(COMPLAINT_TYPES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={filters.priority}
                onValueChange={(value) => setFilters({ ...filters, priority: value })}
              >
                <SelectTrigger data-testid="select-priority-filter">
                  <SelectValue placeholder="Prioridad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas las prioridades</SelectItem>
                  {Object.entries(COMPLAINT_PRIORITIES).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Reclamaciones ({filteredComplaints.length})</CardTitle>
            <div className="flex items-center space-x-2">
              <Button variant="outline" size="sm" data-testid="button-export">
                <span className="material-icons mr-2 text-sm">download</span>
                Exportar
              </Button>
              <Button size="sm" data-testid="button-ai-assistant">
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>N° Correlativo</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Consumidor</TableHead>
                    <TableHead>Establecimiento</TableHead>
                    <TableHead>Días Restantes</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Prioridad</TableHead>
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
                        {getPriorityBadge(complaint.priority)}
                      </TableCell>
                      
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                data-testid={`button-view-${complaint.id}`}
                              >
                                <span className="material-icons text-sm">visibility</span>
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                              <DialogHeader>
                                <DialogTitle>
                                  Reclamación N° {complaint.correlativeNumber}
                                </DialogTitle>
                              </DialogHeader>
                              <ComplaintDetail complaint={complaint} />
                            </DialogContent>
                          </Dialog>

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
    </div>
  );
}

// Complaint Detail Component
function ComplaintDetail({ complaint }: { complaint: Complaint }) {
  return (
    <div className="space-y-6" data-testid="complaint-detail">
      {/* Consumer Information */}
      <Card>
        <CardHeader>
          <CardTitle>Datos del Consumidor</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-500">Nombre Completo</label>
            <p>{complaint.consumerFullName}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Documento</label>
            <p>{complaint.consumerDocumentType} {complaint.consumerDocumentNumber}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Teléfono</label>
            <p>{complaint.consumerPhone}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Email</label>
            <p>{complaint.consumerEmail}</p>
          </div>
          <div className="col-span-2">
            <label className="text-sm font-medium text-gray-500">Domicilio</label>
            <p>{complaint.consumerAddress}</p>
          </div>
        </CardContent>
      </Card>

      {/* Product/Service Information */}
      <Card>
        <CardHeader>
          <CardTitle>Producto/Servicio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Producto/Servicio</label>
              <p>{complaint.productServiceName}</p>
            </div>
            {complaint.purchaseAmount && (
              <div>
                <label className="text-sm font-medium text-gray-500">Monto</label>
                <p>S/ {complaint.purchaseAmount}</p>
              </div>
            )}
            {complaint.receiptNumber && (
              <div>
                <label className="text-sm font-medium text-gray-500">N° Comprobante</label>
                <p>{complaint.receiptNumber}</p>
              </div>
            )}
            {complaint.purchaseDate && (
              <div>
                <label className="text-sm font-medium text-gray-500">Fecha de Compra</label>
                <p>{new Date(complaint.purchaseDate).toLocaleDateString('es-PE')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Complaint Detail */}
      <Card>
        <CardHeader>
          <CardTitle>Detalle de la Reclamación</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-500">Tipo</label>
              <p>
                <Badge className={complaint.complaintType === 'reclamo' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}>
                  {COMPLAINT_TYPES[complaint.complaintType as keyof typeof COMPLAINT_TYPES]}
                </Badge>
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Descripción</label>
              <p className="whitespace-pre-wrap">{complaint.complaintDetail}</p>
            </div>
            {complaint.consumerRequest && (
              <div>
                <label className="text-sm font-medium text-gray-500">Pedido del Consumidor</label>
                <p className="whitespace-pre-wrap">{complaint.consumerRequest}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Provider Response */}
      {complaint.providerResponse && (
        <Card>
          <CardHeader>
            <CardTitle>Respuesta del Proveedor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Respuesta</label>
                <p className="whitespace-pre-wrap">{complaint.providerResponse}</p>
              </div>
              {complaint.responseDate && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Fecha de Respuesta</label>
                  <p>{new Date(complaint.responseDate).toLocaleDateString('es-PE')}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
