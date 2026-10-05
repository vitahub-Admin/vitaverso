/**
 * Los totales de una venta de consultorio, en un solo lugar.
 *
 * Tres caminos distintos tocan los mismos números —armar el cobro, cambiar
 * cantidades, aplicar un descuento— y antes cada uno los calculaba por su
 * cuenta. Con eso alcanza para que un día el subtotal diga una cosa y el total
 * otra. Acá se calculan una vez y los tres piden el resultado.
 */

import { calcularEnvio, unidadesEnMano } from './envio';

/**
 * @param {Array}  items      líneas de la venta (las de cantidad 0 no suman)
 * @param {object} descuento  { monto, sobreEnvio } del cupón, si hay
 */
export function totalesDe(items = [], descuento = null) {
  let subtotal = 0;
  let comision = 0;

  for (const it of items) {
    const qty = Number(it.quantity) || 0;
    if (qty <= 0) continue;
    const linea = Number(it.price || 0) * qty;
    subtotal += linea;
    // La comisión va sobre el precio de lista, antes de cualquier descuento:
    // el profesional gana lo mismo aplique o no el paciente un cupón. El
    // descuento lo pone Vitahub, no él.
    comision += linea * Number(it.commission_percent || 0) / 100;
  }

  const hayEnvio = items.some(i => Number(i.quantity) > unidadesEnMano(i));
  const envio    = calcularEnvio(subtotal, hayEnvio);

  // Un cupón de envío gratis descuenta exactamente lo que costaba el envío: si
  // el envío cambió de precio desde que se aplicó, el descuento lo sigue.
  const monto = descuento?.sobreEnvio
    ? envio
    : Math.min(Number(descuento?.monto || 0), subtotal);

  const redondo = (n) => Number(Number(n).toFixed(2));

  return {
    subtotal:  redondo(subtotal),
    envio:     redondo(envio),
    descuento: redondo(monto),
    total:     redondo(Math.max(0, subtotal + envio - monto)),
    comision:  redondo(comision),
  };
}
