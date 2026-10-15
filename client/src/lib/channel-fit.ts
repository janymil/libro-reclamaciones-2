/**
 * Which channel guidance applies to a business.
 *
 * A pure mapping, deliberately kept out of the component so it is unit tested:
 * the Integraciones page shows different help depending on HOW the business
 * sells. An online store needs the link/QR/widget for its own website; someone
 * who sells only through WhatsApp or social networks needs the opposite - the
 * link plus copy-ready texts for their profiles (there is no website to embed).
 *
 * Unknown or legacy values (rows created before the field existed, or a manual
 * import) fall back to showing every guide: guidance must never disappear
 * because of a missing string.
 */

export type BusinessType = 'tienda_virtual' | 'local_fisico' | 'servicios' | 'mixto';

/** Must match the options offered at onboarding (client/src/pages/onboarding-page.tsx). */
export const BUSINESS_TYPE_OPTIONS: Array<{ value: BusinessType; label: string }> = [
  { value: 'tienda_virtual', label: 'Tienda virtual / E-commerce' },
  { value: 'local_fisico', label: 'Local físico' },
  { value: 'servicios', label: 'Servicios' },
  { value: 'mixto', label: 'Mixto (físico + virtual)' },
];

export interface ChannelFit {
  /** "Enlace directo para su web": footer, checkout, menus. */
  showWebLink: boolean;
  /** Guide for WhatsApp, Instagram, TikTok, YouTube and Facebook profiles. */
  showSocialChannels: boolean;
  headline: string;
  hint: string;
}

const WEB_ONLY: ChannelFit = {
  showWebLink: true,
  showSocialChannels: false,
  headline: 'Vende por su web o tienda online',
  hint:
    'Pegue el enlace en el pie de página y en el checkout, o instale el widget. Para la venta por Internet ' +
    'el Libro debe ser accesible desde ese mismo medio (DS 011-2011-PCM).',
};

const SOCIAL_ONLY: ChannelFit = {
  showWebLink: false,
  showSocialChannels: true,
  headline: 'Vende por redes sociales',
  hint:
    'No necesita web: copie el enlace y el texto y péguelos en su perfil de WhatsApp, Instagram, TikTok, ' +
    'YouTube o Facebook. Sume el QR impreso si además atiende en un local.',
};

const BOTH: ChannelFit = {
  showWebLink: true,
  showSocialChannels: true,
  headline: 'Vende en local, por redes y por Internet',
  hint:
    'Use el enlace en su web y en sus perfiles de redes sociales: juntos cubren la venta online y el local físico.',
};

export function resolveChannelFit(businessType: string | null | undefined): ChannelFit {
  switch (businessType) {
    case 'tienda_virtual':
      return WEB_ONLY;
    case 'local_fisico':
    case 'servicios':
      return SOCIAL_ONLY;
    case 'mixto':
      return BOTH;
    default:
      return BOTH;
  }
}
