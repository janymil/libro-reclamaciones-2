import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPLAINT_TYPES, COMPLAINT_STATUSES, COMPLAINT_PRIORITIES } from "@/lib/constants";
import { useComplaintAttachments, useDeleteAttachment } from "@/hooks/use-complaints";
import { useToast } from "@/hooks/use-toast";
import type { Complaint } from "@shared/schema";

const RESPONSE_METHODS: Record<string, string> = {
  email: "Correo electrónico",
  letter: "Carta / Cargo",
  phone: "Teléfono",
};

const formatSize = (bytes: number): string => {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.round(bytes / 1024)} KB`;
};

/** Evidence files the consumer attached to this complaint (Phase 1.1). */
function AttachmentsSection({ complaintId }: { complaintId: string }) {
  const { toast } = useToast();
  const { data: attachments, isLoading } = useComplaintAttachments(complaintId);
  const deleteAttachment = useDeleteAttachment();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Archivos Adjuntos</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500">Cargando adjuntos...</p>
        </CardContent>
      </Card>
    );
  }

  if (!attachments || attachments.length === 0) {
    return null;
  }

  return (
    <Card data-testid="attachments-section">
      <CardHeader>
        <CardTitle>Archivos Adjuntos ({attachments.length})</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm"
            >
              <a
                href={`/api/attachments/${attachment.id}/file`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center min-w-0 text-primary hover:underline"
              >
                <span className="material-icons text-gray-400 mr-2 text-lg">
                  {attachment.mimeType === "application/pdf" ? "picture_as_pdf" : "image"}
                </span>
                <span className="truncate">{attachment.originalName}</span>
                <span className="text-gray-400 ml-2 whitespace-nowrap">({formatSize(attachment.fileSize)})</span>
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  deleteAttachment.mutate(attachment.id, {
                    onSuccess: () =>
                      toast({ title: "Adjunto eliminado", description: attachment.originalName }),
                    onError: () =>
                      toast({
                        title: "No se pudo eliminar el adjunto",
                        variant: "destructive",
                      }),
                  })
                }
                aria-label={`Eliminar ${attachment.originalName}`}
              >
                <span className="material-icons text-lg">delete</span>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Read-only rendering of a complaint. Shared by the complaints table, the
 * dashboard tables and the alerts section so every entry point shows the same
 * information.
 */
export default function ComplaintDetail({ complaint }: { complaint: Complaint }) {
  return (
    <div className="space-y-6" data-testid="complaint-detail">
      {/* Status summary */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={complaint.complaintType === 'reclamo' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}>
          {COMPLAINT_TYPES[complaint.complaintType as keyof typeof COMPLAINT_TYPES] || complaint.complaintType}
        </Badge>
        <Badge className={`status-${complaint.status.replace('_', '-')}`}>
          {COMPLAINT_STATUSES[complaint.status as keyof typeof COMPLAINT_STATUSES] || complaint.status}
        </Badge>
        <Badge variant="outline">
          Prioridad: {COMPLAINT_PRIORITIES[complaint.priority as keyof typeof COMPLAINT_PRIORITIES] || complaint.priority}
        </Badge>
        <span className="text-sm text-gray-500">
          Presentado el {new Date(complaint.submissionDate).toLocaleDateString('es-PE')} · Vence el{' '}
          {new Date(complaint.dueDate).toLocaleDateString('es-PE')}
        </span>
      </div>

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
          {complaint.guardianFullName && (
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-500">Padre/Madre o Tutor</label>
              <p>
                {complaint.guardianFullName} · {complaint.guardianDocumentType} {complaint.guardianDocumentNumber}
                {complaint.guardianRelationship ? ` (${complaint.guardianRelationship})` : ''}
              </p>
            </div>
          )}
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

      {/* Evidence attachments (Phase 1.1) */}
      <AttachmentsSection complaintId={complaint.id} />

      {/* Provider Response */}
      {(complaint.providerResponse || complaint.providerActions) && (
        <Card>
          <CardHeader>
            <CardTitle>Respuesta del Proveedor</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {complaint.providerResponse && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Respuesta</label>
                  <p className="whitespace-pre-wrap">{complaint.providerResponse}</p>
                </div>
              )}
              {complaint.providerActions && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Acciones adoptadas</label>
                  <p className="whitespace-pre-wrap">{complaint.providerActions}</p>
                </div>
              )}
              {complaint.responseDate && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Fecha de Respuesta</label>
                  <p>{new Date(complaint.responseDate).toLocaleDateString('es-PE')}</p>
                </div>
              )}
              {complaint.responseMethod && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Medio de respuesta</label>
                  <p>{RESPONSE_METHODS[complaint.responseMethod] || complaint.responseMethod}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
