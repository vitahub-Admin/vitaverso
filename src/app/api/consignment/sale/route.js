import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveCustomerId } from '@/lib/customerAppAuth'
import { fetchVariantPrices } from '@/lib/shopifyPrices'
import { pasarelaActiva } from '@/lib/pasarelaPago'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// Envío: gratis a partir del umbral, precio fijo debajo. Son las mismas reglas
// de la tienda; si se vuelven más finas (por zona o peso), este es el lugar.
// Solo se cobra si hay algo que enviar: si el profesional entrega todo en mano,
// el envío no existe.
const ENVIO_GRATIS_DESDE = 600
const ENVIO_COSTO        = 99

function calcularEnvio(subtotal, hayEnvio) {
  if (!hayEnvio) return 0
  return subtotal >= ENVIO_GRATIS_DESDE ? 0 : ENVIO_COSTO
}

/**
 * POST /api/consignment/sale
 * Arma el cobro de la parte del protocolo que el profesional entrega en mano.
 *
 * body: { items: [{ variant_id, quantity }], patient_name?, patient_phone?, sharecart_token? }
 *
 * Los precios y las comisiones NO se toman del navegador: se vuelven a pedir
 * a Shopify y a la tabla de comisiones, y quedan congelados en la venta. Si
 * mañana cambia el precio o el porcentaje, esta venta sigue diciendo lo que
 * de verdad se cobró y lo que de verdad se le pagó al profesional.
 */
export async function POST(req) {
  try {
    const sesion = await resolveCustomerId(req)
    if (!sesion) return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 })

    const body  = await req.json()
    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length) {
      return NextResponse.json({ ok: false, error: 'Sin productos' }, { status: 400 })
    }

    const ownerId    = String(sesion)
    const variantIds = items.map(i => Number(i.variant_id)).filter(Boolean)

    // 1. Qué sale del consultorio y qué se envía.
    //    Lo que el profesional tiene en consignación se entrega en mano; el
    //    resto viaja desde el CEDIS. El paciente paga todo junto: un cobro, un
    //    comprobante.
    const { data: saldos } = await supabase
      .from('consignment_stock')
      .select('variant_id, product_id, title, variant_title, disponible')
      .eq('owner_id', ownerId)
      .in('variant_id', variantIds)

    const porVariante = Object.fromEntries((saldos || []).map(s => [String(s.variant_id), s]))

    for (const it of items) {
      const pedido = Number(it.quantity) || 1
      const saldo  = porVariante[String(it.variant_id)]
      // Solo se valida contra la consignación lo que se va a entregar en mano.
      // Lo demás lo valida el stock general al armar el envío.
      if (it.entrega === 'mano' && (!saldo || saldo.disponible < pedido)) {
        return NextResponse.json({
          ok: false,
          error: `No tienes ${pedido} de "${saldo?.title || it.variant_id}" en tu consultorio (hay ${saldo?.disponible ?? 0})`,
        }, { status: 400 })
      }
    }

    // 2. Precio vivo de Shopify y comisión vigente, congelados en la venta
    const [precios, { data: comisiones }, { data: catalogo }] = await Promise.all([
      fetchVariantPrices(variantIds),
      supabase
        .from('product_variant_commissions')
        .select('variant_id, commission_percent')
        .in('variant_id', variantIds)
        .eq('active', true),
      supabase
        .from('product_catalog')
        .select('variant_id, product_id, title, variant_title, sku')
        .in('variant_id', variantIds),
    ])

    const pctPorVariante = Object.fromEntries(
      (comisiones || []).map(c => [String(c.variant_id), Number(c.commission_percent)])
    )
    const delCatalogo = Object.fromEntries((catalogo || []).map(c => [String(c.variant_id), c]))

    let subtotal = 0
    let comision = 0
    const itemsVenta = items.map(it => {
      const vid    = String(it.variant_id)
      // Los datos del producto salen de la consignación si está ahí; si no, del
      // catálogo. Así una línea enviada tiene el mismo detalle que una local.
      const info   = porVariante[vid] || delCatalogo[vid] || {}
      const qty    = Number(it.quantity) || 1
      const precio = Number(precios[vid] ?? 0)
      const pct    = pctPorVariante[vid] ?? 0
      const linea  = precio * qty

      subtotal += linea
      comision += linea * pct / 100

      return {
        variant_id:        Number(it.variant_id),
        product_id:        info.product_id ?? null,
        title:             info.title ?? null,
        variant_title:     info.variant_title ?? null,
        sku:               info.sku ?? null,
        quantity:          qty,
        price:             precio,
        commission_percent: pct,
        // Define de qué depósito sale en BaseLinker y si hay que prepararlo
        entrega:           it.entrega === 'mano' ? 'mano' : 'envio',
      }
    })

    if (subtotal <= 0) {
      return NextResponse.json({ ok: false, error: 'No se pudo obtener el precio' }, { status: 502 })
    }

    // El envío se cobra sobre el subtotal del protocolo completo, no solo
    // sobre lo que se envía: el paciente compró una vez.
    const hayEnvio = itemsVenta.some(i => i.entrega === 'envio')
    const envio    = calcularEnvio(subtotal, hayEnvio)

    const { data: venta, error } = await supabase
      .from('local_orders')
      .insert([{
        owner_id:        ownerId,
        sharecart_token: body.sharecart_token || null,
        patient_name:    body.patient_name || null,
        patient_phone:   body.patient_phone || null,
        items:           itemsVenta,
        subtotal:        Number(subtotal.toFixed(2)),
        envio:           envio,
        total:           Number((subtotal + envio).toFixed(2)),
        comision:        Number(comision.toFixed(2)),
        estado:          'pendiente',
        payment_provider: pasarelaActiva(ownerId),
      }])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      ok: true,
      venta,
      // Dónde paga el paciente. Con Stripe será la URL de la sesión de pago.
      payment_url: `/cobro/${venta.id}`,
      simulado: pasarelaActiva(ownerId) === 'mock',
    }, { status: 201 })

  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

/**
 * GET /api/consignment/sale — las ventas de consultorio del profesional
 */
export async function GET(req) {
  try {
    const sesion = await resolveCustomerId(req)
    if (!sesion) return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const estado = searchParams.get('estado')

    let query = supabase
      .from('local_orders')
      .select('*')
      .eq('owner_id', String(sesion))
      .order('created_at', { ascending: false })
      .limit(50)

    if (estado) query = query.eq('estado', estado)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json({ ok: true, ventas: data || [] })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
