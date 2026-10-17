import { BookOpen, Building2, Link2, Mail, Store } from 'lucide-react';

import { firstIdentificationCode, type SalesChannel } from '@shared/establishments';
import { scenarioFor, type LocalesScenario } from '@/lib/locales-plan';

/**
 * "Esto es lo que se creará": the live preview of the onboarding transaction.
 *
 * The wizard used to end with three lines (URL, nombre, tipo) that answered none
 * of the real doubts - above all for a chain, which cannot see from a form that
 * registering creates ONE local (its casa matriz, the place consumers file
 * against) plus the Libro of that local, and that the other sucursales are added
 * later. Every row below mirrors something the server actually writes in that
 * one transaction, with the values the customer just typed.
 */
export interface WhatWillBeCreatedProps {
  ruc: string;
  businessName: string;
  /** Name of the first establishment, as typed (it comes from `libroName`). */
  establishmentName: string;
  businessType: SalesChannel;
  slug: string;
  notificationEmail: string;
  scenario: LocalesScenario;
  /** Total locales declared by a chain (casa matriz included), when given. */
  extraLocales: number | null;
}

export default function WhatWillBeCreated({
  ruc,
  businessName,
  establishmentName,
  businessType,
  slug,
  notificationEmail,
  scenario,
  extraLocales,
}: WhatWillBeCreatedProps) {
  const isOnline = businessType === 'tienda_virtual';
  const code = firstIdentificationCode(businessType);

  /** What the first local is called, in the customer's own words. */
  const placeLabel =
    scenario === 'solo_online' ? 'Canal de venta' : scenario === 'casa_matriz_sucursales' ? 'Casa matriz' : 'Tu local';

  const rows = [
    {
      icon: Building2,
      label: 'Empresa',
      value: `${businessName || 'Tu empresa'} · RUC ${ruc || '—'}`,
      testId: 'preview-business',
    },
    {
      icon: Store,
      label: placeLabel,
      value: `${establishmentName || '—'} · código ${code}`,
      testId: 'preview-establishment',
    },
    {
      icon: BookOpen,
      label: 'Libro de Reclamaciones',
      value: 'Uno para toda la empresa, con un registro por local',
      testId: 'preview-book',
    },
    {
      icon: Link2,
      label: isOnline ? 'Enlace y QR de tu tienda' : 'Enlace y QR del libro',
      value: `librodigital.pe/${slug || '…'} · tus clientes eligen el local`,
      testId: 'preview-slug',
    },
    {
      icon: Mail,
      label: 'Avisos de reclamos',
      value: notificationEmail || 'El correo de tu cuenta',
      testId: 'preview-email',
    },
  ];

  const note = (() => {
    switch (scenario) {
      case 'casa_matriz_sucursales':
        return extraLocales && extraLocales > 1
          ? `Registramos tu casa matriz ahora. Los otros ${extraLocales - 1} locales los agregas en Sucursales (códigos SUC-002, SUC-003…): el enlace y el QR son los mismos para toda la empresa, y tus clientes eligen el local al reclamar.`
          : 'Registramos tu casa matriz ahora. Los demás locales los agregas en Sucursales (códigos SUC-002, SUC-003…): el enlace y el QR son los mismos para toda la empresa, y tus clientes eligen el local al reclamar.';
      case 'solo_online':
        return 'Vendiendo solo por Internet no necesitas local físico: este enlace y su QR son tu Libro de Reclamaciones (DS 011-2011-PCM).';
      case 'un_local':
      default:
        return 'Si algún día abres otro local, lo agregas en Sucursales: entra por el mismo enlace (el cliente elige el local) y queda con su propio registro para imprimir.';
    }
  })();

  return (
    <div
      className="rounded-lg border border-blue-200 bg-blue-50 p-4"
      data-testid="what-will-be-created"
    >
      <h4 className="font-semibold text-blue-900">Esto es lo que se creará</h4>
      <p className="mt-1 text-xs text-blue-800">
        Todo en un solo paso. Nada de esto se cobra por separado ni requiere otra configuración.
      </p>

      <dl className="mt-3 space-y-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.testId} className="flex items-start gap-2 text-sm" data-testid={row.testId}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden="true" />
              <div>
                <dt className="text-blue-900">{row.label}</dt>
                <dd className="font-medium text-blue-950">{row.value}</dd>
              </div>
            </div>
          );
        })}
      </dl>

      <p className="mt-3 border-t border-blue-200 pt-3 text-xs text-blue-800">{note}</p>
    </div>
  );
}
