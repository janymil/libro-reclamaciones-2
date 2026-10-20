import AppLayout from "@/components/layout/app-layout";
import LibroQrCard from "@/components/libro/libro-qr-card";
import LibroWebLinkCard from "@/components/libro/libro-web-link-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob } from "@/lib/export";
import { FileText, Printer, ShieldAlert } from "lucide-react";

export default function QrCodePage() {
  const { toast } = useToast();

  const downloadPdf = async (endpoint: string, filename: string, title: string) => {
    try {
      const response = await fetch(endpoint, { credentials: "include" });
      if (!response.ok) throw new Error("download failed");
      downloadBlob(filename, await response.blob());
    } catch {
      toast({
        title: `No se pudo descargar: ${title}`,
        variant: "destructive",
      });
    }
  };

  return (
    <AppLayout title="Código QR y Material Imprimible" subtitle="Difunda su Libro de Reclamaciones virtual y mantenga su respaldo físico de contingencia">
      <div className="space-y-6">
        <LibroQrCard />

        {/* Kit de Impresión para Locales Físicos (Cartel A4 + Hojas de Respaldo) */}
        <Card className="border-amber-200 bg-amber-50/40" data-testid="card-physical-backup-kit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-amber-950">
              <ShieldAlert className="h-5 w-5 text-amber-700" />
              Kit obligatorio para locales abiertos al público (DS 011-2011-PCM)
            </CardTitle>
            <CardDescription className="text-amber-900/80">
              Tener un Libro Virtual no exime de exhibir el cartel oficial en el local ni de contar con hojas físicas de respaldo ante cortes de luz, caídas de internet o si un cliente exige reclamar en papel presencialmente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col justify-between rounded-xl border border-amber-200 bg-white p-4 shadow-xs">
                <div>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <Printer className="h-4 w-4 text-blue-600" />
                    1. Cartel Oficial (Anexo II)
                  </p>
                  <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                    Imprímalo en tamaño A4 y colóquelo en un lugar visible (caja, recepción o ingreso). No exhibirlo es causal directa de multa ante INDECOPI.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4 w-full border-blue-200 text-blue-700 hover:bg-blue-50"
                  onClick={() =>
                    downloadPdf(
                      "/api/documents/complaint-notice",
                      "aviso-libro-reclamaciones.pdf",
                      "Aviso del Libro de Reclamaciones",
                    )
                  }
                  data-testid="button-download-notice-pdf"
                >
                  Descargar Cartel Oficial (PDF)
                </Button>
              </div>

              <div className="flex flex-col justify-between rounded-xl border border-amber-200 bg-white p-4 shadow-xs">
                <div>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-amber-700" />
                    2. Hojas Físicas de Respaldo (Anexo I)
                  </p>
                  <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                    Imprima al menos 3 juegos y guárdelos en mostrador. Entréguelas si falla el internet, se corta la luz o el cliente rechaza usar el celular. Tiene 1 día calendario para transcribirlas al sistema.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4 w-full border-amber-300 text-amber-900 hover:bg-amber-100/50"
                  onClick={() =>
                    downloadPdf(
                      "/api/documents/anexo-ii",
                      "hoja-reclamacion-respaldo-anexo-i.pdf",
                      "Hoja de Reclamación de Respaldo",
                    )
                  }
                  data-testid="button-download-backup-sheet-pdf"
                >
                  Descargar Hoja de Respaldo (PDF)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <LibroWebLinkCard />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recomendaciones de impresión y atención</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="material-icons text-xs mt-1 text-blue-600">check_circle</span>
                <span>Coloque el cartel con el código QR en un lugar visible y de fácil acceso para el público (caja, recepción, mostrador).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="material-icons text-xs mt-1 text-blue-600">check_circle</span>
                <span>Use el formato SVG si desea imprimir el QR en gran tamaño sin perder calidad.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="material-icons text-xs mt-1 text-blue-600">check_circle</span>
                <span>Si un consumidor en el local solicita asistencia o prefiere el formato físico, bríndele apoyo inmediato o entréguele una hoja de respaldo impresa sin condicionamientos.</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
