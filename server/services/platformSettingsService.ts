import { TRIAL_DAYS } from "@shared/plans";
import type { PlatformSettings } from "@shared/schema";

import { storage } from "../storage";
import type { PlatformSettingsInput } from "../storage/platformSettings.storage";
import { recordPlatformChange, type ConsoleActor } from "./platformAuditService";

/**
 * The platform's operational settings (Phase 2.7, step 4).
 *
 * Four things used to be env-only or hardcoded, and every one of them was a change
 * that required a deploy (or a value nobody could audit):
 *
 *   * where payment alerts go (`PAYMENTS_ALERT_EMAIL`),
 *   * who the platform legally is (name, RUC, dirección fiscal, contact),
 *   * how long the free trial lasts (`TRIAL_DAYS`),
 *   * whether a plan may be activated WITHOUT collecting money
 *     (`PAYMENTS_ALLOW_FREE_PLAN_CHANGE`).
 *
 * The environment variables keep working as the default, so an existing deployment
 * behaves exactly the same the moment this ships; the console row, once saved, takes
 * precedence. Which is why every read has two halves: what is stored, and what it
 * falls back to.
 *
 * Reads are cached for `CACHE_TTL_MS` because the hot paths (an outgoing email, a
 * webhook alert, a plan change) must not add a query each; writes invalidate it.
 */

const CACHE_TTL_MS = 30_000;

/** What the platform calls itself when nobody has filled the identity in. */
const FALLBACK_COMMERCIAL_NAME = () => (process.env.SMTP_FROM_NAME ?? '').trim() || 'LibroDigital.pe';
const FALLBACK_CONTACT_EMAIL = () =>
  (process.env.SMTP_FROM_EMAIL ?? '').trim() || 'hola@librodigital.pe';
const FALLBACK_WEBSITE = () =>
  ((process.env.APP_URL ?? '').trim() || 'https://librodigital.pe').replace(/\/+$/, '');

export interface PlatformIdentity {
  /** Razón social for legal/fiscal lines. Falls back to the commercial name. */
  legalName: string;
  commercialName: string;
  /** Empty string when nobody has filled it in: callers must not invent an RUC. */
  ruc: string;
  fiscalAddress: string;
  contactEmail: string;
  contactPhone: string;
  website: string;
}

export interface PlatformSettingsView {
  stored: {
    alertEmail: string | null;
    legalName: string | null;
    commercialName: string | null;
    ruc: string | null;
    fiscalAddress: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    website: string | null;
    trialDays: number | null;
    allowFreePlanChange: boolean;
  };
  /** What is actually in force right now, env defaults included. */
  effective: {
    alertEmail: string;
    alertEmailSource: 'panel' | 'env' | 'none';
    trialDays: number;
    trialDaysSource: 'panel' | 'default';
    allowFreePlanChange: boolean;
    /** True when the env var is what enables it (panel flag is off). */
    allowFreePlanChangeFromEnv: boolean;
  };
  identity: PlatformIdentity;
  saved: boolean;
  updatedAt: string | null;
  updatedByEmail: string | null;
}

let cache: { at: number; row: PlatformSettings | undefined } | null = null;

/** Drops the cache. Called after a write and by tests. */
export function clearPlatformSettingsCache(): void {
  cache = null;
}

async function loadRow(): Promise<PlatformSettings | undefined> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.row;
  }
  let row: PlatformSettings | undefined;
  try {
    row = await storage.getPlatformSettings();
  } catch (error) {
    // A settings table that cannot be read must not break billing, email or the
    // webhook: log it and behave as "nothing configured" (i.e. env defaults).
    console.error(
      '[console] no se pudo leer platform_settings (¿migración 0009 sin aplicar?). ' +
        'Se usan los valores del entorno.',
      error,
    );
    return undefined;
  }
  cache = { at: Date.now(), row };
  return row;
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed ? trimmed : null;
}

/**
 * The identity used on receipts, alerts and the public site.
 *
 * Never invents a RUC or an address: an empty string means "not configured", and the
 * caller prints nothing instead of a placeholder that looks like real fiscal data.
 */
export async function getIdentity(): Promise<PlatformIdentity> {
  const row = await loadRow();
  const commercialName = trimmedOrNull(row?.commercialName) ?? FALLBACK_COMMERCIAL_NAME();

  return {
    legalName: trimmedOrNull(row?.legalName) ?? commercialName,
    commercialName,
    ruc: trimmedOrNull(row?.ruc) ?? '',
    fiscalAddress: trimmedOrNull(row?.fiscalAddress) ?? '',
    contactEmail: trimmedOrNull(row?.contactEmail) ?? FALLBACK_CONTACT_EMAIL(),
    contactPhone: trimmedOrNull(row?.contactPhone) ?? '',
    website: trimmedOrNull(row?.website)?.replace(/\/+$/, '') ?? FALLBACK_WEBSITE(),
  };
}

/** Where a "paid but unmatched" alert is sent. Panel first, then the env var. */
export async function getAlertEmail(): Promise<string | null> {
  const row = await loadRow();
  return trimmedOrNull(row?.alertEmail) ?? trimmedOrNull(process.env.PAYMENTS_ALERT_EMAIL);
}

export function envAlertEmail(): string | null {
  return trimmedOrNull(process.env.PAYMENTS_ALERT_EMAIL);
}

/** Free trial length in days: the console's value, or the built-in default. */
export async function getTrialDays(): Promise<number> {
  const row = await loadRow();
  const configured = row?.trialDays ?? null;
  if (configured !== null && Number.isFinite(configured) && configured > 0) {
    return Math.min(Math.trunc(configured), 365);
  }
  return TRIAL_DAYS;
}

/**
 * Whether a plan may be applied WITHOUT a confirmed payment.
 *
 * Two independent switches, both deliberate: the console flag (audited) and the env
 * var (only settable by whoever deploys). Either one is enough, and neither is
 * implied by anything else.
 */
export async function isFreePlanChangeAllowed(): Promise<boolean> {
  const row = await loadRow();
  return row?.allowFreePlanChange === true || process.env.PAYMENTS_ALLOW_FREE_PLAN_CHANGE === 'true';
}

/** The console's view: what is stored, what is in force, and where it comes from. */
export async function readPlatformSettings(): Promise<PlatformSettingsView> {
  const row = await loadRow();
  const identity = await getIdentity();
  const alertEmail = await getAlertEmail();
  const trialDays = await getTrialDays();
  const envAlert = envAlertEmail();

  let updatedByEmail: string | null = null;
  if (row?.updatedByUserId) {
    const operator = await storage.getUser(row.updatedByUserId).catch(() => undefined);
    updatedByEmail = operator?.email ?? null;
  }

  return {
    stored: {
      alertEmail: trimmedOrNull(row?.alertEmail),
      legalName: trimmedOrNull(row?.legalName),
      commercialName: trimmedOrNull(row?.commercialName),
      ruc: trimmedOrNull(row?.ruc),
      fiscalAddress: trimmedOrNull(row?.fiscalAddress),
      contactEmail: trimmedOrNull(row?.contactEmail),
      contactPhone: trimmedOrNull(row?.contactPhone),
      website: trimmedOrNull(row?.website),
      trialDays: row?.trialDays ?? null,
      allowFreePlanChange: row?.allowFreePlanChange === true,
    },
    effective: {
      alertEmail: alertEmail ?? '',
      alertEmailSource: trimmedOrNull(row?.alertEmail) ? 'panel' : envAlert ? 'env' : 'none',
      trialDays,
      trialDaysSource: row?.trialDays ? 'panel' : 'default',
      allowFreePlanChange: await isFreePlanChangeAllowed(),
      allowFreePlanChangeFromEnv: process.env.PAYMENTS_ALLOW_FREE_PLAN_CHANGE === 'true',
    },
    identity,
    saved: Boolean(row),
    updatedAt: row ? row.updatedAt.toISOString() : null,
    updatedByEmail,
  };
}

/**
 * Saves the operational settings and records the change.
 *
 * `trialDays` is deliberately not part of this input: it belongs to the Planes
 * screen, which saves the price list and the trial length together (see
 * `pricingService`) because they are the same commercial decision.
 */
export async function savePlatformSettings(
  input: PlatformSettingsInput,
  actor: ConsoleActor,
): Promise<PlatformSettingsView> {
  const before = await readPlatformSettings();
  const row = await storage.savePlatformSettings(input, actor.userId);
  clearPlatformSettingsCache();

  await recordPlatformChange(actor, 'operacion', describeSettingsChange(before, input), {
    before: before.stored,
    after: {
      alertEmail: row.alertEmail,
      legalName: row.legalName,
      commercialName: row.commercialName,
      ruc: row.ruc,
      fiscalAddress: row.fiscalAddress,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      website: row.website,
      allowFreePlanChange: row.allowFreePlanChange,
    },
  });

  return readPlatformSettings();
}

/**
 * A one-line summary a human understands months later.
 *
 * The dangerous flag is called out on its own, because "se activó el cambio de plan
 * sin pago" is the sentence someone will search for in the history.
 */
function describeSettingsChange(
  before: PlatformSettingsView,
  input: PlatformSettingsInput,
): string {
  const parts: string[] = [];

  if (input.allowFreePlanChange !== undefined) {
    if (input.allowFreePlanChange && !before.stored.allowFreePlanChange) {
      parts.push('⚠️ cambio de plan SIN pago ACTIVADO');
    } else if (!input.allowFreePlanChange && before.stored.allowFreePlanChange) {
      parts.push('cambio de plan sin pago desactivado');
    }
  }

  const identityFields: [keyof PlatformSettingsInput, string][] = [
    ['legalName', 'razón social'],
    ['commercialName', 'nombre comercial'],
    ['ruc', 'RUC'],
    ['fiscalAddress', 'dirección fiscal'],
    ['contactEmail', 'correo de contacto'],
    ['contactPhone', 'teléfono de contacto'],
    ['website', 'sitio web'],
  ];
  const touched = identityFields.filter(([key]) => input[key] !== undefined);
  if (touched.length > 0) {
    parts.push(`identidad (${touched.map(([, label]) => label).join(', ')})`);
  }

  if (input.alertEmail !== undefined) {
    parts.push(`correo de alertas → ${input.alertEmail || 'sin configurar'}`);
  }

  return parts.length > 0
    ? `Configuración: ${parts.join('; ')}`
    : 'Configuración: sin cambios efectivos';
}

