import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validarDescuento } from '@/lib/descuentoShopify'
import { totalesDe } from '@/lib/totalesVenta'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// Sin sesión a propósito: lo usa el paciente desde el link de pago. El id es un
// uuid y la venta tiene que estar pendiente, así que lo único que se puede
// hacer sin el link es nada.
async function ventaPendiente(id) {
  const { data } = await supabase
    .from('local_orders').select('*').eq('id', id).maybeSingle()
  if (!data) return { error: 'Venta no encontrada', status: 404 }
  if (data.estado !== 'pendiente') {
    return { error: 'La venta ya no se puede modificar', status: 400 }
  }
  return { venta: data }
}

/**
 * POST /api/consignment/sale/[id]/descuento  → { codigo }
 *
 * Aplica un código de Shopify al cobro. El monto lo decide el servidor leyendo
 * el price rule: el navegador manda el código y nada más.
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params
    const { codigo } = await req.json().catch(() => ({}))

    const { venta, error: err, status } = await ventaPendiente(id)
    if (err) return NextResponse.json({ ok: false, error: err }, { status })

    // Se valida contra los totales SIN descuento: los mínimos de compra miran
    // lo que vale el pedido, no lo que quedaría después de descontar.
    const base = totalesDe(venta.items || [])
    const r = await validarDescuento(codigo, { subtotal: base.subtotal, envio: base.envio })
    if (!r.ok) return NextResponse.json({ ok: false, error: r.motivo }, { status: 400 })

    const totales = totalesDe(venta.items || [], { monto: r.monto, sobreEnvio: r.sobreEnvio })

    const { data, error } = await supabase
      .from('local_orders')
      .update({
        ...totales,
        descuento_codigo:        r.codigo,
        descuento_price_rule_id: r.priceRuleId,
        updated_at:              new Date().toISOString(),
      })
      .eq('id', id)
      .eq('estado', 'pendiente')
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, venta: data, sobreEnvio: !!r.sobreEnvio })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

/**
 * DELETE /api/consignment/sale/[id]/descuento — quita el código aplicado.
 */
export async function DELETE(_req, { params }) {
  try {
    const { id } = await params

    const { venta, error: err, status } = await ventaPendiente(id)
    if (err) return NextResponse.json({ ok: false, error: err }, { status })

    const { data, error } = await supabase
      .from('local_orders')
      .update({
        ...totalesDe(venta.items || []),
        descuento_codigo:        null,
        descuento_price_rule_id: null,
        updated_at:              new Date().toISOString(),
      })
      .eq('id', id)
      .eq('estado', 'pendiente')
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, venta: data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
