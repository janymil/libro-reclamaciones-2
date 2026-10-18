/**
 * Helpers for the "Clasificación Inteligente" panel.
 *
 * The customer should not have to copy-paste a complaint that the platform
 * already stores: picking it from a list must produce exactly the text the
 * classifier needs. Kept pure so `ai-classification.test.ts` can pin it.
 */

export interface ComplaintForClassification {
  complaintType: string;
  productServiceName: string;
  complaintDetail: string;
  consumerRequest?: string | null;
}

const typeLabel = (complaintType: string) =>
  complaintType === "queja" ? "Queja" : "Reclamo";

export function buildComplaintAIText(complaint: ComplaintForClassification): string {
  const parts = [
    `${typeLabel(complaint.complaintType)} sobre: ${complaint.productServiceName}`,
    `Detalle: ${complaint.complaintDetail}`,
  ];

  const request = complaint.consumerRequest?.trim();
  if (request) {
    parts.push(`Pedido del consumidor: ${request}`);
  }

  return parts.join("\n\n");
}

/** One line per option in the complaint picker. */
export function complaintOptionLabel(complaint: {
  correlativeNumber: string;
  complaintType: string;
  consumerFullName: string;
}): string {
  return `#${complaint.correlativeNumber} · ${typeLabel(complaint.complaintType)} · ${complaint.consumerFullName}`;
}

/** Accent- and case-insensitive text used by the complaint search. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface SearchableComplaint {
  correlativeNumber: string;
  consumerFullName: string;
  complaintType: string;
  productServiceName?: string;
}

export interface ComplaintSearchResult<T extends SearchableComplaint> {
  matches: T[];
  totalMatches: number;
  truncated: boolean;
}

/** How many rows the combobox renders at once before the user narrows it. */
export const COMPLAINT_SEARCH_LIMIT = 50;

/**
 * Instant search over the tenant's complaints: by correlative number ("0010"),
 * consumer name (accents ignored, so "maria" finds "María"), type ("queja") or
 * product/service.
 *
 * The list is capped: a tenant with thousands of complaints would otherwise
 * render every row in the dropdown and freeze the page. Typing narrows it, and
 * the UI says when it is showing a subset.
 */
export function filterComplaints<T extends SearchableComplaint>(
  complaints: readonly T[],
  query: string,
  limit: number = COMPLAINT_SEARCH_LIMIT,
): ComplaintSearchResult<T> {
  const needle = normalizeSearch(query);

  const matched = needle
    ? complaints.filter((complaint) =>
        normalizeSearch(
          [
            complaint.correlativeNumber,
            complaint.consumerFullName,
            typeLabel(complaint.complaintType),
            complaint.productServiceName ?? "",
          ].join(" "),
        ).includes(needle),
      )
    : [...complaints];

  return {
    matches: matched.slice(0, limit),
    totalMatches: matched.length,
    truncated: matched.length > limit,
  };
}
