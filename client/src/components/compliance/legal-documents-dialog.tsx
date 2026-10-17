import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/export";
import type { LibroConfiguration } from "@shared/schema";

interface LegalDocumentsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LegalDocument {
  key: string;
  title: string;
  description: string;
  endpoint: string;
  filename: string;
}

const DOCUMENTS: LegalDocument[] = [
  {
    key: 'aviso',
    title: 'Aviso del Libro de Reclamaciones (Anexo II)',
    description: 'Cartel imprimible exigido por el DS 011-2011-PCM (Anexo II, medidas del DS 006-2014-PCM).',
    endpoint: '/api/documents/complaint-notice',
    filename: 'aviso-libro-reclamaciones.pdf',
  },
  {
    key: 'anexo-ii',
    title: 'Hoja de Reclamación (campos del Anexo I)',
    description: 'Formato de apoyo en A4 con los campos del Anexo I vigente; para el libro físico use el formato oficial publicado por INDECOPI.',
    endpoint: '/api/documents/anexo-ii',
    filename: 'anexo-ii-hoja-de-reclamacion.pdf',
  },
  {
    key: 'privacidad',
    title: 'Política de Privacidad',
    description: 'Borrador conforme a la Ley 29733 y el DS 016-2024-JUS, con la política de retención de 24 meses.',
    endpoint: '/api/documents/privacy-policy',
    filename: 'politica-privacidad.pdf',
  },
  {
    key: 'rnpd',
    title: 'Registro de Actividades de Tratamiento',
    description: 'Documento soporte para el registro ante la Autoridad de Protección de Datos.',
    endpoint: '/api/documents/rnpd-register',
    filename: 'registro-actividades-tratamiento.pdf',
  },
];

/** Downloads the legal notices and policies the business must display. */
export default function LegalDocumentsDialog({ open, onOpenChange }: LegalDocumentsDialogProps) {
  const { toast } = useToast();

  const { data: config } = useQuery<LibroConfiguration | null>({
    queryKey: ['/api/libro-configuration'],
    enabled: open,
  });

  const download = async (document: LegalDocument) => {
    try {
      const response = await fetch(document.endpoint, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('download failed');
      }
      downloadBlob(document.filename, await response.blob());
    } catch (error) {
      toast({ title: `No se pudo descargar: ${document.title}`, variant: "destructive" });
    }
  };

  const publicUrl = config ? `${window.location.origin}/libro/${config.urlSlug}` : null;

  // Web notice snippet (Phase 1.4): DS 011-2011-PCM requires the provider to
  // publish, on its website, the notice that the Libro de Reclamaciones exists
  // and is available virtually.
  const webNoticeSnippet = publicUrl
    ? `<p>Conforme al Código de Protección y Defensa del Consumidor (Ley N° 29571) y al DS 011-2011-PCM, contamos con un Libro de Reclamaciones a su disposición.</p>\n<p><a href="${publicUrl}" target="_blank" rel="noopener">Registre su reclamo en nuestro Libro de Reclamaciones Virtual</a></p>`
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Documentos Legales</DialogTitle>
          <DialogDescription>
            Descargue los avisos y políticas que su establecimiento debe mantener a disposición del público.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {DOCUMENTS.map((document) => (
            <div
              key={document.key}
              className="flex items-center justify-between gap-3 rounded-lg border p-3"
              data-testid={`legal-document-${document.key}`}
            >
              <div>
                <p className="font-medium">{document.title}</p>
                <p className="text-sm text-gray-600">{document.description}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => download(document)}
                data-testid={`button-download-${document.key}`}
              >
                <span className="material-icons mr-1 text-sm">download</span>
                PDF
              </Button>
            </div>
          ))}
        </div>

        {publicUrl && (
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
              <p className="font-medium">Libro virtual público</p>
              <a href={publicUrl} target="_blank" rel="noreferrer" className="break-all underline">
                {publicUrl}
              </a>
            </div>

            {/* Web notice snippet (Phase 1.4): the text the business must embed
                on its website, as required by DS 011-2011-PCM. */}
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-sm">Aviso para su web (copiar y pegar)</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(webNoticeSnippet);
                      toast({ title: "Aviso copiado", description: "Péguelo en el pie de página de su web." });
                    } catch {
                      toast({ title: "No se pudo copiar", variant: "destructive" });
                    }
                  }}
                  data-testid="button-copy-notice-snippet"
                >
                  <span className="material-icons mr-1 text-sm">content_copy</span>
                  Copiar
                </Button>
              </div>
              <pre className="bg-gray-50 border rounded p-2 text-xs whitespace-pre-wrap break-words text-gray-700">
                {webNoticeSnippet}
              </pre>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
