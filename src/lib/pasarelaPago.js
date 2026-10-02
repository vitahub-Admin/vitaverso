/**
 * Qué pasarela está disponible para cobrar una venta de consultorio.
 *
 *   'stripe'        → hay llaves configuradas: cobra Stripe y confirma su webhook
 *   'mock'          → se simula el pago (desarrollo, o cuentas en sandbox)
 *   'no-disponible' → no se puede cobrar
 *
 * El simulador marca ventas como pagadas, descuenta stock y acredita comisión
 * sin que entre un peso. Por eso en producción solo existe para las cuentas
 * listadas en COBRO_SANDBOX_IDS: son las del piloto, probando el circuito
 * completo antes de que haya pasarela real. Para cualquier otro profesional,
 * el cobro no está disponible hasta que exista Stripe.
 */

const sandbox = () =>
  (process.env.COBRO_SANDBOX_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

export function esSandbox(ownerId) {
  return Boolean(ownerId) && sandbox().includes(String(ownerId));
}

/**
 * @param {string|number} [ownerId] profesional dueño de la venta. Se mira el
 *        dueño y no quién abre la página porque el que paga es el paciente,
 *        que no tiene sesión.
 */
export function pasarelaActiva(ownerId) {
  if (process.env.STRIPE_SECRET_KEY) return 'stripe';
  if (process.env.NODE_ENV !== 'production') return 'mock';
  if (esSandbox(ownerId)) return 'mock';
  return 'no-disponible';
}

export const sePuedeCobrar = (ownerId) => pasarelaActiva(ownerId) !== 'no-disponible';
