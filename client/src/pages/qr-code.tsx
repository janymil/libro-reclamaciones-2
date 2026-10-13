import AppLayout from "@/components/layout/app-layout";
import LibroQrCard from "@/components/libro/libro-qr-card";
import LibroWebLinkCard from "@/components/libro/libro-web-link-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function QrCodePage() {
  return (
    <AppLayout title="Código QR" subtitle="Difunda su Libro de Reclamaciones virtual">
      <div className="space-y-6">
        <LibroQrCard />

        <LibroWebLinkCard />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recomendaciones de impresión</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="material-icons text-xs mt-1 text-blue-600">check_circle</span>
                <span>Colóquelo en un lugar visible y de fácil acceso para el público (caja, recepción, mostrador).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="material-icons text-xs mt-1 text-blue-600">check_circle</span>
                <span>Use el formato SVG si desea imprimirlo en gran tamaño sin perder calidad.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="material-icons text-xs mt-1 text-blue-600">check_circle</span>
                <span>Incluya junto al QR el aviso oficial "LIBRO DE RECLAMACIONES" requerido por el DS 011-2011-PCM.</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
