import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import AppLayout from "@/components/layout/app-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUpgradeToast } from "@/hooks/use-plan-upgrade";
import PlanGate from "@/components/plan/plan-gate";
import { apiRequest } from "@/lib/queryClient";
import type { LibroConfiguration } from "@shared/schema";

/**
 * Personalización (Phases 2.8, 3.10 and the Ley 29733 privacy link): per-business
 * branding, email templates, confirmation text, the AI brand voice (tone +
 * policies) and the privacy policy page the public consent checkbox links to.
 */

/**
 * The legal link of the public form (Ley 29733).
 *
 * Kept out of the Pro templates below on purpose: the consent checkbox asks the
 * consumer to accept a privacy policy, so every plan must be able to point that
 * link at a real document instead of the "#" it used to have. Empty means "use
 * the hosted policy page of the book".
 */
const legalFields = [
  {
    id: "privacyPolicyUrl",
    label: "URL de tu Política de Privacidad",
    placeholder: "https://miempresa.pe/politica-de-privacidad",
    type: "input" as const,
    description:
      "El enlace que abre el consumidor en “Acepto el tratamiento de mis datos”. Si lo deja vacío, el portal enlaza a la política de privacidad del libro generada por Librodigital.pe.",
  },
];

/** Pro-only templates and AI voice: rendered behind the plan gate. */
const templateFields = [
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

/**
 * Who the consumer-facing email comes from.
 *
 * Not part of the Pro templates: the consumer filed the complaint with the
 * business, so the message must name it and an answer must reach it on every
 * plan. Only a full FROM address of the business's own needs its domain
 * verified by the mail host, which is why that single field is gated below.
 */
const emailIdentityFields = [
  {
    id: "emailFromName",
    label: "Nombre visible del remitente",
    placeholder: "MiEmpresa",
    type: "input" as const,
    description:
      "El nombre que ve el consumidor en su bandeja de entrada (\"MiEmpresa - Confirmación de reclamo\"). Si lo deja vacío se usa la razón social o el nombre comercial de su empresa.",
  },
  {
    id: "emailReplyTo",
    label: "Correo para respuestas",
    placeholder: "atencion@miempresa.pe",
    type: "input" as const,
    description:
      "Dirección a la que llega la respuesta del consumidor, y que se imprime como dato de contacto en el correo. Si lo deja vacío, las respuestas van al correo de notificaciones de su Libro.",
  },
];

/** Pro: sending as the business's own address (needs a verified domain). */
const emailSenderFields = [
  {
    id: "emailFromAddress",
    label: "Correo remitente propio",
    placeholder: "reclamos@miempresa.pe",
    type: "input" as const,
    description:
      "Requiere verificar su dominio con nuestro servicio de correo (registros SPF/DKIM). No es inmediato: nuestro equipo debe habilitar el dominio. Mientras no esté verificado, los correos salen desde nuestra dirección con el nombre visible que indicó arriba, y las respuestas siguen llegando a su empresa.",
  },
];

/** Every editable field, in the order the save payload compares them. */
const formFields = [...templateFields, ...emailIdentityFields, ...emailSenderFields, ...legalFields];

type FormValues = Record<string, string>;

/** Effective sender of the consumer-facing emails, as the server resolves it. */
interface EmailSenderStatus {
  status: "platform" | "custom" | "pending_verification" | "invalid";
  fromName: string;
  fromAddress: string;
  replyTo: string | null;
  hasLogo: boolean;
}

export default function CustomizationPage() {
  const { toast } = useToast();
  const upgradeToast = useUpgradeToast();
  const queryClient = useQueryClient();
  const [values, setValues] = useState<FormValues>({});
  const [logoBusy, setLogoBusy] = useState(false);

  const { data: config } = useQuery<LibroConfiguration | null>({
    queryKey: ["/api/libro-configuration"],
  });

  // What actually lands in the consumer's inbox: the only place that knows
  // whether a custom sender address is usable (it depends on the domain having
  // been verified by the mail host).
  const { data: sender } = useQuery<EmailSenderStatus>({
    queryKey: ["/api/libro-configuration/email-sender"],
  });

  const logoUrl = config?.logoUrl ?? null;

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
        privacyPolicyUrl: config.privacyPolicyUrl ?? "",
        emailFromName: config.emailFromName ?? "",
        emailFromAddress: config.emailFromAddress ?? "",
        emailReplyTo: config.emailReplyTo ?? "",
      });
    }
  }, [config]);

  /**
   * Uploads the logo. Sent as multipart through fetch (apiRequest serializes
   * JSON), and the query cache is updated with the saved row so the preview
   * refreshes without a reload.
   */
  const uploadLogo = async (file: File) => {
    const body = new FormData();
    body.append("logo", file);

    setLogoBusy(true);
    try {
      const response = await fetch("/api/libro-configuration/logo", {
        method: "POST",
        body,
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "No se pudo subir el logo");
      }

      queryClient.setQueryData(["/api/libro-configuration"], payload);
      queryClient.invalidateQueries({ queryKey: ["/api/libro-configuration/email-sender"] });
      toast({
        title: "Logo actualizado",
        description: "Sus correos, su libro público y la constancia ya muestran su logo.",
      });
    } catch (error) {
      toast({
        title: "No se pudo subir el logo",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setLogoBusy(false);
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    try {
      const response = await fetch("/api/libro-configuration/logo", {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.message ?? "No se pudo quitar el logo");
      }

      queryClient.setQueryData(["/api/libro-configuration"], payload);
      queryClient.invalidateQueries({ queryKey: ["/api/libro-configuration/email-sender"] });
      toast({ title: "Logo eliminado" });
    } catch (error) {
      toast({
        title: "No se pudo quitar el logo",
        description: (error as Error).message,
        variant: "destructive",
      });
    } finally {
      setLogoBusy(false);
    }
  };

  /** One sentence describing what the consumer will actually receive. */
  const senderSummary = () => {
    if (!sender) {
      return null;
    }

    if (sender.status === "custom") {
      return `Sus correos salen desde ${sender.fromAddress} (${sender.fromName}).`;
    }
    if (sender.status === "pending_verification" || sender.status === "invalid") {
      return `Configuró un correo remitente propio, pero todavía no puede usarse${
        sender.fromName ? `; por ahora se envía como ${sender.fromName}` : ""
      } desde ${sender.fromAddress}. ${
        sender.status === "invalid" ? "La dirección no es válida." : "Falta verificar el dominio con nuestro servicio de correo."
      }`;
    }
    return `Sus correos salen desde ${sender.fromAddress} como ${sender.fromName}${
      sender.replyTo ? ` y las respuestas van a ${sender.replyTo}` : ""
    }.`;
  };

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

  /** One row per editable field, shared by the legal and the template cards. */
  const renderField = (field: (typeof formFields)[number]) => (
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
  );

  return (
    <AppLayout title="Personalización" subtitle="Plantillas, branding, voz de marca y política de privacidad">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Brand mark. No plan gate, like the legal link below: the logo is what
            makes a consumer recognize who is holding their complaint, and it
            appears on the public book, in the email and on the constancia. */}
        <Card>
          <CardHeader>
            <CardTitle>Logo de su empresa</CardTitle>
            <CardDescription>
              Se muestra en su libro público, en el correo que recibe el consumidor y en el PDF de
              constancia. Formato PNG o JPG, hasta 1 MB. Si no sube ninguno, sus correos muestran su
              nombre y sus datos de contacto.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {logoUrl ? (
              <div className="flex flex-wrap items-center gap-4">
                <img
                  src={logoUrl}
                  alt="Logo de su empresa"
                  className="h-16 w-auto max-w-[220px] rounded border border-gray-200 bg-white p-1 object-contain"
                  data-testid="logo-preview"
                />
                <Button
                  variant="outline"
                  onClick={removeLogo}
                  disabled={logoBusy}
                  data-testid="button-remove-logo"
                >
                  {logoBusy ? "Quitando..." : "Quitar logo"}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-gray-500" data-testid="logo-empty">
                Todavía no ha subido un logo.
              </p>
            )}

            <div>
              <Label htmlFor="logo-upload">Subir logo</Label>
              <Input
                id="logo-upload"
                type="file"
                accept="image/png,image/jpeg"
                disabled={logoBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Cleared so choosing the same file again still fires a change.
                  event.target.value = "";
                  if (file) {
                    void uploadLogo(file);
                  }
                }}
                data-testid="input-logo"
              />
            </div>
          </CardContent>
        </Card>

        {/* Consumer-facing email. No plan gate either: the consumer filed the
            complaint with the business, so the message must name it and the
            answer must reach it. */}
        <Card>
          <CardHeader>
            <CardTitle>Correo que recibe su cliente</CardTitle>
            <CardDescription>
              Su cliente presentó el reclamo ante su empresa, no ante Librodigital.pe: el correo de
              confirmación y el de respuesta llevan su nombre, su logo y sus datos de contacto, y las
              respuestas llegan a la dirección que indique aquí.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {emailIdentityFields.map(renderField)}
            {senderSummary() && (
              <p className="text-xs text-gray-500" data-testid="email-sender-summary">
                {senderSummary()}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Legal link first, and outside the plan gate: the consent checkbox of
            the public form must open a real policy on every plan. */}
        <Card>
          <CardHeader>
            <CardTitle>Política de privacidad</CardTitle>
            <CardDescription>
              El consentimiento del formulario público enlaza aquí. Puede apuntarlo a la política que
              ya publica en su web; si lo deja vacío, el consumidor verá la política del libro que
              genera Librodigital.pe con los datos de su empresa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">{legalFields.map(renderField)}</CardContent>
        </Card>

        <PlanGate
          feature="templates"
          title="Plantillas, branding y voz de marca"
          description="Color, correos con su marca y el tono con el que la IA redacta sus respuestas."
        >
        <Card>
          <CardHeader>
            <CardTitle>Plantillas y voz de marca</CardTitle>
            <CardDescription>
              Todo es opcional: sin configurar se usan los textos estándar de LibroDigital.pe.
              Las plantillas de correo y el color requieren plan Pro; la voz de la IA está disponible
              con la IA activa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">{templateFields.map(renderField)}</CardContent>
        </Card>
        </PlanGate>

        <PlanGate
          feature="templates"
          title="Remitente propio"
          description="Envíe sus correos desde una dirección de su propio dominio."
        >
        <Card>
          <CardHeader>
            <CardTitle>Remitente propio</CardTitle>
            <CardDescription>
              Para que sus correos salgan desde una dirección de su dominio, primero verificamos ese
              dominio (registros SPF/DKIM) con nuestro servicio de correo. Es un proceso asistido:
              usted configura la dirección, nosotros habilitamos el dominio y le indicamos qué
              registros DNS publicar. Mientras no esté verificado, el correo sale desde nuestra
              dirección mostrando el nombre visible que configuró arriba, y las respuestas siguen
              llegando a su empresa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {sender && (
              <div className="rounded-lg border border-[#e3d9c6] bg-[#fdfaf3] p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-800">Estado actual:</span>
                  <Badge
                    className={
                      sender.status === "custom"
                        ? "bg-green-100 text-green-800"
                        : sender.status === "pending_verification"
                          ? "bg-yellow-100 text-yellow-800"
                          : sender.status === "invalid"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-700"
                    }
                  >
                    {sender.status === "custom"
                      ? "Personalizado"
                      : sender.status === "pending_verification"
                        ? "Pendiente de verificación"
                        : sender.status === "invalid"
                          ? "Dirección inválida"
                          : "Remitente de la plataforma"}
                  </Badge>
                </div>
                <p className="mt-1 text-gray-600">{senderSummary()}</p>
              </div>
            )}
            {emailSenderFields.map(renderField)}
            <div className="flex flex-wrap gap-2">
              <Link href="/ayuda#remitente-propio">
                <Button variant="outline" size="sm" data-testid="link-sender-guide">
                  Ver guía paso a paso
                </Button>
              </Link>
              <a
                href="mailto:hola@librodigital.pe?subject=Solicitud%20de%20verificaci%C3%B3n%20de%20dominio%20remitente&body=Hola%2C%20quiero%20usar%20mi%20propio%20dominio%20como%20remitente.%20Mi%20empresa%20es%3A%20%0AMi%20dominio%20es%3A%20%0ALa%20direcci%C3%B3n%20que%20quiero%20usar%20es%3A%20"
              >
                <Button variant="outline" size="sm" data-testid="link-sender-request">
                  Solicitar verificación
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
        </PlanGate>

        {/* One save for every card: the payload only carries what changed. */}
        <div className="flex justify-end">
          <Button
            className="btn-primary"
            onClick={() => save.mutate(values)}
            disabled={save.isPending}
            data-testid="button-save-customization"
          >
            {save.isPending ? "Guardando..." : "Guardar personalización"}
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
