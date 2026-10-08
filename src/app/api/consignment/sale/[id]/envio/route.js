import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { tarifasDeEnvio } from '@/lib/envioShopify'
import { ESTADOS_MX } from '@/lib/estadosMx'
import { validarDescuento } from '@/lib/descuentoShopify'
import { totalesDe } from '@/lib/totalesVenta'
import { unidadesEnMano, hayEnvio } from '@/lib/envio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// Sin sesión, como el resto del cobro: lo usa el paciente desde su enlace.
async function ventaPendiente(id) {
  const { data } = await supabase.from('local_orders').select('*').eq('id', id).maybeSingle()
  if (!data) return { error: 'Venta no encontrada', status: 404 }
  if (data.estado !== 'pendiente') return { error: 'La venta ya no se puede modificar', status: 400 }
  return { venta: data }
}

// Para cotizar se manda el pedido COMPLETO, también lo que se entrega en el consultorio:
// el envío gratis se mide sobre todo el carrito, y un pedido que supera el mínimo va
// gratis aunque lo que viaje sea poco. (Las tarifas son fijas por zona, no por peso.)
function lineasQueViajan(venta) {
  return (venta.items || [])
    .filter(i => Number(i.quantity) > 0)
    .map(i => ({ variantId: i.variant_id, quantity: Number(i.quantity) }))
}

function direccionValida(d = {}) {
  return Boolean(d.calle?.trim() && /^\d{5}$/.test(String(d.cp || '').trim()) && d.ciudad?.trim() && ESTADOS_MX.includes(d.estado))
}

/**
 * POST /api/consignment/sale/[id]/envio  → { direccion }
 *   →  { ok, hayEnvio, opciones: [{ handle, titulo, precio, expres }] }
 *
 * Las formas de recibir el pedido para esa dirección, con las tarifas que tiene
 * Shopify (envío estándar, nacional, DHL…). No guarda nada: solo consulta.
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params
    const { direccion } = await req.json().catch(() => ({}))

    const { venta, error: err, status } = await ventaPendiente(id)
    if (err) return NextResponse.json({ ok: false, error: err }, { status })

    if (!hayEnvio(venta.items || [])) return NextResponse.json({ ok: true, hayEnvio: false, opciones: [] })
    if (!direccionValida(direccion)) {
      return NextResponse.json({ ok: false, error: 'Completa tu dirección: calle, código postal de 5 dígitos, ciudad y estado' }, { status: 400 })
    }

    const opciones = await tarifasDeEnvio({ lineas: lineasQueViajan(venta), direccion })
    if (!opciones.length) {
      return NextResponse.json({ ok: false, error: 'Por ahora no tenemos envío disponible para esa dirección. Revisa el código postal y el estado.' }, { status: 422 })
    }
    return NextResponse.json({ ok: true, hayEnvio: true, opciones })
  } catch (err) {
    console.error('[cobro envio]', err?.message)
    return NextResponse.json({ ok: false, error: 'No pudimos consultar las tarifas de envío. Intenta de nuevo en un momento.' }, { status: 502 })
  }
}

/**
 * PATCH /api/consignment/sale/[id]/envio  → { direccion, handle }
 *
 * El paciente elige una de las opciones. El precio NO viene del navegador: se
 * vuelve a consultar a Shopify y se busca la opción por su identificador. Si ya no
 * existe (cambió una tarifa mientras decidía) se le avisa en vez de aplicar otra.
 */
export async function PATCH(req, { params }) {
  try {
    const { id } = await params
    const { direccion, handle } = await req.json().catch(() => ({}))

    const { venta, error: err, status } = await ventaPendiente(id)
    if (err) return NextResponse.json({ ok: false, error: err }, { status })
    if (!hayEnvio(venta.items || [])) return NextResponse.json({ ok: false, error: 'Este pedido no lleva envío' }, { status: 400 })
    if (!direccionValida(direccion)) return NextResponse.json({ ok: false, error: 'Completa tu dirección' }, { status: 400 })

    const opciones = await tarifasDeEnvio({ lineas: lineasQueViajan(venta), direccion })
    const elegida = opciones.find(o => o.handle === handle)
    if (!elegida) {
      return NextResponse.json({ ok: false, cambio: true, opciones, error: 'Esa opción de envío ya no está disponible. Elige de nuevo.' }, { status: 409 })
    }

    const tarifa = { handle: elegida.handle, titulo: elegida.titulo, precio: elegida.precio, expres: elegida.expres }

    // Un código de envío gratis depende del costo del envío: se vuelve a validar
    // ahora que ya se sabe cuánto es.
    let descuento = null, codigo = venta.descuento_codigo || null, priceRule = venta.descuento_price_rule_id || null
    if (codigo) {
      const base = totalesDe(venta.items || [], null, tarifa)
      const r = await validarDescuento(codigo, { subtotal: base.subtotal, envio: base.envio })
      if (r.ok) descuento = { monto: r.monto, sobreEnvio: r.sobreEnvio }
      else { codigo = null; priceRule = null }
    }

    const { data, error } = await supabase
      .from('local_orders')
      .update({
        ...totalesDe(venta.items || [], descuento, tarifa),
        envio_tarifa:            tarifa,
        descuento_codigo:        codigo,
        descuento_price_rule_id: priceRule,
        updated_at:              new Date().toISOString(),
      })
      .eq('id', id)
      .eq('estado', 'pendiente')
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, venta: data, descuento_caido: Boolean(venta.descuento_codigo && !codigo) })
  } catch (err) {
    console.error('[cobro envio elegir]', err?.message)
    return NextResponse.json({ ok: false, error: 'No pudimos guardar tu opción de envío. Intenta de nuevo.' }, { status: 502 })
  }
}
