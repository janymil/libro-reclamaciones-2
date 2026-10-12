import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/export";
import type { LibroConfiguration } from "@shared/schema";

/**
 * QR code of the public Libro de Reclamaciones. Consumers scan it at the
 * establishment (or use the printed PDF) to reach /libro/:slug.
 */
export default function LibroQrCard() {
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { data: config, isLoading } = useQuery<LibroConfiguration | null>({
    queryKey: ['/api/libro-configuration'],
  });

  const publicUrl = config ? `${window.location.origin}/libro/${config.urlSlug}` : "";

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas || !config) {
      return;
    }
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `qr-libro-${config.urlSlug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSvg = () => {
    if (!config) return;
    const svg = document.getElementById('libro-qr-svg');
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    downloadBlob(
      `qr-libro-${config.urlSlug}.svg`,
      new Blob([source], { type: 'image/svg+xml;charset=utf-8' }),
    );
  };

  const copyLink = async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast({ title: "Enlace copiado", description: publicUrl });
    } catch {
      toast({ title: "No se pudo copiar el enlace", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <div className="h-44 w-44 animate-pulse rounded bg-gray-200" />
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-gray-600">
          <span className="material-icons mb-2 text-4xl text-gray-400">qr_code_2</span>
          <p>
            Aún no ha configurado su Libro de Reclamaciones. Complete el registro para obtener
            su enlace público y su código QR.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="libro-qr-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="material-icons text-blue-600">qr_code_2</span>
          Código QR del Libro de Reclamaciones
        </CardTitle>
        <CardDescription>
          Imprima este código en su establecimiento para que los consumidores accedan al libro virtual.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
          <div className="rounded-xl border bg-white p-4">
            <QRCodeSVG
              id="libro-qr-svg"
              value={publicUrl}
              size={200}
              level="M"
              marginSize={2}
              aria-label={`Código QR de ${config.libroName}`}
            />
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <p className="text-sm font-medium text-gray-500">Nombre del libro</p>
              <p className="font-medium">{config.libroName}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Enlace público</p>
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="break-all text-sm text-blue-600 hover:underline"
              >
                {publicUrl}
              </a>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="btn-primary" onClick={downloadPng} data-testid="button-download-qr-png">
                <span className="material-icons mr-1 text-sm">download</span>
                PNG
              </Button>
              <Button size="sm" variant="outline" onClick={downloadSvg} data-testid="button-download-qr-svg">
                <span className="material-icons mr-1 text-sm">download</span>
                SVG
              </Button>
              <Button size="sm" variant="outline" onClick={copyLink} data-testid="button-copy-qr-link">
                <span className="material-icons mr-1 text-sm">content_copy</span>
                Copiar enlace
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-medium">Cómo usarlo</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Descargue el QR en PNG o SVG e imprímalo en tamaño visible al público.</li>
            <li>Los consumidores escanean el código y registran su reclamo sin instalar nada.</li>
            <li>También puede descargar el aviso oficial desde Documentos Legales.</li>
          </ul>
        </div>
      </CardContent>

      {/* Hidden canvas used to export the PNG */}
      <div style={{ display: 'none' }}>
        <QRCodeCanvas value={publicUrl} size={1024} level="M" marginSize={2} ref={canvasRef} />
      </div>
    </Card>
  );
}
