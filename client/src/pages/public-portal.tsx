import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import ComplaintForm from "@/components/complaints/complaint-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, Search, FileText, ShieldCheck } from "lucide-react";
import { privacyPolicyPath } from "@shared/privacy-policy";

interface PublicLibro {
  libro: {
    name: string;
    slug: string;
    whatsappNumber: string | null;
    websiteUrl: string | null;
    /** Business logo, uploaded in Personalización. */
    logoUrl?: string | null;
    brandColor?: string | null;
    confirmationMessage?: string | null;
    allowedComplaintTypes?: Array<"reclamo" | "queja">;
    /**
     * The business's own privacy policy page, when it published one in
     * Personalización. The consent checkbox links here; when it is null it links
     * to the hosted policy of this book (see privacyPolicyPath).
     */
    privacyPolicyUrl?: string | null;
    /**
     * False while no administrator of the business has confirmed the
     * notification mailbox: the intake route refuses submissions, so the portal
     * shows the reason instead of a form that would fail.
     */
    acceptingComplaints?: boolean;
  };
  business: {
    id: string;
    businessName: string;
    commercialName: string | null;
    ruc: string;
    address: string;
    distrito: string;
    provincia: string;
    departamento: string;
  };
  establishments: { id: string; name: string; address: string }[];
}

interface ConsultResult {
  correlativeNumber: string;
  complaintType: string;
  status: string;
  productServiceName: string;
  submissionDate: string;
  dueDate: string;
  responseDate: string | null;
  providerResponse: string | null;
  isOverdue: boolean;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  new: { label: "Recibido", className: "bg-blue-100 text-blue-800" },
  in_progress: { label: "En proceso", className: "bg-yellow-100 text-yellow-800" },
  responded: { label: "Respondido", className: "bg-green-100 text-green-800" },
  resolved: { label: "Resuelto", className: "bg-green-100 text-green-800" },
  overdue: { label: "Vencido", className: "bg-red-100 text-red-800" },
};

const formatDate = (value: string) => new Date(value).toLocaleDateString('es-PE');

export default function PublicPortal() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  // Embed mode (Phase 3.12): the widget iframe renders the same portal in a
  // compact layout without the outer page chrome.
  const [search] = useState(() => new URLSearchParams(window.location.search));
  const isEmbed = search.get("embed") === "1";

  // QR deep link (printed on the constancia): /libro/:slug?folio=R-2026-0001
  // jumps straight to the status lookup with the folio pre-filled. The document
  // number is deliberately not part of the link (it is personal data).
  const folioFromUrl = search.get("folio") ?? "";

  const [establishmentId, setEstablishmentId] = useState("");
  const [submitted, setSubmitted] = useState<{ correlativeNumber: string; dueDate: string } | null>(null);
  const [correlative, setCorrelative] = useState(folioFromUrl);
  const [documentNumber, setDocumentNumber] = useState("");
  const [activeTab, setActiveTab] = useState(folioFromUrl ? "consultar" : "registrar");

  const { data, isLoading, error } = useQuery<PublicLibro>({
    queryKey: [`/api/public/libro/${slug}`],
  });

  useEffect(() => {
    if (data?.establishments.length && !establishmentId) {
      setEstablishmentId(data.establishments[0].id);
    }
  }, [data, establishmentId]);

  const consult = useMutation({
    mutationFn: async () => {
      const url = `/api/public/libro/${slug}/consultar/${encodeURIComponent(correlative.trim())}?documento=${encodeURIComponent(documentNumber.trim())}`;
      const response = await fetch(url);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || "No se pudo consultar la reclamación");
      }
      return body as ConsultResult;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <span className="material-icons text-4xl text-red-500 mb-4">error</span>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Libro no encontrado</h1>
            <p className="text-gray-600">
              La empresa que busca no existe o no tiene un Libro de Reclamaciones activo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedEstablishment = data.establishments.find(e => e.id === establishmentId);

  // Per-business brand color (Phase 2.8), applied as the accent of the portal
  const brandColor = data.libro.brandColor || undefined;

  return (
    <div className={isEmbed ? "bg-surface p-2" : "min-h-screen bg-surface py-8 px-4"} data-testid="public-portal">
      <div className={isEmbed ? "space-y-4" : "max-w-3xl mx-auto space-y-6"}>
        {!isEmbed && (
        <Card>
          <CardHeader>
            {data.libro.logoUrl && (
              <img
                src={data.libro.logoUrl}
                alt={data.business.businessName}
                className="mb-2 h-14 w-auto max-w-[220px] object-contain"
                data-testid="portal-logo"
              />
            )}
            <CardTitle className="flex items-center gap-2 text-2xl" style={brandColor ? { color: brandColor } : undefined}>
              <FileText className="h-6 w-6" style={brandColor ? { color: brandColor } : undefined} />
              {data.libro.name}
            </CardTitle>
            <CardDescription>
              {data.business.businessName} · RUC {data.business.ruc}
              <br />
              {data.business.address} — {data.business.distrito}, {data.business.provincia}, {data.business.departamento}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-2 text-sm text-gray-600">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            Conforme al D.S. 011-2011-PCM y a la Ley 29571 (Código de Protección y Defensa del Consumidor)
          </CardContent>
        </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="registrar" data-testid="tab-registrar">Registrar reclamo</TabsTrigger>
            <TabsTrigger value="consultar" data-testid="tab-consultar">Consultar estado</TabsTrigger>
          </TabsList>
          <TabsContent value="registrar" className="space-y-4">
            {submitted ? (
              <Card>
                <CardContent className="pt-6 text-center space-y-3">
                  <CheckCircle2 className="h-14 w-14 text-green-600 mx-auto" />
                  <h2 className="text-xl font-bold text-gray-900">¡Reclamo registrado!</h2>
                  {data.libro.confirmationMessage && (
                    <p className="text-gray-700" data-testid="custom-confirmation-message">
                      {data.libro.confirmationMessage}
                    </p>
                  )}
                  <p className="text-gray-600">Su reclamo quedó registrado con el número:</p>
                  <p className="text-2xl font-mono font-bold text-primary" data-testid="success-correlative">
                    {submitted.correlativeNumber}
                  </p>
                  <p className="text-gray-600">
                    Fecha límite de respuesta: <strong>{formatDate(submitted.dueDate)}</strong>
                  </p>
                  <p className="text-sm text-gray-500">
                    Guarde este número. Recibirá una copia por correo y podrá consultar el estado en la
                    pestaña “Consultar estado”. La empresa tiene 15 días hábiles para responderle.
                  </p>
                  <Button onClick={() => { setSubmitted(null); setCorrelative(submitted.correlativeNumber); }}>
                    Consultar mi reclamo
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {data.establishments.length > 1 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Establecimiento</CardTitle>
                      <CardDescription>Seleccione el local donde adquirió el producto o servicio</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Select value={establishmentId} onValueChange={setEstablishmentId}>
                        <SelectTrigger data-testid="select-establishment">
                          <SelectValue placeholder="Seleccione un establecimiento" />
                        </SelectTrigger>
                        <SelectContent>
                          {data.establishments.map(e => (
                            <SelectItem key={e.id} value={e.id}>{e.name} — {e.address}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>
                )}

                {data.libro.acceptingComplaints === false ? (
                  <Card data-testid="notice-libro-not-published">
                    <CardHeader>
                      <CardTitle className="text-base">Este Libro aún no está en línea</CardTitle>
                      <CardDescription className="leading-relaxed">
                        La empresa debe confirmar su correo de notificaciones antes de recibir
                        reclamos en línea. Mientras tanto, puede dirigirse directamente a{' '}
                        {data.business.businessName}
                        {data.business.address ? ` (${data.business.address})` : ''}.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ) : (
                  selectedEstablishment && (
                    <ComplaintForm
                      businessId={data.business.id}
                      establishmentId={selectedEstablishment.id}
                      businessInfo={{
                        businessName: data.business.businessName,
                        ruc: data.business.ruc,
                        address: data.business.address,
                      }}
                      establishmentInfo={{
                        name: selectedEstablishment.name,
                        address: selectedEstablishment.address,
                      }}
                      privacyPolicyUrl={data.libro.privacyPolicyUrl ?? null}
                      privacyPolicyFallbackHref={privacyPolicyPath(data.libro.slug)}
                      allowedComplaintTypes={data.libro.allowedComplaintTypes}
                      onSuccess={(result) => {
                        setSubmitted({
                          correlativeNumber: result.correlativeNumber,
                          dueDate: result.dueDate,
                        });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                    />
                  )
                )}
              </>
            )}
          </TabsContent>
          <TabsContent value="consultar" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Consultar el estado de un reclamo</CardTitle>
                <CardDescription>
                  Ingrese el número de registro que recibió y el número de documento del consumidor.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="consult-correlative">N.º de registro</Label>
                    <Input
                      id="consult-correlative"
                      placeholder="2026-0001"
                      value={correlative}
                      onChange={(e) => setCorrelative(e.target.value)}
                      data-testid="input-consult-correlative"
                    />
                  </div>
                  <div>
                    <Label htmlFor="consult-document">N.º de documento</Label>
                    <Input
                      id="consult-document"
                      placeholder="12345678"
                      value={documentNumber}
                      onChange={(e) => setDocumentNumber(e.target.value)}
                      data-testid="input-consult-document"
                    />
                  </div>
                </div>

                <Button
                  onClick={() => consult.mutate()}
                  disabled={consult.isPending || !correlative.trim() || !documentNumber.trim()}
                  data-testid="button-consult"
                >
                  <Search className="h-4 w-4 mr-2" />
                  {consult.isPending ? 'Consultando...' : 'Consultar'}
                </Button>

                {consult.isError && (
                  <p className="text-sm text-red-600" data-testid="consult-error">
                    {(consult.error as Error).message}
                  </p>
                )}

                {consult.data && (
                  <div className="border rounded-lg p-4 space-y-3" data-testid="consult-result">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold">{consult.data.correlativeNumber}</span>
                      <Badge className={STATUS_LABELS[consult.data.status]?.className || 'bg-gray-100 text-gray-800'}>
                        {STATUS_LABELS[consult.data.status]?.label || consult.data.status}
                      </Badge>
                    </div>
                    <dl className="grid grid-cols-2 gap-2 text-sm">
                      <dt className="text-gray-500">Tipo</dt>
                      <dd className="capitalize">{consult.data.complaintType}</dd>
                      <dt className="text-gray-500">Producto / servicio</dt>
                      <dd>{consult.data.productServiceName}</dd>
                      <dt className="text-gray-500">Presentado</dt>
                      <dd>{formatDate(consult.data.submissionDate)}</dd>
                      <dt className="text-gray-500">Fecha límite</dt>
                      <dd>{formatDate(consult.data.dueDate)}</dd>
                    </dl>
                    {consult.data.providerResponse ? (
                      <div className="bg-green-50 border border-green-200 rounded p-3">
                        <p className="text-sm font-medium text-green-900 mb-1">Respuesta de la empresa</p>
                        <p className="text-sm text-green-800 whitespace-pre-wrap">{consult.data.providerResponse}</p>
                        {consult.data.responseDate && (
                          <p className="text-xs text-green-700 mt-2">
                            Respondido el {formatDate(consult.data.responseDate)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">
                        La empresa aún no ha respondido. Plazo máximo: 15 días hábiles.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
