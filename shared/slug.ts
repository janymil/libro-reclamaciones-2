/**
 * Public URL slug of a Libro de Reclamaciones (`librodigital.pe/<slug>`).
 *
 * Shared on purpose: the wizard and the "Nueva Empresa" form suggest the URL
 * while the user types the name, and the server derives one when the form sends
 * none - so the URL shown in the preview is exactly the URL that gets stored.
 *
 * Accents are stripped first ("Comercial Ríos" -> "comercial-rios"): SUNAT's
 * razón social is full of them and the previous inline version produced
 * runs of dashes instead.
 */
export function libroSlugFrom(name: string): string {
  return name
    .normalize('NFD')
    // Combining diacritics left by NFD ("í" -> "i" + U+0301).
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    // url_slug is varchar(100).
    .slice(0, 100);
}
