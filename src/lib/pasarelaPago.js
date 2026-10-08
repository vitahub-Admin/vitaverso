/**
 * Qué pasarela está disponible para cobrar una venta de consultorio.
 *
 *   'shopify' → el paciente paga en el checkout de Shopify (borrador de pedido)
 *   'mock'    → se simula el pago (desarrollo, o demos)
 *
 * No hay lista de cuentas habilitadas ni monto de prueba: el cobro es real y por el
 * total del pedido. Quién puede cobrar lo decide el stock en consignación, que solo
 * se asigna desde el admin: un profesional sin productos en su consultorio nunca ve
 * el flujo de cobro.
 *
 * COBRO_PASARELA fuerza una u otra:
 *   · 'mock'    → en producción, deja el cobro en simulado (demos)
 *   · 'shopify' → en desarrollo, prueba el cobro real desde localhost
 *
 * Shopify ya tiene conectados Shopify Payments, Google Pay, PayPal y Mercado Pago.
 */

const enProduccion = () => process.env.NODE_ENV === 'production';

/** @param {string|number} [ownerId] sin uso por ahora; se conserva para no tocar a quien llama */
// eslint-disable-next-line no-unused-vars
export function pasarelaActiva(ownerId) {
  const forzada = process.env.COBRO_PASARELA;
  if (enProduccion()) return forzada === 'mock' ? 'mock' : 'shopify';
  return forzada === 'shopify' ? 'shopify' : 'mock';
}

export const sePuedeCobrar = (ownerId) => pasarelaActiva(ownerId) !== 'no-disponible';

/** Lo que se le cobra al paciente: el total del pedido. */
// eslint-disable-next-line no-unused-vars
export const montoACobrar = (ownerId, total) => Number(total);

/** Ya no hay modo de prueba: se conserva para el campo que lee la página de cobro. */
// eslint-disable-next-line no-unused-vars
export const esModoPrueba = (ownerId) => false;
