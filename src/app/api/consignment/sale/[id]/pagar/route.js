import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { pasarelaActiva, montoACobrar } from '@/lib/pasarelaPago'
import { crearBorrador, estadoBorrador, borrarBorrador } from '@/lib/cobroShopify'
import { confirmarVenta } from '@/lib/ventaConsultorio'
import { unidadesEnMano } from '@/lib/envio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/consignment/sale/[id]/pagar
 *   body: { email, nombre, direccion?: { calle, colonia, cp, ciudad, estado } }
 *   →     { ok, url }  el enlace de pago de Shopify, al que se manda al paciente
 *
 * Sin sesión, como el resto del cobro: lo usa el paciente desde su enlace.
 *
 * El total NO viene del navegador. La venta ya tiene sus totales calculados en
 * el servidor (precios vivos, descuento, envío); acá solo se decide cuánto de
 * eso se cobra y se arma el borrador.
 */
export async function POST(req, { params }) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const { data: venta } = await supabase
      .from('local_orders').select('*').eq('id', id).maybeSingle()

    if (!venta) return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 })
    if (venta.estado !== 'pendiente') {
      return NextResponse.json({ ok: false, error: 'Esta venta ya no se puede pagar' }, { status: 400 })
    }
    if (pasarelaActiva(venta.owner_id) !== 'shopify') {
      return NextResponse.json({ ok: false, error: 'El cobro por Shopify no está habilitado' }, { status: 403 })
    }

    // ── Datos del paciente ──────────────────────────────────────────────────
    const email  = String(body.email || '').trim().toLowerCase()
    const nombre = String(body.nombre || '').trim()
    if (!EMAIL.test(email)) {
      return NextResponse.json({ ok: false, error: 'Escribe un correo válido' }, { status: 400 })
    }
    if (!nombre) {
      return NextResponse.json({ ok: false, error: 'Escribe tu nombre' }, { status: 400 })
    }

    const activos  = (venta.items || []).filter(i => Number(i.quantity) > 0)
    if (!activos.length) {
      return NextResponse.json({ ok: false, error: 'El pedido está vacío' }, { status: 400 })
    }

    // Con envío hace falta a dónde mandarlo: el operario no puede despachar sin dirección
    const hayEnvio = activos.some(i => Number(i.quantity) > unidadesEnMano(i))
    const d = body.direccion || {}
    if (hayEnvio && !(d.calle?.trim() && d.cp?.trim() && d.ciudad?.trim() && d.estado?.trim())) {
      return NextResponse.json(
        { ok: false, error: 'Completa la dirección de envío: calle, código postal, ciudad y estado' },
        { status: 400 }
      )
    }

    // ── Un borrador anterior ────────────────────────────────────────────────
    // Si el paciente ya lo pagó y el aviso de Shopify todavía no llegó, crear
    // otro borrador le cobraría dos veces. Antes de armar uno nuevo se mira.
    if (venta.shopify_draft_id) {
      const previo = await estadoBorrador(venta.shopify_draft_id).catch(() => null)

      if (previo?.status === 'COMPLETED') {
        const r = await confirmarVenta(supabase, venta.id, {
          payment_id:     `shopify_${previo.orderId}`,
          proveedor:      'shopify',
          pagoYaCobrado:  true,
        })
        return NextResponse.json({ ok: r.ok, pagado: true, error: r.ok ? undefined : r.error })
      }
      // Sigue abierto: se descarta, el pedido pudo haber cambiado desde entonces
      if (previo) await borrarBorrador(venta.shopify_draft_id)
    }

    // ── Quién arma el protocolo ─────────────────────────────────────────────
    const { data: af } = await supabase
      .from('affiliates')
      .select('first_name, last_name')
      .eq('shopify_customer_id', venta.owner_id)
      .maybeSingle()
    const profesional = [af?.first_name, af?.last_name].filter(Boolean).join(' ')

    const monto = montoACobrar(venta.owner_id, venta.total)

    const borrador = await crearBorrador({
      ventaId:    venta.id,
      profesional,
      monto,
      email,
      nombre,
      direccion:  hayEnvio ? d : null,
    })

    await supabase
      .from('local_orders')
      .update({
        shopify_draft_id: borrador.id,
        monto_cobrado:    monto,
        payment_provider: 'shopify',
        patient_email:    email,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', venta.id)
      .eq('estado', 'pendiente')

    return NextResponse.json({ ok: true, url: borrador.invoiceUrl, monto })
  } catch (err) {
    console.error('[cobro pagar]', err?.message)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
