import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useUpgradeToast } from "@/hooks/use-plan-upgrade";
import PlanGate from "@/components/plan/plan-gate";
import { apiRequest } from "@/lib/queryClient";
import type { LibroConfiguration } from "@shared/schema";

/**
 * Personalización (Phases 2.8 and 3.10): per-business branding, email
 * templates, confirmation text and the AI brand voice (tone + policies) used
 * when drafting responses to consumers.
 */

const formFields = [
  {
    id: "brandColor",
    label: "Color de marca (hex)",
    placeholder: "#3b82f6",
    type: "input" as const,
    description: "Acento visual del portal público.",
  },
  {
    id: "emailSubjectPrefix",
    label: "Prefijo de asunto en correos",
    placeholder: "[MiEmpresa]",
    type: "input" as const,
    description: "Ej.: \"[MiEmpresa]\" al inicio de cada asunto.",
  },
  {
    id: "emailHeaderText",
    label: "Encabezado de correos",
    placeholder: "Gracias por escribir a MiEmpresa...",
    type: "textarea" as const,
    description: "Aparece arriba de los correos de confirmación y respuesta.",
  },
  {
    id: "emailFooterText",
    label: "Pie de correos",
    placeholder: "MiEmpresa SAC - RUC 20XXX - atención@miempresa.pe",
    type: "textarea" as const,
    description: "Aparece al final de los correos.",
  },
  {
    id: "confirmationMessage",
    label: "Mensaje de confirmación del portal",
    placeholder: "¡Gracias! Tu reclamo fue registrado...",
    type: "textarea" as const,
    description: "Texto que ve el consumidor al enviar su reclamación.",
  },
  {
    id: "brandTone",
    label: "Tono de marca para la IA",
    placeholder: "Cercano pero formal, tuteamos al cliente, firmamos como 'El equipo de MiEmpresa'...",
    type: "textarea" as const,
    description: "La IA redacta respuestas con este tono (plan Pro).",
  },
  {
    id: "brandPolicies",
    label: "Políticas internas para la IA",
    placeholder: "Reembolsos hasta 30 días con comprobante; cambios solo por defecto de fábrica; nunca ofrecer descuentos...",
    type: "textarea" as const,
    description: "Reglas que la IA aplica al proponer soluciones (no se comparten con el consumidor).",
  },
];

type FormValues = Record<string, string>;

export default function CustomizationPage() {
  const { toast } = useToast();
  const upgradeToast = useUpgradeToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<FormValues>({});

  const { data: config } = useQuery<LibroConfiguration | null>({
    queryKey: ["/api/libro-configuration"],
  });

  useEffect(() => {
    if (config) {
      setValues({
        brandColor: config.brandColor ?? "",
        emailSubjectPrefix: config.emailSubjectPrefix ?? "",
        emailHeaderText: config.emailHeaderText ?? "",
        emailFooterText: config.emailFooterText ?? "",
        confirmationMessage: config.confirmationMessage ?? "",
        brandTone: config.brandTone ?? "",
        brandPolicies: config.brandPolicies ?? "",
      });
    }
  }, [config]);

  const save = useMutation({
    mutationFn: async (updates: FormValues) => {
      // Only send fields that changed. Values are compared in their stored form
      // (empty string means "no value"), otherwise an untouched field that is
      // null in the database would be sent as a template change and rejected
      // with a plan error for no reason.
      const payload: Record<string, string | null> = {};

      for (const field of formFields) {
        const nextValue = (updates[field.id] ?? "").trim() ? updates[field.id] : null;
        const currentValue = ((config as any)?.[field.id] ?? null) as string | null;
        if (currentValue !== nextValue) {
          payload[field.id] = nextValue;
        }
      }

      if (Object.keys(payload).length === 0) {
        throw new Error("No hay cambios por guardar.");
      }

      const response = await apiRequest("PATCH", "/api/libro-configuration", payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/libro-configuration"] });
      toast({ title: "Personalización guardada", description: "Los correos y el portal usarán la nueva configuración." });
    },
    onError: (error: Error) => {
      // Sending a Pro-only field (plantillas, tono de marca) must say which
      // plan unlocks it, with the upgrade one click away.
      upgradeToast(error, "No se pudo guardar");
    },
  });

  return (
    <AppLayout title="Personalización" subtitle="Plantillas, branding y voz de marca de la IA">
      <div className="max-w-3xl mx-auto space-y-6">
        <PlanGate
          feature="templates"
          title="Plantillas, branding y voz de marca"
          description="Color, correos con su marca y el tono con el que la IA redacta sus respuestas."
        >
        <Card>
          <CardHeader>
            <CardTitle>Plantillas y voz de marca</CardTitle>
            <CardDescription>
              Todo es opcional: sin configurar se usan los textos estándar de LibroVirtual.pe.
              Las plantillas de correo y el color requieren plan Pro; la voz de la IA está disponible
              con la IA activa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {formFields.map((field) => (
              <div key={field.id}>
                <Label htmlFor={field.id}>{field.label}</Label>
                {field.type === "input" ? (
                  <Input
                    id={field.id}
                    value={values[field.id] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(e) => setValues((current) => ({ ...current, [field.id]: e.target.value }))}
                    data-testid={`input-${field.id}`}
                  />
                ) : (
                  <Textarea
                    id={field.id}
                    rows={field.id === "brandPolicies" ? 5 : 3}
                    value={values[field.id] ?? ""}
                    placeholder={field.placeholder}
                    onChange={(e) => setValues((current) => ({ ...current, [field.id]: e.target.value }))}
                    data-testid={`input-${field.id}`}
                  />
                )}
                <p className="text-xs text-gray-500 mt-1">{field.description}</p>
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                className="btn-primary"
                onClick={() => save.mutate(values)}
                disabled={save.isPending}
                data-testid="button-save-customization"
              >
                {save.isPending ? "Guardando..." : "Guardar personalización"}
              </Button>
            </div>
          </CardContent>
        </Card>
        </PlanGate>
      </div>
    </AppLayout>
  );
}
