import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { complaintFormSchema, type ComplaintFormData } from "@/lib/validation";
import { DOCUMENT_TYPES, COMPLAINT_TYPES, LEGAL_NOTICES } from "@/lib/constants";
import { useCreateComplaint } from "@/hooks/use-complaints";

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
  onSuccess?: (data: any) => void;
}

export default function ComplaintForm({
  businessId,
  establishmentId,
  businessInfo,
  establishmentInfo,
  onSuccess
}: ComplaintFormProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createComplaint = useCreateComplaint();

  const form = useForm<ComplaintFormData>({
    resolver: zodResolver(complaintFormSchema),
    defaultValues: {
      consumerDocumentType: "DNI",
      complaintType: "reclamo",
      responseMethod: "email",
      consentGiven: false,
    },
  });

  const onSubmit = async (data: ComplaintFormData) => {
    try {
      setIsSubmitting(true);

      const complaintData = {
        ...data,
        businessId,
        establishmentId,
        purchaseAmount: data.purchaseAmount ? String(data.purchaseAmount) : undefined,
      };

      const result = await createComplaint.mutateAsync(complaintData);

      toast({
        title: "Reclamación enviada exitosamente",
        description: `Su reclamación ha sido registrada con el número ${result.correlativeNumber}`,
      });

      if (onSuccess) {
        onSuccess(result);
      }

      form.reset();
    } catch (error) {
      toast({
        title: "Error al enviar reclamación",
        description: "Hubo un problema al procesar su solicitud. Intente nuevamente.",
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
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="queja" id="queja" />
                <Label htmlFor="queja" className="font-medium">Queja</Label>
                <span className="text-sm text-gray-500">(Disconformidad con la atención)</span>
              </div>
            </RadioGroup>
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
              placeholder="Describa en detalle su reclamo o queja..."
              data-testid="textarea-complaint-detail"
            />
            {form.formState.errors.complaintDetail && (
              <p className="text-sm text-red-600 mt-2">{form.formState.errors.complaintDetail.message}</p>
            )}
          </CardContent>
        </Card>

        {/* File Attachments */}
        <Card>
          <CardHeader>
            <CardTitle>Adjuntos (Opcional)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <span className="material-icons text-gray-400 text-4xl">cloud_upload</span>
              <p className="mt-2 text-sm text-gray-600">Arrastre archivos aquí o haga clic para seleccionar</p>
              <p className="text-xs text-gray-500 mt-1">PDF, JPG, PNG hasta 5MB</p>
              <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" />
            </div>
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
                <a href="#" className="text-primary underline">Política de Privacidad</a>{" "}
                y la Ley N° 29733. Entiendo que tengo derecho al acceso, rectificación, cancelación y oposición de mis datos.
              </Label>
            </div>
            {form.formState.errors.consentGiven && (
              <p className="text-sm text-red-600 mt-2">{form.formState.errors.consentGiven.message}</p>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-4 pt-6 border-t border-gray-200">
          <Button
            type="submit"
            className="flex-1 btn-primary"
            disabled={isSubmitting}
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
