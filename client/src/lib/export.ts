/**
 * Client-side export helpers.
 *
 * Reports are exported as CSV with a `;` separator and a UTF-8 BOM so Spanish
 * Excel opens them correctly (accents, decimal commas).
 */

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const lines = [headers.join(";")];

  for (const row of rows) {
    lines.push(headers.map((header) => escapeCsvValue(row[header])).join(";"));
  }

  return lines.join("\r\n");
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Downloads rows as a CSV file that opens directly in Excel. */
export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>): void {
  const csv = toCsv(rows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(filename.endsWith(".csv") ? filename : `${filename}.csv`, blob);
}

/** Returns today's date as YYYY-MM-DD, for building file names. */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
