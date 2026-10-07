/**
 * Venta de consultorio: cerrar el cobro y mover el stock en consignación.
 *
 * El único camino que descuenta stock es el pago confirmado. Si esto se
 * pudiera llamar antes de que entre el dinero, se podría vaciar el consultorio
 * de un profesional sin que nadie haya pagado nada.
 */

import { unidadesEnMano } from './envio';
import { vencerCupon } from './descuentoShopify';
import { marcarCuponUsado } from './storeCredit';

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
  let items = [...enMano.values()];

  // 1. Verificar que el stock siga estando. Entre que se armó el cobro y que
  //    el paciente pagó pudo venderse en otra consulta.
  const { data: saldos } = await supabase
    .from('consignment_stock')
    .select('variant_id, disponible, vendido')
    .eq('owner_id', venta.owner_id)
    .in('variant_id', items.map(i => i.variant_id));

  const saldoPorVariante = Object.fromEntries((saldos || []).map(s => [String(s.variant_id), s]));

  // Con un pago que ya entró (Shopify) no se puede rechazar la venta por falta
  // de stock: el paciente pagó y su dinero está en la cuenta. Se registra la
  // venta, se descuenta lo que haya y queda el aviso para resolverlo a mano.
  const yaCobrado = Boolean(datosPago.pagoYaCobrado);

  for (const it of items) {
    const saldo = saldoPorVariante[String(it.variant_id)];
    const hay   = Number(saldo?.disponible ?? 0);
    if (hay >= it.quantity) continue;

    if (!yaCobrado) {
      return {
        ok: false,
        error: `Sin stock suficiente de "${it.title}" (hay ${hay}, se vendieron ${it.quantity})`,
      };
    }
    console.error(`[venta consultorio] PAGO COBRADO SIN STOCK: venta ${venta.id}, "${it.title}" — había ${hay}, se vendieron ${it.quantity}. Revisar a mano.`);
    it.quantity = Math.max(0, hay);
  }
  items = items.filter(it => it.quantity > 0);

  // 2. Cerrar la venta ANTES de mover nada. Este update es el candado: si dos
  //    procesos confirman el mismo pago a la vez, solo uno se lleva la fila y
  //    el otro sale sin descontar stock ni pagar la comisión dos veces.
  //
  //    El fee de Shopify no viene en la orden, así que queda sin registrar en
  //    lugar de estimado; el del simulador sí se estima.
  const esShopify = datosPago.proveedor === 'shopify'
  const { fee, neto } = esShopify
    ? { fee: null, neto: null }
    : datosPago.fee != null
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
      ...(esShopify ? { payment_provider: 'shopify' } : {}),
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
  //
  //    En pruebas se cobra un monto chico sin importar el total del pedido; la
  //    comisión se acredita en la misma proporción para que el wallet (que es
  //    retirable) nunca reciba más de lo que entró de verdad.
  const cobrado = cerrada.monto_cobrado != null ? Number(cerrada.monto_cobrado) : null
  const escala  = cobrado != null && Number(cerrada.total) > 0
    ? Math.min(1, cobrado / Number(cerrada.total))
    : 1
  const puntos  = Number((Number(cerrada.comision) * escala).toFixed(2))

  if (puntos > 0) {
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
        points:         puntos,
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
          ...(escala < 1 ? { monto_cobrado: cobrado, escala: Number(escala.toFixed(4)) } : {}),
          breakdown,
        },
      }])

    // La venta ya está cobrada y el stock descontado: si falla la comisión no
    // se revierte nada, se deja rastro para repararlo a mano.
    if (txErr) console.error('[venta consultorio] no se pudo acreditar la comisión:', txErr.message)
  }

  // 5. Gastar el cupón, si hubo.
  //    La orden nunca pasa por Shopify, así que su contador de usos no sube
  //    solo: sin esto, un cupón de un solo uso se podría volver a gastar en la
  //    tienda. En una venta simulada no se toca nada — el cobro no fue real y
  //    el cupón tiene que seguir sirviendo.
  if (cerrada.descuento_codigo && !datosPago.simulado) {
    await marcarCuponUsado(supabase, cerrada.descuento_codigo, {
      usedAt:    cerrada.paid_at,
      orderName: `Consultorio ${String(cerrada.id).slice(0, 8)}`,
    });

    // vencerCupon decide sola: solo toca los de un uso.
    await vencerCupon(cerrada.descuento_price_rule_id);
  }

  return { ok: true, order: cerrada };
}
