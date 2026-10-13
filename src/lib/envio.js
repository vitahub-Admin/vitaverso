/**
 * Qué se entrega en el consultorio y qué viaja.
 *
 * El costo del envío no se calcula acá: lo cotiza el checkout de Shopify con la
 * dirección del paciente (estándar, entrega local, DHL; gratis desde $599).
 */

/**
 * Unidades de una línea que salen del consultorio.
 *
 * `mano_qty` es lo que el profesional separó y no cambia: si el paciente pide
 * menos, se entregan menos; si pide más, lo extra siempre se envía. De ahí el
 * mínimo entre las dos.
 *
 * Las ventas de los primeros días guardaban `entrega: 'mano' | 'envio'` para
 * toda la línea, sin partirla. Mientras queden cobros pendientes de esa época
 * se leen con esa regla.
 */
export function unidadesSeparadas(item) {
  if (item?.mano_qty != null) return Number(item.mano_qty) || 0;
  return item?.entrega === 'mano' ? Number(item.quantity) || 0 : 0;
}

export function unidadesEnMano(item) {
  return Math.min(Number(item?.quantity) || 0, unidadesSeparadas(item));
}

/** ¿Hay algo que enviar? Si todo se entrega en el consultorio no hay envío ni dirección. */
export function hayEnvio(items = []) {
  return items.some(i => Number(i?.quantity) > unidadesEnMano(i));
}

