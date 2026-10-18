import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, apiErrorMessage } from "@/lib/queryClient";
import { downloadBlob } from "@/lib/export";
import { LEGAL_NORMS } from "@/lib/legal-norms";
import {
  LIBRO_PROCESSING_ACTIVITY,
  RNPD_PROCEDURE_URL,
  RNPD_SUPPORT,
  SIPDP_URL,
} from "@shared/rnpd";
import { HOSTING_COUNTRIES } from "@shared/encargado";
import type { DataProcessingActivity } from "@shared/schema";

interface RnpdAssistantDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface RnpdDeclarationState {
  registered: boolean;
  answered: boolean;
  code: string | null;
  completedDate: string | null;
}

interface ComplianceReportSlice {
  rnpd?: RnpdDeclarationState;
}

/**
 * Official texts, reused from `lib/legal-norms.ts` (verified against gob.pe).
 * Never hardcode a URL here: that file is the single source of truth.
 */
const LEY_29733 = LEGAL_NORMS.find((norm) => norm.id === 'ley-29733')!;
const DS_016_2024_JUS = LEGAL_NORMS.find((norm) => norm.id === 'ds-016-2024-jus')!;

const ACTIVITIES_KEY = ['/api/data-processing-activities'];
const REPORT_KEY = ['/api/compliance/report'];

/**
 * Two duties, one window.
 *
 * The client never types the register: the platform knows which personal data the
 * Libro collects (Anexo I) and the retention it applies, so the activity is
 * derived and only confirmed. The SIPDP inscription is different - it is filed by
 * the company at the ANPD, so here it can only be declared, never executed.
 */
export default function RnpdAssistantDialog({ open, onOpenChange }: RnpdAssistantDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [codeDraft, setCodeDraft] = useState("");

  const { data: activities = [], isLoading } = useQuery<DataProcessingActivity[]>({
    queryKey: ACTIVITIES_KEY,
    enabled: open,
  });

  const { data: report } = useQuery<ComplianceReportSlice>({
    queryKey: REPORT_KEY,
    enabled: open,
  });

  const declaration = report?.rnpd;

  // Seed the code field with what the business already declared.
  useEffect(() => {
    if (declaration?.code) setCodeDraft(declaration.code);
  }, [declaration?.code]);

  const confirmRegister = useMutation({
    mutationFn: async () => apiRequest('POST', '/api/compliance/activities/confirm', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ACTIVITIES_KEY });
      queryClient.invalidateQueries({ queryKey: REPORT_KEY });
      toast({
        title: "Registro confirmado",
        description: "Tu registro interno de actividades de tratamiento quedó guardado.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "No se pudo confirmar",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const declareRnpd = useMutation({
    mutationFn: async (registered: boolean) =>
      apiRequest('PUT', '/api/compliance/rnpd-registration', {
        registered,
        code: registered ? codeDraft.trim() || undefined : undefined,
      }),
    onSuccess: (_data, registered) => {
      queryClient.invalidateQueries({ queryKey: REPORT_KEY });
      toast({
        title: registered ? "Declaración guardada" : "Anotado",
        description: registered
          ? "Quedó registrado que tu empresa ya inscribió el banco de datos."
          : "Seguirá apareciendo como pendiente hasta que la inscribas.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "No se pudo guardar",
        description: apiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const downloadRegister = async () => {
    try {
      const response = await fetch('/api/documents/rnpd-register', { credentials: 'include' });
      if (!response.ok) throw new Error('download failed');
      downloadBlob('registro-actividades-tratamiento.pdf', await response.blob());
    } catch {
      toast({ title: "No se pudo generar el registro", variant: "destructive" });
    }
  };

  const activity = LIBRO_PROCESSING_ACTIVITY;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registro de actividades de tratamiento</DialogTitle>
          <DialogDescription>
            Lo exige la Ley N.° 29733 y su Reglamento (DS N.° 016-2024-JUS). Son dos pasos distintos:
            tu registro interno y la inscripción del banco de datos ante la ANPD.
          </DialogDescription>
        </DialogHeader>

        {/* Scope note: what this window saves and what it cannot do. */}
        <div
          className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"
          data-testid="rnpd-scope-note"
        >
          <p className="font-medium text-amber-900">Qué guarda esta ventana y qué no</p>
          <p className="text-amber-800">
            Aquí queda tu <strong>registro interno</strong>: qué datos personales tratas, para qué, por
            cuánto tiempo y con qué medidas de seguridad. Es tuyo, vive en tu cuenta y puedes
            descargarlo en PDF.
          </p>
          <p className="text-amber-800">
            <strong>No inscribe nada ante el Estado.</strong> La inscripción del banco de datos en el
            Registro Nacional de Protección de Datos Personales (RNPD) es un trámite aparte que
            realiza tu empresa ante la Autoridad Nacional de Protección de Datos Personales (ANPD,
            MINJUSDH) mediante el SIPDP. LibroDigital solo aloja los datos por tu cuenta (encargado
            del tratamiento); este registro es el sustento del trámite.
          </p>
          <p className="text-xs text-amber-900">
            Textos oficiales:{' '}
            <a
              href={LEY_29733.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              Ley N.° 29733
            </a>{' '}
            ·{' '}
            <a
              href={DS_016_2024_JUS.href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              DS N.° 016-2024-JUS
            </a>
            . No es asesoría legal.
          </p>
        </div>

        {/* 1. Internal register: derived, confirmed with one click. */}
        <div className="space-y-3 rounded-lg border bg-gray-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-medium">1. Tu registro interno</h4>
            {activities.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={downloadRegister}
                data-testid="button-download-rnpd"
              >
                <span className="material-icons mr-1 text-sm">download</span>
                Descargar registro
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="h-20 animate-pulse rounded bg-gray-100" />
          ) : activities.length > 0 ? (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-medium text-green-800">
                <span className="material-icons text-base">check_circle</span>
                Registro confirmado ({activities.length} actividad(es)).
              </p>
              {activities.map((saved) => (
                <div key={saved.id} className="rounded-lg border bg-white p-3">
                  <p className="font-medium">{saved.activityName}</p>
                  <p className="text-sm text-gray-600">{saved.purpose}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Base legal: {saved.legalBasis} · Conservación: {saved.retentionPeriod}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                No tienes que escribir nada: esta es la actividad que corresponde a tu Libro, tomada
                de los datos que la plataforma ya recoge. Revísala y confírmala.
              </p>
              <div className="rounded-lg border bg-white p-3 text-sm">
                <p className="font-medium">{activity.activityName}</p>
                <p className="mt-1 text-gray-600">{activity.purpose}</p>
                <dl className="mt-2 grid grid-cols-1 gap-1 text-xs text-gray-600 sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-gray-700">Base legal</dt>
                    <dd>{activity.legalBasis}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-700">Conservación</dt>
                    <dd>{activity.retentionPeriod}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-700">Categorías de datos</dt>
                    <dd>{activity.dataCategories.join(', ')}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-gray-700">Titulares</dt>
                    <dd>{activity.dataSubjects.join(', ')}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-medium text-gray-700">Medidas de seguridad</dt>
                    <dd>{activity.securityMeasures.join(', ')}</dd>
                  </div>
                </dl>
              </div>
              <p className="text-xs text-gray-500">
                La conservación de {activity.retentionPeriod} es la que aplica la plataforma (DS N.°
                011-2011-PCM). Si tu empresa conserva las hojas más tiempo, indícalo en tu política de
                privacidad.
              </p>
              <Button
                className="btn-primary"
                onClick={() => confirmRegister.mutate()}
                disabled={confirmRegister.isPending}
                data-testid="button-confirm-activities"
              >
                {confirmRegister.isPending ? "Confirmando..." : "Confirmar registro"}
              </Button>
            </>
          )}
        </div>

        {/* 2. RNPD inscription: declared, not executed. */}
        <div className="space-y-3 rounded-lg border p-4">
          <h4 className="font-medium">2. Inscripción del banco de datos en el RNPD</h4>
          <p className="text-sm text-gray-700">
            Toda empresa titular de un banco de datos personales debe inscribirlo ante el RNPD. Según
            la ficha oficial del trámite, la inscripción es <strong>gratuita</strong>, de{' '}
            <strong>aprobación automática</strong> sujeta a fiscalización posterior, y se presenta de
            forma virtual por el <strong>SIPDP</strong>. Al terminar obtienes la constancia de
            inscripción y el código del banco de datos.
          </p>
          <p className="text-sm text-gray-700">
            Este trámite <strong>lo hace tu empresa</strong>: la plataforma no está conectada al RNPD y
            no puede presentarlo por ti.
          </p>

          {/* The SIPDP form asks for the processor and for cross-border transfers.
              Those answers live here so the client does not have to write to us. */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-950">
            <p className="font-medium">Datos para tu declaración</p>
            <p className="mt-1">
              LibroDigital actúa como <strong>encargado del tratamiento</strong>. Los datos se alojan
              fuera del Perú: <strong>{HOSTING_COUNTRIES.join(' y ')}</strong>. Declara{' '}
              <strong>flujo transfronterizo</strong> con esos países de destino.
            </p>
            <a
              href="/encargado"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block font-medium underline underline-offset-2"
            >
              Ver la ficha del encargado
            </a>
          </div>

          {declaration?.registered ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              <p className="flex items-center gap-1.5 font-medium">
                <span className="material-icons text-base">check_circle</span>
                Tu empresa declaró que el banco de datos ya está inscrito.
              </p>
              {declaration.code && (
                <p className="mt-1">Código del banco de datos: {declaration.code}</p>
              )}
              {declaration.completedDate && (
                <p className="mt-1 text-xs">
                  Declarado el{' '}
                  {new Date(declaration.completedDate).toLocaleDateString('es-PE', {
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                  .
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => declareRnpd.mutate(false)}
                disabled={declareRnpd.isPending}
                data-testid="button-rnpd-not-yet"
              >
                Todavía no está inscrito
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  onClick={() => declareRnpd.mutate(true)}
                  disabled={declareRnpd.isPending}
                  data-testid="button-rnpd-registered"
                >
                  Sí, ya está inscrito
                </Button>
                <Button
                  variant="outline"
                  onClick={() => declareRnpd.mutate(false)}
                  disabled={declareRnpd.isPending}
                  data-testid="button-rnpd-not-yet"
                >
                  Todavía no
                </Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rnpd-code">Código del banco de datos (opcional)</Label>
                <Input
                  id="rnpd-code"
                  value={codeDraft}
                  onChange={(event) => setCodeDraft(event.target.value)}
                  placeholder="Lo entrega el SIPDP al terminar la inscripción"
                  data-testid="input-rnpd-code"
                />
                <p className="text-xs text-gray-500">
                  Se guarda como evidencia de tu declaración. La plataforma no verifica el registro
                  estatal.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3 text-sm">
            <a
              href={RNPD_PROCEDURE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline underline-offset-2"
            >
              Ver el trámite en gob.pe
            </a>
            <a
              href={SIPDP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary underline underline-offset-2"
            >
              Entrar al SIPDP
            </a>
          </div>
          <p className="text-xs text-gray-500">
            Ayuda del trámite: {RNPD_SUPPORT.phone} ({RNPD_SUPPORT.phoneSchedule}) ·{' '}
            {RNPD_SUPPORT.email}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

