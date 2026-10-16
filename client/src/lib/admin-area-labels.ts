/**
 * Localized labels for the audit areas, kept in the client so the console can render a
 * history entry without a second request. Mirrors `CONFIG_AREA_LABELS` on the server.
 */
export const CONFIG_AREA_LABELS_TEXT: Record<string, string> = {
  pago: 'Datos de pago',
  identidad: 'Identidad',
  planes: 'Planes y precios',
  descuentos: 'Descuentos',
  operacion: 'Operación',
  equipo: 'Equipo',
};
