import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, FileText, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import BackToTop from "@/components/layout/back-to-top";

/**
 * Privacy policy of a book (Ley 29733 / DS 016-2024-JUS).
 *
 * This is the page the consent checkbox of the public form opens when the
 * business has not published a policy of its own. Before, that link was a "#":
 * the consumer was asked to accept a policy they could not read, and no plan
 * could fix it. The text is generated server-side from data already public in the
 * book (razón social, RUC, domicilio, retention window, public consumer
 * contacts), and when the business does publish its own policy this page says so
 * and links to it as the authoritative document.
 */
interface PublicPrivacyPolicy {
  libro: { name: string; slug: string; privacyPolicyUrl: string | null };
  business: {
    businessName: string;
    commercialName: string | null;
    ruc: string;
    address: string;
  };
  policy: {
    responsible: { name: string; commercialName: string | null; ruc: string; address: string };
    retentionMonths: number;
    arcoChannels: string[];
    sections: Array<{ title: string; paragraphs: string[] }>;
  };
}

export default function PrivacyPolicyPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const { data, isLoading, error } = useQuery<PublicPrivacyPolicy>({
    queryKey: [`/api/public/libro/${slug}/privacy-policy`],
    enabled: Boolean(slug),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface py-8 px-4">
        <p className="max-w-3xl mx-auto text-gray-600" data-testid="privacy-policy-loading">
          Cargando la política de privacidad…
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-surface py-8 px-4">
        <Card className="max-w-3xl mx-auto" data-testid="privacy-policy-not-found">
          <CardHeader>
            <CardTitle>No se encontró la política de privacidad</CardTitle>
            <CardDescription className="leading-relaxed">
              Puede que el enlace haya cambiado. Verifique la dirección del Libro de Reclamaciones al
              que llegó desde el código QR o el enlace de la empresa.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const { libro, policy } = data;

  return (
    <div className="min-h-screen bg-surface py-8 px-4" data-testid="privacy-policy-page">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href={`/libro/${slug}`}
          className="inline-flex items-center text-sm text-primary underline"
          data-testid="link-back-to-book"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Volver al Libro de Reclamaciones
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ShieldCheck className="h-6 w-6 text-green-600" />
              Política de Privacidad
            </CardTitle>
            <CardDescription>
              {libro.name} · {policy.responsible.name}
              {policy.responsible.commercialName ? ` (${policy.responsible.commercialName})` : ""}
              <br />
              RUC {policy.responsible.ruc}
              {policy.responsible.address ? ` — ${policy.responsible.address}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-gray-600 leading-relaxed">
            Conforme a la Ley N° 29733, Ley de Protección de Datos Personales, y su Reglamento
            (DS N° 016-2024-JUS). Los datos personales consignados en este Libro de Reclamaciones se
            conservan {policy.retentionMonths} meses desde el registro de cada reclamo.
          </CardContent>
        </Card>

        {libro.privacyPolicyUrl && (
          <Card data-testid="notice-business-policy">
            <CardContent className="pt-6 flex items-start gap-3">
              <FileText className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <p className="text-sm text-gray-700">
                {policy.responsible.name} publica su propia política de privacidad, que es el documento
                oficial y prevalece sobre este resumen.{" "}
                <a
                  href={libro.privacyPolicyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline inline-flex items-center gap-1"
                  data-testid="link-business-policy"
                >
                  Ver la política de {policy.responsible.commercialName ?? policy.responsible.name}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Tratamiento de datos personales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {policy.sections.map((section) => (
              <div key={section.title}>
                <h3 className="font-semibold text-gray-900">{section.title}</h3>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="text-sm text-gray-700 mt-1 leading-relaxed">
                    {paragraph}
                  </p>
                ))}
                {/* The channels belong to the ARCO section: a consumer looking for
                    "how do I exercise my rights" must not have to guess. */}
                {section.title.includes("Derechos ARCO") && (
                  <ul className="list-disc list-inside text-sm text-gray-700 mt-1 space-y-1">
                    {policy.arcoChannels.map((channel) => (
                      <li key={channel}>{channel}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <p className="text-xs text-gray-500 text-center">
          Documento generado por Librodigital.pe para {policy.responsible.name}.
          {libro.privacyPolicyUrl
            ? " La empresa puede actualizarlo publicando su propia política."
            : " La empresa puede publicar su propia política de privacidad y este enlace apuntará a ella."}
        </p>
      </div>
      <BackToTop />
    </div>
  );
}
