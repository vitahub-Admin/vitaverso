import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { confirmarVenta } from '@/lib/ventaConsultorio'
import { pasarelaActiva } from '@/lib/pasarelaPago'
import { fetchVariantInfo } from '@/lib/shopifyPrices'
import { unidadesSeparadas } from '@/lib/envio'
import { validarDescuento } from '@/lib/descuentoShopify'
import { totalesDe } from '@/lib/totalesVenta'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)



/**
 * GET /api/consignment/sale/[id]
 * Estado de una venta. Sin sesión: la abre el paciente desde el link de pago,
 * que no tiene cuenta. El ID es un uuid, así que no se adivina.
 */
export async function GET(_req, { params }) {
  try {
    const { id } = await params
    const { data, error } = await supabase
      .from('local_orders')
      .select('id, owner_id, patient_name, items, subtotal, envio, descuento, descuento_codigo, total, estado, payment_provider, payment_fee, payment_neto, paid_at, created_at')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 })

    // El nombre del profesional, para que el paciente sepa a quién le paga
    const { data: af } = await supabase
      .from('affiliates')
      .select('first_name, last_name, shopify_collection_id')
      .eq('shopify_customer_id', data.owner_id)
      .maybeSingle()

    // La foto del profesional vive en la imagen de su colección de Shopify: es
    // el único lugar donde la cargan. Solo ~1 de cada 4 la tiene, así que el
    // checkout cae a las iniciales cuando no está.
    let foto = null
    if (af?.shopify_collection_id) {
      try {
        const r = await fetch(
          `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN },
            body: JSON.stringify({
              query: `{ node(id: "gid://shopify/Collection/${af.shopify_collection_id}") { ... on Collection { image { url } } } }`,
            }),
          }
        )
        const j = await r.json()
        foto = j?.data?.node?.image?.url || null
      } catch {}
    }

    return NextResponse.json({
      ok: true,
      venta: {
        ...data,
        profesional: af ? `${af.first_name || ''} ${af.last_name || ''}`.trim() : null,
        profesional_foto: foto,
      },
      pasarela: pasarelaActiva(data.owner_id),
      simulado: pasarelaActiva(data.owner_id) === 'mock',
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

/**
 * PATCH /api/consignment/sale/[id]  → { cantidades: { <variant_id>: n } }
 *
 * El paciente ajusta cantidades antes de pagar. Solo puede mover lo que el
 * profesional le prescribió: no se agregan productos nuevos desde acá.
 *
 * Los totales se rehacen enteros en el servidor con el precio vivo. Nunca se
 * acepta un total del navegador: sería decirle al comprador cuánto quiere pagar.
 *
 * Las unidades extra siempre se envían. La consignación cubre lo que el
 * profesional decidió entregar en mano; si el paciente lleva más, eso sale del
 * depósito central.
 */
export async function PATCH(req, { params }) {
  try {
    const { id } = await params
    const { cantidades } = await req.json().catch(() => ({}))
    if (!cantidades || typeof cantidades !== 'object') {
      return NextResponse.json({ ok: false, error: 'Sin cantidades' }, { status: 400 })
    }

    const { data: venta } = await supabase
      .from('local_orders').select('*').eq('id', id).maybeSingle()

    if (!venta) return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 })
    if (venta.estado !== 'pendiente') {
      return NextResponse.json({ ok: false, error: 'La venta ya no se puede modificar' }, { status: 400 })
    }

    const variantIds = (venta.items || []).map(i => Number(i.variant_id))
    const precios = await fetchVariantInfo(variantIds)

    const items = []

    for (const it of venta.items || []) {
      const pedida = Math.max(0, Math.floor(Number(cantidades[String(it.variant_id)] ?? it.quantity)))
      const precio = Number(precios[String(it.variant_id)]?.price ?? it.price ?? 0)

      // `mano_qty` no se recalcula: son las unidades que el profesional separó
      // en su consultorio y eso no depende de lo que pida el paciente. Cuánto
      // se le entrega en mano sale del mínimo entre las dos, al momento de usarlo.
      // Lo que el paciente saca del pedido queda en cero, no se borra: es parte
      // del protocolo que le armaron y tiene que poder volver a agregarlo.
      items.push({ ...it, quantity: pedida, mano_qty: unidadesSeparadas(it), price: precio })
    }

    if (!items.some(i => i.quantity > 0)) {
      return NextResponse.json({ ok: false, error: 'El pedido no puede quedar vacío' }, { status: 400 })
    }

    // Si había un cupón, hay que volver a validarlo contra el pedido nuevo: un
    // cupón con mínimo de compra tiene que caerse solo cuando el paciente baja
    // el pedido por debajo de ese mínimo. Sin esto, alcanzaba con aplicarlo
    // caro y después sacar productos.
    let descuento = null
    let codigo    = venta.descuento_codigo || null
    let priceRule = venta.descuento_price_rule_id || null

    if (codigo) {
      const base = totalesDe(items)
      const r = await validarDescuento(codigo, { subtotal: base.subtotal, envio: base.envio })
      if (r.ok) descuento = { monto: r.monto, sobreEnvio: r.sobreEnvio }
      else { codigo = null; priceRule = null }   // dejó de aplicar
    }

    const { data: actualizada, error } = await supabase
      .from('local_orders')
      .update({
        items,
        ...totalesDe(items, descuento),
        descuento_codigo:        codigo,
        descuento_price_rule_id: priceRule,
        updated_at:              new Date().toISOString(),
      })
      .eq('id', id)
      .eq('estado', 'pendiente')
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({
      ok: true,
      venta: actualizada,
      // Para avisarle al paciente por qué le desapareció el descuento
      descuento_caido: Boolean(venta.descuento_codigo && !codigo),
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/consignment/sale/[id]  → { accion: 'pagar' | 'cancelar' }
 *
 * SIMULADOR. Existe solo mientras no haya pasarela real: reemplaza al webhook
 * de Stripe para poder recorrer el flujo completo. Cuando `STRIPE_SECRET_KEY`
 * exista, esta ruta deja de aceptar pagos y el único que puede confirmar es
 * el webhook, que verifica la firma.
 */
export async function POST(req, { params }) {
  try {
    // Solo el simulador de desarrollo entra por acá. Con Stripe configurado el
    // pago lo confirma su webhook, que verifica la firma; y en producción sin
    // Stripe no hay manera de marcar una venta como pagada.
    const { id } = await params
    const { accion, email } = await req.json().catch(() => ({}))

    // El simulador vive por venta: depende del profesional que la generó, no de
    // quién abre la página — el que paga es el paciente y no tiene sesión.
    const { data: duena } = await supabase
      .from('local_orders').select('owner_id').eq('id', id).maybeSingle()

    if (pasarelaActiva(duena?.owner_id) !== 'mock') {
      return NextResponse.json(
        { ok: false, error: 'El pago lo confirma la pasarela, no esta ruta' },
        { status: 403 }
      )
    }

    if (accion === 'cancelar') {
      const { data, error } = await supabase
        .from('local_orders')
        .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('estado', 'pendiente')
        .select()
        .maybeSingle()

      if (error) throw error
      return NextResponse.json({ ok: true, venta: data })
    }

    // El correo es lo único que se guarda del formulario: con él se le manda la
    // compra y las indicaciones de toma. Los datos de tarjeta no llegan acá ni
    // deben llegar — eso lo recibe la pasarela, nunca nuestro servidor.
    if (email) {
      await supabase.from('local_orders')
        .update({ patient_email: String(email).trim().toLowerCase() })
        .eq('id', id)
    }

    // `simulado` evita que un pago de mentira gaste un cupón de verdad.
    const r = await confirmarVenta(supabase, id, {
      payment_id: `mock_${Date.now()}`,
      simulado:   true,
    })
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 })

    return NextResponse.json({ ok: true, venta: r.order })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
