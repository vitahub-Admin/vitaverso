import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { pasarelaActiva, montoACobrar } from '@/lib/pasarelaPago'
import { crearBorrador, estadoBorrador, borrarBorrador } from '@/lib/cobroShopify'
import { confirmarVenta } from '@/lib/ventaConsultorio'
import { unidadesEnMano } from '@/lib/envio'
import { fetchVariantInfo } from '@/lib/shopifyPrices'
import { validarDescuento } from '@/lib/descuentoShopify'
import { totalesDe } from '@/lib/totalesVenta'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/consignment/sale/[id]/pagar
 *   body: { email?, nombre?, direccion?: { calle, colonia, cp, ciudad, estado } }
 *   →     { ok, url }  el enlace de pago de Shopify, al que se manda al paciente
 *
 * Sin sesión, como el resto del cobro: lo usa el paciente desde su enlace.
 *
 * El total NO viene del navegador. Pero tampoco se confía en el que quedó guardado
 * cuando se armó el pedido: el paciente puede abrir su enlace días después y los
 * precios de Shopify cambian (en una semana se movieron 305). Se recalcula con el
 * precio y el stock de AHORA; si el total ya no es el que vio, se le avisa y se
 * actualiza la página en vez de cobrarle otra cosa.
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
    // Nombre y correo ya no se piden aquí: el paciente los escribe en el checkout
    // de Shopify y el webhook de pago los guarda. Si llegan, se usan.
    const emailIn = String(body.email || '').trim().toLowerCase()
    const email   = EMAIL.test(emailIn) ? emailIn : undefined
    const nombre  = String(body.nombre || '').trim() || undefined

    const activos  = (venta.items || []).filter(i => Number(i.quantity) > 0)
    if (!activos.length) {
      return NextResponse.json({ ok: false, error: 'El pedido está vacío' }, { status: 400 })
    }

    // El envío lo cotiza y lo cobra el checkout de Shopify (dirección, tarifa, entrega
    // local, DHL): aquí no se pide ni se calcula nada de eso.
    const hayEnvio = activos.some(i => Number(i.quantity) > unidadesEnMano(i))

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

    // ── Precios y existencias de ahora ──────────────────────────────────────
    const info = await fetchVariantInfo(activos.map(i => Number(i.variant_id)))
    const items = (venta.items || []).map(it => ({
      ...it,
      price: Number(info[String(it.variant_id)]?.price ?? it.price),
    }))

    // Lo que viaja es producto real en Shopify: con política DENY, Shopify bloquea
    // el pago si no hay existencias. Mejor decirlo acá, antes de que el paciente
    // llegue a su checkout y se encuentre con un error.
    const sinStock = items
      .filter(it => Number(it.quantity) > 0)
      .filter(it => {
        const aEnviar = Number(it.quantity) - unidadesEnMano(it)
        const v = info[String(it.variant_id)]
        return aEnviar > 0 && v?.politica === 'DENY' && v.stock != null && v.stock < aEnviar
      })
      .map(it => it.title)
    if (sinStock.length) {
      return NextResponse.json({
        ok: false, sinStock: true,
        error: `Ya no hay existencias suficientes para enviar: ${sinStock.join(', ')}. Ajusta las cantidades de tu pedido.`,
      }, { status: 409 })
    }

    const tarifa = null

    // El cupón también se revalida: pudo agotarse o vencer desde que se aplicó
    let descuento = null
    let codigo    = venta.descuento_codigo || null
    let priceRule = venta.descuento_price_rule_id || null
    if (codigo) {
      const base = totalesDe(items, null, tarifa)
      const r = await validarDescuento(codigo, { subtotal: base.subtotal, envio: 0 })
      if (r.ok) descuento = { monto: r.monto, sobreEnvio: r.sobreEnvio }
      else { codigo = null; priceRule = null }
    }

    const nuevos = totalesDe(items, descuento, tarifa)
    const cuponCaido = Boolean(venta.descuento_codigo && !codigo)
    const cambioTotal = Math.abs(nuevos.total - Number(venta.total)) > 0.009 || cuponCaido

    if (cambioTotal || items.some((it, k) => it.price !== Number(venta.items[k]?.price))) {
      await supabase.from('local_orders')
        .update({ items, ...nuevos, envio_tarifa: tarifa, descuento_codigo: codigo, descuento_price_rule_id: priceRule, updated_at: new Date().toISOString() })
        .eq('id', venta.id).eq('estado', 'pendiente')
    }
    if (cambioTotal) {
      return NextResponse.json({
        ok: false, cambio: true,
        error: cuponCaido
          ? 'Tu código de descuento dejó de aplicar y el total cambió. Revisa el pedido antes de pagar.'
          : 'Los precios se actualizaron y el total cambió. Revisa el pedido antes de pagar.',
      }, { status: 409 })
    }

    // ── Quién arma el protocolo ─────────────────────────────────────────────
    const { data: af } = await supabase
      .from('affiliates')
      .select('first_name, last_name')
      .eq('shopify_customer_id', venta.owner_id)
      .maybeSingle()
    const profesional = [af?.first_name, af?.last_name].filter(Boolean).join(' ')

    const monto = montoACobrar(venta.owner_id, nuevos.total)

    // Qué se envía (producto real) y qué se entrega en el consultorio (línea libre
    // con su título y su valor).
    const lineas = items.filter(i => Number(i.quantity) > 0).map(i => {
      const mano = unidadesEnMano(i)
      return {
        variantId: i.variant_id,
        titulo:    [i.title, i.variant_title].filter(Boolean).join(' · '),
        sku:       i.sku,
        precio:    i.price,
        enviar:    Number(i.quantity) - mano,
        mano,
      }
    })

    // Lo que se le descuenta al paciente en total: el cupón y, en pruebas, lo que
    // falta para llegar al monto fijo de prueba. Por eso sale de restar, y no de
    // sumar piezas: así el borrador siempre cuadra con lo que se va a cobrar.
    const aDescontar = nuevos.subtotal + nuevos.envio - monto
    const partes = []
    if (codigo) partes.push(`Código ${codigo}`)
    if (monto < nuevos.total - 0.009) partes.push('ajuste de prueba')

    const borrador = await crearBorrador({
      ventaId:    venta.id,
      profesional,
      monto,
      email,
      nombre,
      lineas,
      costoEnvio: nuevos.envio,
      descuento:  { monto: aDescontar, titulo: partes.join(' + ') || 'Descuento' },
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
