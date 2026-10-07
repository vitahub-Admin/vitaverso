/**
 * Qué pasarela está disponible para cobrar una venta de consultorio.
 *
 *   'shopify'       → el paciente paga en el checkout de Shopify (borrador de pedido)
 *   'mock'          → se simula el pago (desarrollo, o demos)
 *   'no-disponible' → no se puede cobrar
 *
 * El cobro real solo existe para las cuentas listadas en COBRO_SANDBOX_IDS: son
 * las del piloto. Para cualquier otro profesional no está disponible todavía.
 *
 * COBRO_PASARELA fuerza una u otra:
 *   · 'mock'    → en producción, deja a las cuentas del piloto en simulado (demos)
 *   · 'shopify' → en desarrollo, prueba el cobro real desde localhost
 *
 * Stripe y Mercado Pago directos quedaron descartados: sin acceso a las cuentas.
 * Shopify ya tiene conectados Shopify Payments, Google Pay, PayPal y Mercado Pago.
 */

const sandbox = () =>
  (process.env.COBRO_SANDBOX_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

export function esSandbox(ownerId) {
  return Boolean(ownerId) && sandbox().includes(String(ownerId));
}

const enProduccion = () => process.env.NODE_ENV === 'production';

/**
 * @param {string|number} [ownerId] profesional dueño de la venta. Se mira el
 *        dueño y no quién abre la página porque el que paga es el paciente,
 *        que no tiene sesión.
 */
export function pasarelaActiva(ownerId) {
  const forzada = process.env.COBRO_PASARELA;

  if (enProduccion()) {
    if (!esSandbox(ownerId)) return 'no-disponible';
    return forzada === 'mock' ? 'mock' : 'shopify';
  }
  return forzada === 'shopify' ? 'shopify' : 'mock';
}

export const sePuedeCobrar = (ownerId) => pasarelaActiva(ownerId) !== 'no-disponible';

/** Cuánto se cobra de verdad en pruebas. Dinero real, pero de monto mínimo. */
const MONTO_PRUEBA = Number(process.env.COBRO_SANDBOX_MONTO || 50);

/**
 * Lo que se le cobra al paciente.
 *
 * Mientras la cuenta esté en el piloto (o se corra en desarrollo) se cobra un
 * monto fijo chico, sin importar el total del pedido, para probar el circuito
 * con pagos reales sin mover cantidades reales. Nunca más que el total.
 */
export function montoACobrar(ownerId, total) {
  const enPrueba = esSandbox(ownerId) || !enProduccion();
  return enPrueba ? Math.min(MONTO_PRUEBA, Number(total)) : Number(total);
}

export const esModoPrueba = (ownerId) => esSandbox(ownerId) || !enProduccion();
