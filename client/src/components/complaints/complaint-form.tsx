import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { complaintFormSchema, type ComplaintFormData } from "@/lib/validation";
import { DOCUMENT_TYPES, LEGAL_NOTICES } from "@/lib/constants";
import { useCreateComplaint, useAIPublicAssist } from "@/hooks/use-complaints";
import { useCaptchaChallenge } from "@/hooks/use-captcha";
import { requestSolvedCaptcha } from "@/lib/pow";
import { buildConsumerDraftContext } from "@shared/consumer-draft-context";

const MAX_FILE_SIZE_MB = 5;
const MAX_FILES = 5;

/** Parses the error message a failed apiRequest carries (JSON body text). */
function parseApiError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  const match = message.match(/^\d+:\s*(\{.*\})$/s);
  if (match) {
    try {
      const body = JSON.parse(match[1]);
      if (typeof body.message === "string") {
        return body.message;
      }
    } catch {
      // fall through
    }
  }
  return message || fallback;
}


interface ComplaintFormProps {
  businessId: string;
  establishmentId: string;
  businessInfo?: {
    businessName: string;
    ruc: string;
    address: string;
  };
  establishmentInfo?: {
    name: string;
    address: string;
  };
  /** Complaint types the business's plan accepts (Gratis = Reclamos only). */
  allowedComplaintTypes?: Array<"reclamo" | "queja">;
  /**
   * The business's own privacy policy page (Ley 29733), when it published one in
   * Personalización: the consent checkbox opens it in a new tab.
   */
  privacyPolicyUrl?: string | null;
  /**
   * Platform-hosted policy of this book, used when the business published none.
   * Without it the consent text used to link to "#", i.e. to itself.
   */
  privacyPolicyFallbackHref?: string;
  onSuccess?: (data: any) => void;
}

export default function ComplaintForm({
  businessId,
  establishmentId,
  businessInfo,
  establishmentInfo,
  allowedComplaintTypes = ["reclamo", "queja"],
  privacyPolicyUrl,
  privacyPolicyFallbackHref,
  onSuccess
}: ComplaintFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  // The AI button needs its own solved challenge and its own spinner: it is a
  // separate, costlier request than the submission.
  const [isAssistPreparing, setIsAssistPreparing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const createComplaint = useCreateComplaint();
  const aiAssist = useAIPublicAssist();

  // CAPTCHA (Phase 1.5): a proof-of-work challenge is fetched when the form
  // renders and solved in the background, so the visitor has nothing to read or
  // type - the submission simply carries the solution. It is replaced on demand
  // whenever the server rejects one (expired, already used, or submitted too
  // fast for a human to have filled the form).
  const proof = useCaptchaChallenge();

  const form = useForm<ComplaintFormData>({
    resolver: zodResolver(complaintFormSchema),
    defaultValues: {
      consumerDocumentType: "DNI",
      consumerIsMinor: false,
      guardianDocumentType: "DNI",
      complaintType: "reclamo",
      responseMethod: "email",
      consentGiven: false,
    },
  });

  const addFiles = (selected: FileList | null) => {
    if (!selected) {
      return;
    }

    const valid: File[] = [];
    const rejected: string[] = [];

    for (const file of Array.from(selected)) {
      const isAllowed = /\.(pdf|jpe?g|png)$/i.test(file.name) || ["application/pdf", "image/jpeg", "image/png"].includes(file.type);
      if (!isAllowed) {
        rejected.push(`${file.name}: solo PDF, JPG o PNG`);
      } else if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        rejected.push(`${file.name}: supera los ${MAX_FILE_SIZE_MB} MB`);
      } else {
        valid.push(file);
      }
    }

    setFiles((current) => [...current, ...valid].slice(0, MAX_FILES));

    if (rejected.length > 0) {
      toast({
        title: "Algunos archivos fueron descartados",
        description: rejected.join(" · "),
        variant: "destructive",
      });
    }
  };

  /** Uploads the evidence files right after the complaint is registered. */
  const uploadAttachments = async (complaintId: string, documentNumber: string) => {
    if (files.length === 0) {
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("documento", documentNumber);
      files.forEach((file) => formData.append("files", file));

      const response = await fetch(`/api/public/complaints/${complaintId}/attachments`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || "No se pudieron subir los adjuntos");
      }
    } catch (error) {
      toast({
        title: "Adjuntos no subidos",
        description: error instanceof Error ? error.message : "Intente nuevamente",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setFiles([]);
    }
  };

  const onSubmit = async (data: ComplaintFormData) => {
    try {
      setIsSubmitting(true);

      // Automatic verification: wait for the solved challenge (usually already
      // done) before sending anything.
      let solved;
      try {
        solved = await proof.ensureSolved();
      } catch {
        toast({
          title: "Verificación de seguridad pendiente",
          description:
            proof.error ??
            "No se pudo completar la verificación automática. Reintente en unos segundos.",
          variant: "destructive",
        });
        return;
      }

      const { consumerIsMinor, ...formData } = data;

      const complaintData = {
        ...formData,
        // Guardian data only travels with the complaint when it is for a minor,
        // so adult complaints never store a stray guardian document type.
        guardianFullName: consumerIsMinor ? formData.guardianFullName : undefined,
        guardianDocumentType: consumerIsMinor ? formData.guardianDocumentType : undefined,
        guardianDocumentNumber: consumerIsMinor ? formData.guardianDocumentNumber : undefined,
        guardianRelationship: consumerIsMinor ? formData.guardianRelationship : undefined,
        businessId,
        establishmentId,
        purchaseAmount: data.purchaseAmount ? String(data.purchaseAmount) : undefined,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
        // Anti-spam (Phase 1.5): the solved proof of work + the honeypot.
        captchaToken: solved.token,
        captchaAnswer: solved.solution,
        website: "", // honeypot: must stay empty
      };

      const result = await createComplaint.mutateAsync(complaintData as any);

      // Evidence upload (Phase 1.1) - non blocking for the confirmation
      void uploadAttachments(result.complaintId, data.consumerDocumentNumber);

      toast({
        title: "Reclamación enviada exitosamente",
        description: `Su reclamación ha sido registrada con el número ${result.correlativeNumber}`,
      });

      if (onSuccess) {
        onSuccess(result);
      }

      form.reset();
      proof.refresh();
    } catch (error) {
      const message = parseApiError(error, "Hubo un problema al procesar su solicitud. Intente nuevamente.");
      // A rejected challenge (expired, consumed, too fast) needs a fresh one.
      if (/captcha/i.test(message)) {
        proof.refresh();
      }
      toast({
        title: "Error al enviar reclamación",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8" data-testid="complaint-form">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Libro de Reclamaciones Virtual</h2>
        <p className="text-gray-600">Conforme al DS 011-2011-PCM y modificatorias</p>
        
        <Card className="mt-4 border-blue-200 bg-blue-50">
          <CardContent className="pt-4">
            <p className="text-sm text-blue-800 flex items-center justify-center">
              <span className="material-icons text-sm mr-2">info</span>
              {LEGAL_NOTICES.COMPLAINT_DISCLAIMER}
            </p>
          </CardContent>
        </Card>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Business Information */}
        <Card>
          <CardHeader>
            <CardTitle>Datos del Establecimiento</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Razón Social</Label>
              <Input
                value={businessInfo?.businessName || ""}
                readOnly
                className="bg-gray-100"
                data-testid="business-name"
              />
            </div>
            <div>
              <Label>RUC</Label>
              <Input
                value={businessInfo?.ruc || ""}
                readOnly
                className="bg-gray-100"
                data-testid="business-ruc"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Dirección del Establecimiento</Label>
              <Input
                value={establishmentInfo?.address || businessInfo?.address || ""}
                readOnly
                className="bg-gray-100"
                data-testid="establishment-address"
              />
            </div>
          </CardContent>
        </Card>

        {/* Consumer Information */}
        <Card>
          <CardHeader>
            <CardTitle>Datos del Consumidor *</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="consumerFullName">Nombres y Apellidos *</Label>
              <Input
                id="consumerFullName"
                {...form.register("consumerFullName")}
                data-testid="input-consumer-name"
              />
              {form.formState.errors.consumerFullName && (
                <p className="text-sm text-red-600">{form.formState.errors.consumerFullName.message}</p>
              )}
            </div>
            
            <div>
              <Label>Documento de Identidad *</Label>
              <div className="flex space-x-2">
                <Select
                  value={form.watch("consumerDocumentType")}
                  onValueChange={(value) => form.setValue("consumerDocumentType", value as keyof typeof DOCUMENT_TYPES)}
                >
                  <SelectTrigger className="w-32" data-testid="select-document-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(DOCUMENT_TYPES).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  {...form.register("consumerDocumentNumber")}
                  placeholder="Número de documento"
                  className="flex-1"
                  data-testid="input-document-number"
                />
              </div>
              {form.formState.errors.consumerDocumentNumber && (
                <p className="text-sm text-red-600">{form.formState.errors.consumerDocumentNumber.message}</p>
              )}
            </div>

            <div className="md:col-span-2">
              <Label htmlFor="consumerAddress">Domicilio *</Label>
              <Input
                id="consumerAddress"
                {...form.register("consumerAddress")}
                data-testid="input-consumer-address"
              />
              {form.formState.errors.consumerAddress && (
                <p className="text-sm text-red-600">{form.formState.errors.consumerAddress.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="consumerPhone">Teléfono *</Label>
              <Input
                id="consumerPhone"
                type="tel"
                {...form.register("consumerPhone")}
                data-testid="input-consumer-phone"
              />
              {form.formState.errors.consumerPhone && (
                <p className="text-sm text-red-600">{form.formState.errors.consumerPhone.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="consumerEmail">Correo Electrónico *</Label>
              <Input
                id="consumerEmail"
                type="email"
                {...form.register("consumerEmail")}
                data-testid="input-consumer-email"
              />
              {form.formState.errors.consumerEmail && (
                <p className="text-sm text-red-600">{form.formState.errors.consumerEmail.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Minor / guardian (Anexo 1: datos del representante si es menor de edad) */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="consumerIsMinor" className="font-medium">
                  La reclamación corresponde a un menor de edad
                </Label>
                <p className="text-sm text-gray-500">
                  Si es menor, la hoja de reclamación debe registrar los datos del padre, madre o tutor.
                </p>
              </div>
              <Switch
                id="consumerIsMinor"
                checked={form.watch("consumerIsMinor") ?? false}
                onCheckedChange={(checked) =>
                  form.setValue("consumerIsMinor", checked, { shouldValidate: true })
                }
                data-testid="switch-consumer-is-minor"
              />
            </div>

            {form.watch("consumerIsMinor") && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                <div>
                  <Label htmlFor="guardianFullName">Padre/Madre/Tutor — Nombres y Apellidos *</Label>
                  <Input
                    id="guardianFullName"
                    {...form.register("guardianFullName")}
                    data-testid="input-guardian-name"
                  />
                  {form.formState.errors.guardianFullName && (
                    <p className="text-sm text-red-600">{form.formState.errors.guardianFullName.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="guardianRelationship">Relación con el menor *</Label>
                  <Input
                    id="guardianRelationship"
                    placeholder="Madre / Padre / Tutor"
                    {...form.register("guardianRelationship")}
                    data-testid="input-guardian-relationship"
                  />
                  {form.formState.errors.guardianRelationship && (
                    <p className="text-sm text-red-600">{form.formState.errors.guardianRelationship.message}</p>
                  )}
                </div>

                <div>
                  <Label>Documento del representante *</Label>
                  <div className="flex space-x-2">
                    <Select
                      value={form.watch("guardianDocumentType")}
                      onValueChange={(value) =>
                        form.setValue("guardianDocumentType", value as keyof typeof DOCUMENT_TYPES, {
                          shouldValidate: true,
                        })
                      }
                    >
                      <SelectTrigger className="w-32" data-testid="select-guardian-document-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(DOCUMENT_TYPES).map(([key, label]) => (
                          <SelectItem key={key} value={key}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      {...form.register("guardianDocumentNumber")}
                      placeholder="Número de documento"
                      className="flex-1"
                      data-testid="input-guardian-document-number"
                    />
                  </div>
                  {form.formState.errors.guardianDocumentNumber && (
                    <p className="text-sm text-red-600">{form.formState.errors.guardianDocumentNumber.message}</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product/Service Information */}
        <Card>
          <CardHeader>
            <CardTitle>Identificación del Producto o Servicio *</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="productServiceName">Nombre del Producto/Servicio *</Label>
              <Input
                id="productServiceName"
                {...form.register("productServiceName")}
                data-testid="input-product-name"
              />
              {form.formState.errors.productServiceName && (
                <p className="text-sm text-red-600">{form.formState.errors.productServiceName.message}</p>
              )}
            </div>

            <div>
              <Label htmlFor="purchaseAmount">Monto (S/.)</Label>
              <Input
                id="purchaseAmount"
                type="number"
                step="0.01"
                {...form.register("purchaseAmount", { valueAsNumber: true })}
                data-testid="input-purchase-amount"
              />
            </div>

            <div>
              <Label htmlFor="purchaseDate">Fecha de Consumo</Label>
              <Input
                id="purchaseDate"
                type="date"
                {...form.register("purchaseDate")}
                data-testid="input-purchase-date"
              />
            </div>

            <div>
              <Label htmlFor="receiptNumber">N° Comprobante</Label>
              <Input
                id="receiptNumber"
                {...form.register("receiptNumber")}
                data-testid="input-receipt-number"
              />
            </div>
          </CardContent>
        </Card>

        {/* Complaint Type */}
        <Card>
          <CardHeader>
            <CardTitle>Tipo de Solicitud *</CardTitle>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={form.watch("complaintType")}
              onValueChange={(value) => form.setValue("complaintType", value as "reclamo" | "queja")}
              data-testid="complaint-type-radio"
            >
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="reclamo" id="reclamo" />
                <Label htmlFor="reclamo" className="font-medium">Reclamo</Label>
                <span className="text-sm text-gray-500">(Disconformidad con productos o servicios)</span>
              </div>
              {allowedComplaintTypes.includes("queja") && (
                <div className="flex items-center space-x-3">
                  <RadioGroupItem value="queja" id="queja" />
                  <Label htmlFor="queja" className="font-medium">Queja</Label>
                  <span className="text-sm text-gray-500">(Disconformidad con la atención)</span>
                </div>
              )}
            </RadioGroup>
            {!allowedComplaintTypes.includes("queja") && (
              <p className="text-xs text-gray-500 mt-2" data-testid="queja-not-in-plan">
                Este libro acepta Reclamos. Las Quejas están disponibles en el plan Básico.
              </p>
            )}
            {form.formState.errors.complaintType && (
              <p className="text-sm text-red-600 mt-2">{form.formState.errors.complaintType.message}</p>
            )}
          </CardContent>
        </Card>

        {/* Complaint Detail */}
        <Card>
          <CardHeader>
            <CardTitle>Detalle de la Reclamación *</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              {...form.register("complaintDetail")}
              rows={6}
              placeholder="Describa en detalle su reclamo o queja... (producto o servicio, qué pasó, cuándo y qué solución solicita)"
              data-testid="textarea-complaint-detail"
            />
            {form.formState.errors.complaintDetail && (
              <p className="text-sm text-red-600 mt-2">{form.formState.errors.complaintDetail.message}</p>
            )}

            {/* AI draft assistant: helps consumers write complete complaints */}
            <div className="mt-3 space-y-3" data-testid="ai-draft-assistant">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  // Each accepted call costs money on the upstream model, so the
                  // endpoint is CAPTCHA-gated: fetch a dedicated challenge for
                  // this click (the submission keeps its own).
                  setIsAssistPreparing(true);
                  try {
                    const solved = await requestSolvedCaptcha();
                    aiAssist.mutate(
                      {
                        text: form.watch("complaintDetail") || "",
                        // The visitor already filled the product, the amount, the
                        // purchase date and the receipt number in the fields
                        // above; sending them stops the assistant from listing as
                        // "missing" what the form already holds.
                        // buildConsumerDraftContext keeps only those non-personal
                        // fields, so a name, a document or a phone number never
                        // leaves the browser (shared/consumer-draft-context.ts).
                        context: buildConsumerDraftContext(form.getValues()),
                        captchaToken: solved.token,
                        captchaAnswer: solved.solution,
                      },
                      {
                        onError: (error: unknown) =>
                          toast({
                            title: "No se pudo revisar el borrador",
                            description: parseApiError(
                              error,
                              "Intente nuevamente en unos segundos."
                            ),
                            variant: "destructive",
                          }),
                      }
                    );
                  } catch (error) {
                    toast({
                      title: "No se pudo verificar la solicitud",
                      description:
                        error instanceof Error
                          ? error.message
                          : "Intente nuevamente en unos segundos.",
                      variant: "destructive",
                    });
                  } finally {
                    setIsAssistPreparing(false);
                  }
                }}
                disabled={aiAssist.isPending || isAssistPreparing || (form.watch("complaintDetail") || "").trim().length < 10}
                data-testid="button-ai-review"
              >
                <span className="material-icons mr-1 text-sm">psychology</span>
                {aiAssist.isPending || isAssistPreparing ? "Revisando..." : "Revisar mi borrador con IA"}
              </Button>

              {aiAssist.data && (
                <div className="rounded-lg border p-3 bg-gray-50 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge className={aiAssist.data.isComplete ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                      {aiAssist.data.isComplete ? "Borrador completo" : "Borrador incompleto"}
                    </Badge>
                    {aiAssist.data.source === 'fallback' && (
                      <Badge className="bg-gray-100 text-gray-600">Asistente básico</Badge>
                    )}
                  </div>
                  {aiAssist.variables?.context && (
                    <p className="text-xs text-gray-500" data-testid="ai-review-context-note">
                      La revisión incluyó los datos que ya completó en el formulario (producto, monto,
                      fecha y comprobante), sin sus datos personales.
                    </p>
                  )}
                  {aiAssist.data.missingFields.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-600">Falta mencionar:</p>
                      <ul className="list-disc list-inside text-xs text-gray-600">
                        {aiAssist.data.missingFields.map((field: string, index: number) => (
                          <li key={index}>{field}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {aiAssist.data.suggestions.length > 0 && (
                    <ul className="list-disc list-inside text-xs text-gray-600">
                      {aiAssist.data.suggestions.map((suggestion: string, index: number) => (
                        <li key={index}>{suggestion}</li>
                      ))}
                    </ul>
                  )}
                  {aiAssist.data.improvedText && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        form.setValue("complaintDetail", aiAssist.data!.improvedText!, { shouldValidate: true });
                        toast({
                          title: "Borrador mejorado",
                          description: "Revise el texto mejorado antes de enviar su reclamación.",
                        });
                      }}
                      data-testid="button-apply-improved"
                    >
                      Usar versión mejorada
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* File Attachments (Phase 1.1) */}
        <Card>
          <CardHeader>
            <CardTitle>Adjuntos (Opcional)</CardTitle>
          </CardHeader>
          <CardContent>
            <button
              type="button"
              className="w-full border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-select-files"
              aria-label="Seleccionar archivos de evidencia"
            >
              <span className="material-icons text-gray-400 text-4xl">cloud_upload</span>
              <p className="mt-2 text-sm text-gray-600">Arrastre archivos aquí o haga clic para seleccionar</p>
              <p className="text-xs text-gray-500 mt-1">
                PDF, JPG, PNG hasta {MAX_FILE_SIZE_MB}MB · máximo {MAX_FILES} archivos
              </p>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
              data-testid="input-files"
            />

            {files.length > 0 && (
              <ul className="mt-4 space-y-2" data-testid="list-selected-files">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="flex items-center min-w-0">
                      <span className="material-icons text-gray-400 mr-2 text-lg">
                        {file.type === "application/pdf" ? "picture_as_pdf" : "image"}
                      </span>
                      <span className="truncate">{file.name}</span>
                      <span className="text-gray-400 ml-2 whitespace-nowrap">
                        ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                      aria-label={`Quitar ${file.name}`}
                      data-testid={`button-remove-file-${index}`}
                    >
                      <span className="material-icons text-lg">delete</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {isUploading && (
              <p className="mt-2 text-sm text-gray-500" data-testid="uploading-indicator">
                Subiendo adjuntos...
              </p>
            )}
          </CardContent>
        </Card>

        {/* Data Protection Consent */}
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="consentGiven"
                checked={form.watch("consentGiven")}
                onCheckedChange={(checked) => form.setValue("consentGiven", checked as boolean)}
                data-testid="checkbox-consent"
              />
              <Label htmlFor="consentGiven" className="text-sm text-gray-700 leading-relaxed">
                Acepto el tratamiento de mis datos personales conforme a la{" "}
                {privacyPolicyUrl ? (
                  // The business's own policy: it lives on its website, so it opens
                  // in a new tab and never navigates the consumer away from a form
                  // they have already half filled in.
                  <a
                    href={privacyPolicyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                    data-testid="link-privacy-policy"
                  >
                    Política de Privacidad
                  </a>
                ) : privacyPolicyFallbackHref ? (
                  <a
                    href={privacyPolicyFallbackHref}
                    className="text-primary underline"
                    data-testid="link-privacy-policy"
                  >
                    Política de Privacidad
                  </a>
                ) : (
                  // The public portal always passes one of the two; this keeps the
                  // component from rendering a link that goes nowhere if it ever
                  // does not.
                  <span className="font-medium">Política de Privacidad</span>
                )}{" "}
                y la Ley N° 29733. Entiendo que tengo derecho al acceso, rectificación, cancelación y oposición de mis datos.
              </Label>
            </div>
            {form.formState.errors.consentGiven && (
              <p className="text-sm text-red-600 mt-2">{form.formState.errors.consentGiven.message}</p>
            )}
          </CardContent>
        </Card>

        {/* Verification: proof-of-work CAPTCHA + honeypot (Phase 1.5) */}
        <Card>
          <CardHeader>
            <CardTitle>Verificación de Seguridad</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Nothing to answer: the browser solves the puzzle in the
                background while the form is filled in. Rendered as a status so
                it is announced by screen readers and needs no input at all. */}
            <div
              className="flex items-center gap-2"
              data-testid="captcha-status"
              data-status={proof.status}
              aria-live="polite"
            >
              {proof.status === "solving" && (
                <>
                  <span className="material-icons text-gray-400 animate-spin">progress_activity</span>
                  <p className="text-sm text-gray-600">
                    Verificando que eres una persona… (automático, no requiere ninguna acción)
                  </p>
                </>
              )}

              {proof.status === "ready" && (
                <>
                  <span className="material-icons text-green-600">verified_user</span>
                  <p className="text-sm text-green-700">
                    Verificación completada automáticamente. No requiere ninguna acción de su parte.
                  </p>
                </>
              )}

              {proof.status === "error" && (
                <>
                  <span className="material-icons text-red-600">report_problem</span>
                  <div className="space-y-2">
                    <p className="text-sm text-red-600">{proof.error}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={proof.refresh}
                      data-testid="button-captcha-retry"
                    >
                      Reintentar verificación
                    </Button>
                  </div>
                </>
              )}
            </div>

            {/* Honeypot: invisible to humans, irresistible to bots */}
            <div aria-hidden="true" className="hidden">
              <Label htmlFor="website">Sitio web</Label>
              <Input id="website" tabIndex={-1} autoComplete="off" />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 pt-6 border-t border-gray-200">
          <Button
            type="submit"
            className="flex-1 btn-primary"
            disabled={isSubmitting || isUploading}
            data-testid="button-submit-complaint"
          >
            {isSubmitting ? "Enviando..." : "Enviar Reclamación"}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => form.reset()}
            data-testid="button-clear-form"
          >
            Limpiar Formulario
          </Button>
        </div>
      </form>
    </div>
  );
}
