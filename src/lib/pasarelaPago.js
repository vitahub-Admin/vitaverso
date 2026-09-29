/**
 * Qué pasarela está disponible para cobrar una venta de consultorio.
 *
 *   'stripe'       → hay llaves configuradas: cobra Stripe y confirma su webhook
 *   'mock'         → entorno de desarrollo sin Stripe: se simula el pago
 *   'no-disponible'→ producción sin Stripe: no se puede cobrar
 *
 * El caso que importa es el tercero. El simulador marca ventas como pagadas y
 * descuenta stock sin que entre un peso; si viviera en producción, cualquiera
 * con el link de cobro podría llevarse el producto gratis. Por eso el mock
 * está atado a que NO sea producción, y no solo a la ausencia de Stripe.
 */
export function pasarelaActiva() {
  if (process.env.STRIPE_SECRET_KEY) return 'stripe';
  if (process.env.NODE_ENV !== 'production') return 'mock';
  return 'no-disponible';
}

export const sePuedeCobrar = () => pasarelaActiva() !== 'no-disponible';
