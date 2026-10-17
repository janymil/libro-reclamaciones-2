import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import type { LibroConfiguration } from "@shared/schema";

/**
 * Enlace directo del Libro de Reclamaciones para la web de la empresa.
 * Alternativa al QR y al widget: un enlace normal que la empresa pega
 * en su propia pagina o tienda online (footer, menu, checkout).
 */
export default function LibroWebLinkCard() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("enlace");
  const { data: config, isLoading } = useQuery<LibroConfiguration | null>({
    queryKey: ["/api/libro-configuration"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-48 items-center justify-center">
          <div className="h-24 w-full max-w-md animate-pulse rounded bg-gray-200" />
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card data-testid="libro-web-link-card-empty">
        <CardContent className="py-10 text-center text-gray-600">
          <span className="material-icons mb-2 text-4xl text-gray-400">link</span>
          <p>Aun no ha configurado su Libro. Complete el registro para obtener su enlace publico.</p>
        </CardContent>
      </Card>
    );
  }

  const publicUrl = `${window.location.origin}/libro/${config.urlSlug}`;
  const linkCode = `<a href="${publicUrl}" target="_blank" rel="noopener">Libro de Reclamaciones</a>`;
  const buttonCode = `<a href="${publicUrl}" target="_blank" rel="noopener" style="display:inline-block;background:#c02b0a;color:#fff;font-weight:600;padding:12px 22px;border-radius:10px;text-decoration:none;font-family:Arial,sans-serif;">Libro de Reclamaciones</a>`;
  const footerCode = `<p>Conforme a lo establecido en el Código de Protección y Defensa del Consumidor, contamos con un Libro de Reclamaciones a tu disposición.</p><p><a href="${publicUrl}" target="_blank" rel="noopener">Solicítalo aquí para registrar tu queja o reclamo</a></p>`;

  const copy = async (text: string, okTitle: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: okTitle, description: "Peguelo en su pagina web o tienda online." });
    } catch {
      toast({ title: "No se pudo copiar", variant: "destructive" });
    }
  };

  const currentCode = activeTab === "boton" ? buttonCode : activeTab === "footer" ? footerCode : linkCode;

  return (
    <Card data-testid="libro-web-link-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="material-icons text-blue-600">link</span>
          Enlace directo para su web (sin QR)
        </CardTitle>
        <CardDescription>
          Si no quiere mostrar un codigo QR en su pagina, pegue un enlace normal hacia su Libro
          Virtual. El consumidor hace clic y reclama sin instalar nada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-col gap-2 rounded-lg border bg-gray-50 p-3 sm:flex-row sm:items-center">
          <a href={publicUrl} target="_blank" rel="noreferrer" className="flex-1 break-all text-sm font-medium text-blue-700 hover:underline" data-testid="web-link-public-url">
            {publicUrl}
          </a>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => copy(publicUrl, "Enlace copiado")} data-testid="button-copy-web-link">
              <span className="material-icons mr-1 text-sm">content_copy</span>
              Copiar enlace
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={publicUrl} target="_blank" rel="noreferrer" data-testid="button-open-web-link">
                <span className="material-icons mr-1 text-sm">open_in_new</span>
                Abrir
              </a>
            </Button>
          </div>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="font-semibold">Enlace (esta tarjeta)</p>
            <p className="mt-1 text-gray-600">Texto o boton en su web. Simple, funciona en cualquier pagina.</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="font-semibold">Widget flotante</p>
            <p className="mt-1 text-gray-600">Boton flotante que abre el libro sin salir de la tienda. Ver <a href="/integraciones" className="text-blue-600 hover:underline">Integraciones</a>.</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="font-semibold">Codigo QR</p>
            <p className="mt-1 text-gray-600">Para locales fisicos: imprimalo en caja o mostrador.</p>
          </div>
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3" data-testid="web-link-tabs">
            <TabsTrigger value="enlace">Enlace</TabsTrigger>
            <TabsTrigger value="boton">Boton</TabsTrigger>
            <TabsTrigger value="footer">Footer legal</TabsTrigger>
          </TabsList>
          <TabsContent value="enlace"><p className="text-sm text-gray-600">Enlace de texto. Ideal para menu o contacto.</p></TabsContent>
          <TabsContent value="boton"><p className="text-sm text-gray-600">Boton rojo sin CSS. Para home o checkout.</p></TabsContent>
          <TabsContent value="footer"><p className="text-sm text-gray-600">Aviso del Anexo II (DS 011-2011-PCM). Para el footer.</p></TabsContent>
        </Tabs>
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-gray-900 p-4 text-xs text-gray-100" data-testid="web-link-snippet">{currentCode}</pre>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="btn-primary" onClick={() => copy(currentCode, "Codigo copiado")} data-testid="button-copy-web-link-code">
            <span className="material-icons mr-1 text-sm">content_copy</span>
            Copiar codigo
          </Button>
          {activeTab === "boton" && (
            <span className="inline-block rounded-[10px] bg-[#c02b0a] px-[22px] py-3 text-sm font-semibold text-white">Libro de Reclamaciones</span>
          )}
        </div>
        <div className="rounded-lg border">
          <div className="border-b px-4 pt-3">
            <p className="pb-1 text-sm font-semibold">Donde pegar el enlace (2 minutos)</p>
            <p className="pb-3 text-xs text-gray-500">El art. 151 del Código exige un aviso o enlace visible y fácilmente accesible al Libro. Póngalo en 2 lugares: footer + checkout o contacto.</p>
          </div>
          <Accordion type="single" collapsible className="px-4" data-testid="web-link-help">
            <AccordionItem value="footer">
              <AccordionTrigger>1. Pie de pagina (obligatorio)</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  <li>Copie el codigo de la pestana Footer legal.</li>
                  <li>Peguelo en el footer junto a Terminos y Privacidad.</li>
                  <li>Guarde y verifique que se ve en todas las paginas.</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="wordpress">
              <AccordionTrigger>2. WordPress / WooCommerce</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  <li>Apariencia - Menus: anada Enlace personalizado con la URL y texto Libro de Reclamaciones.</li>
                  <li>Apariencia - Widgets - Footer: bloque HTML con el codigo del Footer legal.</li>
                  <li>WooCommerce: repita el enlace en Finalizar compra.</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="shopify">
              <AccordionTrigger>3. Shopify</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  <li>Tienda online - Navegacion - Menu de pie de pagina: anada Libro de Reclamaciones con la URL.</li>
                  <li>Opcional: Temas - Personalizar - Footer con el codigo del Footer legal.</li>
                  <li>Guarde y verifique en el checkout.</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="wix">
              <AccordionTrigger>4. Wix / HTML propio</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  <li>Wix: edite el footer, pulse +, anada Boton enlazado a la URL.</li>
                  <li>HTML: pegue el codigo del Boton en index.html (home, contacto, checkout).</li>
                  <li>Compruebe que abre en pestana nueva.</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Como verificar que cumplio</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Abra su web en incognito: Libro de Reclamaciones a maximo 2 clics del home.</li>
            <li>Clic: debe abrirse su libro ({config.urlSlug}) y permitir reclamar.</li>
            <li>En tienda fisica combine web + QR impreso en caja.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
