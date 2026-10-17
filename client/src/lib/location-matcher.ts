import { departments, getDistricts, getProvinces } from "@/data/peru-locations";

/**
 * Matches the location strings returned by the RUC lookup providers against the
 * local ubigeo dataset.
 *
 * Those providers republish SUNAT's own strings, which are close to - but not
 * identical to - this dataset: `PROV. CONST. DEL CALLAO` where the dataset has
 * the same but a `CALLAO` department, accents, doubled spaces, `PROV.`/`DIST.`
 * prefixes. A strict `Array.includes()` therefore fails *silently*: the value
 * is dropped, the select stays empty, and the user is asked to type again data
 * the lookup had already returned.
 */

/**
 * Prefixes SUNAT adds that carry no information for a match. Only unambiguous
 * administrative noise is removed - never a leading `EL`/`LA`, because those
 * are part of real names (`EL COLLAO`, `LA CONVENCION`).
 */
const NOISE_PREFIXES: RegExp[] = [
  /^PROV\.?\s*CONST\.?\s*DEL\s+/,
  /^PROVINCIA\s+CONSTITUCIONAL\s+DEL\s+/,
  /^DEPARTAMENTO\s+DE\s+/,
  /^DISTRITO\s+DE\s+/,
  /^PROV\.?\s+/,
  /^DIST\.?\s+/,
];

function stripNoise(value: string): string {
  let out = value;
  let changed = true;

  while (changed) {
    changed = false;
    for (const pattern of NOISE_PREFIXES) {
      const next = out.replace(pattern, "");
      if (next !== out) {
        out = next;
        changed = true;
      }
    }
  }

  return out;
}

/** Uppercase, unaccented, punctuation-free form used for comparisons. */
export function normalizeLocationName(value: string | null | undefined): string {
  const base = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // drop the accents
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return stripNoise(base).replace(/\s+/g, " ").trim();
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Picks the dataset entry equivalent to `raw`, or null when nothing matches. */
function matchIn(candidates: string[], raw: string | null): string | null {
  const target = normalizeLocationName(raw);
  if (!target) return null;

  const exact = candidates.find((candidate) => normalizeLocationName(candidate) === target);
  if (exact) return exact;

  const compact = target.replace(/[^A-Z0-9]/g, "");
  const compacted = candidates.find(
    (candidate) => normalizeLocationName(candidate).replace(/[^A-Z0-9]/g, "") === compact,
  );
  if (compacted) return compacted;

  // Last resort: a provider that appends the district to the province, e.g.
  // "CALLAO CALLAO".
  return (
    candidates.find((candidate) => {
      const name = normalizeLocationName(candidate);
      return name.length >= 4 && target.includes(name);
    }) ?? null
  );
}

export function matchDepartment(value: unknown): string | null {
  return matchIn(departments, asText(value));
}

export function matchProvince(department: string | null, value: unknown): string | null {
  if (!department) return null;
  return matchIn(getProvinces(department), asText(value));
}

export function matchDistrict(
  department: string | null,
  province: string | null,
  value: unknown,
): string | null {
  if (!department || !province) return null;
  return matchIn(getDistricts(department, province), asText(value));
}

export interface ResolvedLocation {
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
}

/**
 * Resolves a lookup payload onto dataset values.
 *
 * Each level is resolved against the previous one, so a province is only
 * accepted when its department was recognised (and a district only when both
 * were), which is what keeps the cascading selects consistent.
 */
export function resolvePeruLocation(input: {
  departamento?: unknown;
  provincia?: unknown;
  distrito?: unknown;
}): ResolvedLocation {
  const departamento = matchDepartment(input?.departamento);
  const provincia = matchProvince(departamento, input?.provincia);
  const distrito = matchDistrict(departamento, provincia, input?.distrito);

  return { departamento, provincia, distrito };
}
