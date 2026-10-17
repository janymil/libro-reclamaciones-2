import type { SalesChannel } from '@shared/establishments';

/**
 * "¿Cómo opera tu negocio?" - the LOCALES scenario of onboarding.
 *
 * Why this question exists: registering a company creates exactly ONE
 * establishment (the "lugar" every complaint is filed against, and the place the
 * first Libro de Reclamaciones belongs to). That is right for the vast majority
 * of accounts, but a chain cannot know it from the form: step 2 asked for
 * "Nombre del libro" as if the company had a single book, so a business with ten
 * locales typed its BOOK TITLE into the field that becomes the NAME OF ITS FIRST
 * LOCAL (and the label consumers read in "¿dónde ocurrió?").
 *
 * These scenarios ask the question in the customer's own terms and translate the
 * answer into the two things the server needs: `businessType` (the channel, which
 * decides the identification code) and the name of that first establishment
 * (which the server takes from `libroName`).
 */
export type LocalesScenario = 'un_local' | 'casa_matriz_sucursales' | 'solo_online';

export interface LocalesScenarioOption {
  id: LocalesScenario;
  title: string;
  description: string;
  /** Concrete example, so nobody has to guess what we mean. */
  example: string;
  /** The name field means something different per scenario. */
  nameLabel: string;
  nameHint: string;
  /** Sales channel this scenario implies. */
  businessType: SalesChannel;
}

export const LOCALES_SCENARIOS: LocalesScenarioOption[] = [
  {
    id: 'un_local',
    title: 'Un solo local',
    description: 'Atiendo en un único establecimiento (tienda, oficina, consultorio).',
    example: 'Ej.: Bodega Doña Rosa',
    nameLabel: 'Nombre de tu local',
    nameHint:
      'Será el nombre de tu establecimiento y el de su Libro de Reclamaciones: tus clientes lo verán al reclamar.',
    businessType: 'local_fisico',
  },
  {
    id: 'casa_matriz_sucursales',
    title: 'Casa matriz + sucursales',
    description: 'Tengo un local principal y otros locales donde también atiendo.',
    example: 'Ej.: Casa Matriz - Tienda Wong',
    nameLabel: 'Nombre de tu casa matriz',
    nameHint:
      'Es tu local principal. Los demás locales los agregas después en Sucursales: tus clientes entran por el mismo enlace y eligen el local.',
    businessType: 'local_fisico',
  },
  {
    id: 'solo_online',
    title: 'Solo vendo por internet',
    description: 'No tengo local abierto al público: vendo por web, WhatsApp o redes.',
    example: 'Ej.: Tienda Online - Mi Marca',
    nameLabel: 'Nombre para tu venta online',
    nameHint:
      'Vendiendo por Internet el Libro debe ser accesible desde ese mismo medio; se identifica con este nombre.',
    businessType: 'tienda_virtual',
  },
];

/** Whether a value is one of the known scenarios (persisted data can be stale). */
export function isLocalesScenario(value: unknown): value is LocalesScenario {
  return LOCALES_SCENARIOS.some((option) => option.id === value);
}

export function scenarioFor(id: LocalesScenario): LocalesScenarioOption {
  return LOCALES_SCENARIOS.find((option) => option.id === id) ?? LOCALES_SCENARIOS[0];
}

/**
 * Suggested name for the first establishment ("lugar"), per scenario.
 *
 * A chain gets "Casa Matriz - <nombre comercial>" instead of the old flat default:
 * it says out loud that this first one is the head office and that the rest are
 * added later, which is exactly the doubt the field used to create. The user can
 * always type over it.
 */
export function suggestedEstablishmentName(
  scenario: LocalesScenario,
  business: { businessName?: string | null; commercialName?: string | null },
): string {
  const tradingName = (business.commercialName ?? '').trim() || (business.businessName ?? '').trim();

  switch (scenario) {
    case 'casa_matriz_sucursales':
      return tradingName ? `Casa Matriz - ${tradingName}` : 'Casa Matriz';
    case 'solo_online':
      return tradingName ? `Tienda Online - ${tradingName}` : 'Tienda Online';
    case 'un_local':
    default:
      return tradingName;
  }
}

/**
 * How many locales the customer says it has in total, or null when unknown.
 *
 * Feeds the post-registration checklist ("Sucursales 2 de 5") through
 * `businesses.expected_establishments`. Only the chain scenario asks: one-locale
 * businesses and online-only stores are complete with the establishment the
 * registration already created.
 */
export function expectedLocales(scenario: LocalesScenario, extraLocales?: number | null): number | null {
  if (scenario !== 'casa_matriz_sucursales') {
    return 1;
  }

  if (typeof extraLocales !== 'number' || !Number.isFinite(extraLocales) || extraLocales < 1) {
    return null;
  }

  // The casa matriz is one of them; a company cannot claim more than 500 locales.
  return Math.min(Math.round(extraLocales), 500);
}
