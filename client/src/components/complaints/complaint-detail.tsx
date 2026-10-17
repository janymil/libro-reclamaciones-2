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

/** Shape of the classification stored in `complaints.ai_classification`. */
interface StoredAIClassification {
  type?: 'reclamo' | 'queja';
  confidence?: number;
  category?: string;
  riskLevel?: 'low' | 'medium' | 'high';
  sentiment?: 'positive' | 'neutral' | 'negative';
  keywords: string[];
  source?: 'ai' | 'fallback';
}

function readAIClassification(value: unknown): StoredAIClassification | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const keywords = Array.isArray(record.keywords)
    ? record.keywords.filter((keyword): keyword is string => typeof keyword === 'string').slice(0, 6)
    : [];

  if (typeof record.type !== 'string' && typeof record.category !== 'string' && keywords.length === 0) {
    return null;
  }

  return {
    type: record.type === 'queja' ? 'queja' : record.type === 'reclamo' ? 'reclamo' : undefined,
    confidence:
      typeof record.confidence === 'number' && Number.isFinite(record.confidence)
        ? record.confidence
        : undefined,
    category: typeof record.category === 'string' ? record.category : undefined,
    riskLevel:
      record.riskLevel === 'low' || record.riskLevel === 'medium' || record.riskLevel === 'high'
        ? record.riskLevel
        : undefined,
    sentiment:
      record.sentiment === 'positive' || record.sentiment === 'neutral' || record.sentiment === 'negative'
        ? record.sentiment
        : undefined,
    keywords,
    source: record.source === 'ai' || record.source === 'fallback' ? record.source : undefined,
  };
}

const RISK_LABEL: Record<NonNullable<StoredAIClassification['riskLevel']>, string> = {
  low: 'Riesgo bajo',
  medium: 'Riesgo medio',
  high: 'Riesgo alto',
};

/**
 * Background AI triage stored when the complaint arrived (type, category, risk,
 * confidence and keywords). It is a suggestion for staff, never an automatic
 * change to the legal record: when the model reads the case as a different type
 * than the consumer chose, the card says so and lets a person decide.
 */
function AIAnalysisSection({ complaint }: { complaint: Complaint }) {
  const analysis = readAIClassification(complaint.aiClassification);
  if (!analysis) {
    return null;
  }

  const typeMismatch = Boolean(analysis.type && analysis.type !== complaint.complaintType);

  return (
    <Card data-testid="ai-analysis-section">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="material-icons text-purple-600">auto_awesome</span>
          Análisis IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {analysis.type && (
            <Badge variant="outline">
              Tipo sugerido: {COMPLAINT_TYPES[analysis.type]}
            </Badge>
          )}
          {analysis.category && <Badge variant="outline">Categoría: {analysis.category}</Badge>}
          {analysis.riskLevel && (
            <Badge
              className={
                analysis.riskLevel === 'high'
                  ? 'bg-red-100 text-red-800'
                  : analysis.riskLevel === 'medium'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-green-100 text-green-800'
              }
            >
              {RISK_LABEL[analysis.riskLevel]}
            </Badge>
          )}
          {typeof analysis.confidence === 'number' && (
            <Badge variant="outline">Confianza: {Math.round(analysis.confidence * 100)}%</Badge>
          )}
          {analysis.source === 'fallback' && (
            <Badge className="bg-gray-100 text-gray-600">Heurístico local (IA no disponible)</Badge>
          )}
        </div>

        {typeMismatch && (
          <p className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            La IA sugiere que este caso es una <strong>{COMPLAINT_TYPES[analysis.type!]}</strong>, pero el
            consumidor registró una{' '}
            <strong>
              {COMPLAINT_TYPES[complaint.complaintType as keyof typeof COMPLAINT_TYPES] ?? complaint.complaintType}
            </strong>
            . El registro no se modificó: verifíquelo antes de responder.
          </p>
        )}

        {analysis.keywords.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500">Palabras clave detectadas</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {analysis.keywords.map((keyword) => (
                <Badge key={keyword} variant="outline" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500">
          Clasificación generada al recibir la reclamación. Es una sugerencia y no reemplaza la revisión
          del equipo.
        </p>
      </CardContent>
    </Card>
  );
}

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

      {/* Background AI triage stored when the complaint arrived */}
      <AIAnalysisSection complaint={complaint} />

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
