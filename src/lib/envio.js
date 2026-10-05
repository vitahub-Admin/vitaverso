/**
 * Costo de envío del protocolo.
 *
 * Mismas reglas que la tienda: gratis a partir del umbral, precio fijo debajo.
 * Si se vuelven más finas —por zona o por peso— este es el único lugar a tocar.
 * Solo se cobra si hay algo que enviar: si el profesional entrega todo en mano,
 * el envío no existe.
 */

export const ENVIO_GRATIS_DESDE = 600;
export const ENVIO_COSTO        = 99;

export function calcularEnvio(subtotal, hayEnvio) {
  if (!hayEnvio) return 0;
  return Number(subtotal) >= ENVIO_GRATIS_DESDE ? 0 : ENVIO_COSTO;
}

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
