/**
 * Venta de consultorio: cerrar el cobro y mover el stock en consignación.
 *
 * El único camino que descuenta stock es el pago confirmado. Si esto se
 * pudiera llamar antes de que entre el dinero, se podría vaciar el consultorio
 * de un profesional sin que nadie haya pagado nada.
 */

import { unidadesEnMano } from './envio';

// Comisión de la pasarela, para ver el costo real de cada venta.
// El simulador imita la tarifa mexicana de tarjeta: porcentaje + fijo + IVA.
// Cuando entre Stripe, este número viene del balance_transaction y deja de
// estimarse.
const FEE_PCT   = 0.036;
const FEE_FIJO  = 3;
const IVA       = 0.16;

export function feeSimulado(total) {
  const bruto = Number(total) * FEE_PCT + FEE_FIJO;
  const fee   = Number((bruto * (1 + IVA)).toFixed(2));
  return { fee, neto: Number((Number(total) - fee).toFixed(2)) };
}

/**
 * Marca la venta como pagada, descuenta la consignación y deja el rastro.
 * Es idempotente por estado: si la venta ya no está pendiente, no hace nada.
 *
 * @returns {{ ok: boolean, error?: string, order?: object }}
 */
export async function confirmarVenta(supabase, ventaId, datosPago = {}) {
  const { data: venta, error } = await supabase
    .from('local_orders')
    .select('*')
    .eq('id', ventaId)
    .maybeSingle();

  if (error) throw error;
  if (!venta) return { ok: false, error: 'Venta no encontrada' };
  if (venta.estado === 'pagado') return { ok: true, order: venta };  // ya estaba
  if (venta.estado !== 'pendiente') {
    return { ok: false, error: `La venta está ${venta.estado}` };
  }

  // Solo lo entregado en mano sale de la consignación del profesional; lo que
  // se envía lo descuenta BaseLinker desde el depósito central. Se agrupa por
  // variante: una misma línea puede haberse partido en mano + envío, y dos
  // descuentos separados sobre el mismo saldo se pisarían entre sí.
  const enMano = new Map();
  for (const i of venta.items || []) {
    const mano = unidadesEnMano(i);
    if (mano <= 0) continue;
    const previo = enMano.get(i.variant_id);
    if (previo) previo.quantity += mano;
    else enMano.set(i.variant_id, { ...i, quantity: mano });
  }
  const items = [...enMano.values()];

  // 1. Verificar que el stock siga estando. Entre que se armó el cobro y que
  //    el paciente pagó pudo venderse en otra consulta.
  const { data: saldos } = await supabase
    .from('consignment_stock')
    .select('variant_id, disponible, vendido')
    .eq('owner_id', venta.owner_id)
    .in('variant_id', items.map(i => i.variant_id));

  const saldoPorVariante = Object.fromEntries((saldos || []).map(s => [String(s.variant_id), s]));

  for (const it of items) {
    const saldo = saldoPorVariante[String(it.variant_id)];
    if (!saldo || saldo.disponible < it.quantity) {
      return {
        ok: false,
        error: `Sin stock suficiente de "${it.title}" (hay ${saldo?.disponible ?? 0}, se vendieron ${it.quantity})`,
      };
    }
  }

  // 2. Cerrar la venta ANTES de mover nada. Este update es el candado: si dos
  //    procesos confirman el mismo pago a la vez, solo uno se lleva la fila y
  //    el otro sale sin descontar stock ni pagar la comisión dos veces.
  const { fee, neto } = datosPago.fee != null
    ? { fee: datosPago.fee, neto: Number((venta.total - datosPago.fee).toFixed(2)) }
    : feeSimulado(venta.total)

  const { data: cerrada, error: upErr } = await supabase
    .from('local_orders')
    .update({
      estado:       'pagado',
      paid_at:      new Date().toISOString(),
      payment_id:   datosPago.payment_id || `mock_${venta.id}`,
      payment_fee:  fee,
      payment_neto: neto,
      updated_at:   new Date().toISOString(),
    })
    .eq('id', venta.id)
    .eq('estado', 'pendiente')
    .select()
    .maybeSingle()

  if (upErr) throw upErr
  if (!cerrada) {
    // Otro proceso la cerró entre medio: ya está todo hecho
    const { data: yaCerrada } = await supabase
      .from('local_orders').select('*').eq('id', venta.id).maybeSingle()
    return { ok: true, order: yaCerrada }
  }

  // 3. Descontar y dejar el movimiento
  for (const it of items) {
    const saldo = saldoPorVariante[String(it.variant_id)];
    await supabase
      .from('consignment_stock')
      .update({ vendido: Number(saldo.vendido) + it.quantity, updated_at: new Date().toISOString() })
      .eq('owner_id', venta.owner_id)
      .eq('variant_id', it.variant_id);

    await supabase.from('consignment_movements').insert([{
      owner_id:       venta.owner_id,
      variant_id:     it.variant_id,
      tipo:           'venta',
      cantidad:       it.quantity,
      motivo:         `Venta en consultorio${venta.patient_name ? ` · ${venta.patient_name}` : ''}`,
      local_order_id: venta.id,
    }]);
  }

  // 4. Acreditarle la comisión, igual que una venta de Shopify.
  //    Mismo formato que el webhook de órdenes: una transacción IN de
  //    categoría "earning" con el desglose congelado. Así la ganancia de
  //    consultorio suma en el wallet, en ganancias y en analytics sin que
  //    haya que tratarla como un caso aparte.
  if (Number(cerrada.comision) > 0) {
    // El desglose va sobre TODAS las líneas vendidas, no solo las de mano: la
    // comisión se gana igual si el producto se entregó en consultorio o se
    // envió desde el depósito central.
    const breakdown = (cerrada.items || []).filter(it => it.quantity > 0).map(it => ({
      variant_id:         it.variant_id,
      quantity:           it.quantity,
      price:              it.price,
      subtotal:           Number((it.price * it.quantity).toFixed(2)),
      commission_percent: it.commission_percent,
      commission_line:    Number((it.price * it.quantity * it.commission_percent / 100).toFixed(2)),
    }))

    const { error: txErr } = await supabase
      .from('point_transactions')
      .insert([{
        customer_id:    venta.owner_id,
        points:         Number(cerrada.comision),
        direction:      'IN',
        category:       'earning',
        status:         'confirmed',
        reference_id:   String(venta.id),
        reference_type: 'local_order',
        description:    `Ganancia por venta en consultorio${venta.patient_name ? ` · ${venta.patient_name}` : ''}`,
        actor_type:     'system',
        metadata: {
          local_order_id: venta.id,
          origen:         'consultorio',
          patient_name:   venta.patient_name || null,
          total:          Number(cerrada.total),
          breakdown,
        },
      }])

    // La venta ya está cobrada y el stock descontado: si falla la comisión no
    // se revierte nada, se deja rastro para repararlo a mano.
    if (txErr) console.error('[venta consultorio] no se pudo acreditar la comisión:', txErr.message)
  }

  return { ok: true, order: cerrada };
}
