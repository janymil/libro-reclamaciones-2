import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import type { LibroConfiguration } from "@shared/schema";

/**
 * El Libro en las redes sociales.
 *
 * Para quien vende solo por WhatsApp, Instagram, TikTok, YouTube o Facebook, el
 * Libro tiene que estar en el MISMO medio donde vende: el cliente no busca una
 * web que no existe. Esta tarjeta entrega el enlace y el texto ya listos para
 * pegar, con los pasos de cada plataforma.
 *
 * Sin APIs, sin integraciones y sin costos extra: es un enlace. Disponible en
 * todos los planes, porque es la forma mas simple de cumplir.
 */
export default function SocialChannelsCard() {
  const { toast } = useToast();
  const { data: config, isLoading } = useQuery<LibroConfiguration | null>({
    queryKey: ["/api/libro-configuration"],
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex h-40 items-center justify-center">
          <div className="h-20 w-full max-w-md animate-pulse rounded bg-gray-200" />
        </CardContent>
      </Card>
    );
  }

  if (!config) {
    return (
      <Card data-testid="social-channels-card-empty">
        <CardContent className="py-10 text-center text-gray-600">
          <span className="material-icons mb-2 text-4xl text-gray-400">share</span>
          <p>Aún no ha configurado su Libro. Complete el registro para obtener su enlace público.</p>
        </CardContent>
      </Card>
    );
  }

  const publicUrl = `${window.location.origin}/libro/${config.urlSlug}`;
  const shortText = `Libro de Reclamaciones 👉 ${publicUrl}`;
  const longText =
    `Conforme al Código de Protección y Defensa del Consumidor y al DS 011-2011-PCM, contamos con ` +
    `un Libro de Reclamaciones Virtual. Registre su reclamo o queja aquí: ${publicUrl}`;

  const copy = async (text: string, description: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado", description });
    } catch {
      toast({
        title: "No se pudo copiar",
        description: "Seleccione el texto y cópielo manualmente.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card data-testid="social-channels-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="material-icons text-[#c02b0a]">share</span>
          Su Libro en WhatsApp, Instagram, TikTok, YouTube y Facebook
        </CardTitle>
        <CardDescription>
          Si vende por redes sociales, el cliente debe poder reclamar desde ahí mismo. Es un enlace y un
          texto: cópielos y péguelos. No necesita instalar nada ni pagar nada extra.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">1. Su enlace del Libro (el mismo para todas las redes)</p>
            <div className="flex gap-2">
              <Input readOnly value={publicUrl} data-testid="input-social-link" />
              <Button variant="outline" onClick={() => copy(publicUrl, "Péguelo en la bio, la descripción o el perfil.")}>
                <span className="material-icons mr-2 text-sm">content_copy</span>
                Copiar
              </Button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Abre su Libro virtual, donde el cliente registra el reclamo y recibe su constancia por correo.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">2. Texto corto (para la bio de Instagram, TikTok o WhatsApp)</p>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-words rounded-lg border bg-gray-50 p-3 text-xs">{shortText}</code>
              <Button variant="outline" size="sm" onClick={() => copy(shortText, "Péguelo en su bio.")}>
                Copiar
              </Button>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-gray-700">3. Texto con aviso legal (descripción de perfil, videos o catálogo)</p>
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-words rounded-lg border bg-gray-50 p-3 text-xs">{longText}</code>
              <Button variant="outline" size="sm" onClick={() => copy(longText, "Péguelo en la descripción.")}>
                Copiar
              </Button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Este es el aviso visible que exige el DS 011-2011-PCM: un lugar visible con el enlace al Libro.
            </p>
          </div>
        </div>

        <div className="rounded-lg border">
          <div className="border-b px-4 pt-3">
            <p className="pb-1 text-sm font-semibold">4. Dónde pegarlo (elija su red social)</p>
            <p className="pb-3 text-xs text-gray-500">
              Cinco minutos por red social y queda cumplido: el Libro está en el mismo medio donde vende.
            </p>
          </div>
          <Accordion type="single" collapsible className="px-4" data-testid="social-channels-help">
            <AccordionItem value="whatsapp">
              <AccordionTrigger>WhatsApp Business</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  <li>Ajustes - Perfil de empresa - Descripción: pegue el texto con aviso legal.</li>
                  <li>En el mismo perfil, en "Sitio web" o "Enlace", pegue su enlace del Libro.</li>
                  <li>Catálogo: en la descripción del negocio y en cada producto, añada "Reclamos: su enlace".</li>
                  <li>Ajustes - Herramientas para la empresa: pegue el texto en el mensaje de bienvenida y en el de ausencia.</li>
                  <li>En el chat con un cliente, escriba el enlace y fíjelo (mantenga pulsado el mensaje - Fijar).</li>
                  <li>Estado de WhatsApp: "¿Algún problema con tu pedido? Registra tu reclamo aquí: su enlace".</li>
                </ol>
                <p className="mt-2 text-xs text-gray-500">
                  Si vende solo por WhatsApp, esta descripción es su aviso visible: déjela siempre puesta.
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="instagram">
              <AccordionTrigger>Instagram</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  <li>Editar perfil - Enlace: pegue su enlace del Libro.</li>
                  <li>En la biografía escriba "Reclamos en el enlace" si no le caben dos enlaces.</li>
                  <li>Historias: añada el sticker de enlace y guarde la historia en una destacada llamada "Reclamos".</li>
                  <li>En cada Reels o publicación de venta, pegue el texto con aviso legal en la descripción.</li>
                  <li>Tenga una respuesta rápida en los mensajes directos (DM) con el enlace.</li>
                </ol>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="tiktok">
              <AccordionTrigger>TikTok</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  <li>Cuenta de empresa - Perfil - Biografía: pegue su enlace del Libro.</li>
                  <li>En la descripción de cada video de venta, pegue el texto con aviso legal.</li>
                  <li>Fije un comentario con el enlace en los videos donde vende.</li>
                  <li>Si usa TikTok Shop, repita el enlace en la descripción de la tienda y de los productos.</li>
                </ol>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="youtube">
              <AccordionTrigger>YouTube (canal, videos y directos)</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  <li>Personalizar canal - Información básica - Descripción, y añada el enlace en "Enlaces" con el nombre "Libro de Reclamaciones".</li>
                  <li>En la descripción de cada video pegue el texto con aviso legal: queda como enlace clicable.</li>
                  <li>Fije un comentario con el enlace en los videos donde vende (cursos, membresías, merchandising).</li>
                  <li>Directos: pegue el enlace en la descripción del directo y muestre el QR en pantalla (descárguelo en Código QR) para que lo escaneen en vivo.</li>
                </ol>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="facebook">
              <AccordionTrigger>Facebook (página y Marketplace)</AccordionTrigger>
              <AccordionContent>
                <ol className="list-decimal space-y-1 pl-5 text-sm text-gray-700">
                  <li>Página - Editar información - Descripción: pegue el texto con aviso legal.</li>
                  <li>Botón de acción de la página: "Sitio web" con su enlace (o "Enviar mensaje").</li>
                  <li>Publique y fije una publicación con el aviso y el enlace.</li>
                  <li>Marketplace y grupos: repita el enlace en cada publicación de venta.</li>
                </ol>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-medium">¿Hace falta conectar WhatsApp con el sistema? No.</p>
          <p className="mt-1">
            Con el enlace en su perfil ya cumple: el cliente entra, registra el reclamo y recibe su constancia
            por correo, con número correlativo y fecha límite de 15 días hábiles. Los reclamos llegan a su panel
            y usted responde desde aquí.
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-medium">Cómo comprobar que cumplió (1 minuto)</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>Abra su perfil en una ventana de incógnito: el enlace debe verse sin hacer scroll.</li>
            <li>Pulse el enlace: debe abrir su Libro ({config.urlSlug}) y permitir registrar un reclamo.</li>
            <li>Si además vende en tienda física, sume el QR impreso en caja o mostrador.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
