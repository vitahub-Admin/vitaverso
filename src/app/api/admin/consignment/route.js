import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveCustomerId } from '@/lib/customerAppAuth'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// Cómo pega cada movimiento en el saldo del profesional
const COLUMNA = {
  entrega:    'entregado',
  venta:      'vendido',
  devolucion: 'devuelto',
  ajuste:     'ajuste',
}

/**
 * GET /api/admin/consignment[?owner_id=123]
 * Todo lo que hay en consignación, con el nombre del profesional.
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const ownerId = searchParams.get('owner_id')

    let query = supabase
      .from('consignment_stock')
      .select('id, owner_id, variant_id, product_id, title, variant_title, entregado, vendido, devuelto, ajuste, disponible, updated_at')
      .order('owner_id')
    if (ownerId) query = query.eq('owner_id', ownerId)

    const { data, error } = await query
    if (error) throw error

    const items = data || []
    const ids = [...new Set(items.map(i => String(i.owner_id)))]
    let nombres = {}
    if (ids.length) {
      const { data: afs } = await supabase
        .from('affiliates')
        .select('shopify_customer_id, first_name, last_name')
        .in('shopify_customer_id', ids)
      nombres = Object.fromEntries((afs || []).map(a => [
        String(a.shopify_customer_id),
        `${a.first_name || ''} ${a.last_name || ''}`.trim() || String(a.shopify_customer_id),
      ]))
    }

    return NextResponse.json({
      ok: true,
      items: items.map(i => ({ ...i, owner_name: nombres[String(i.owner_id)] || null })),
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/admin/consignment
 * Registra un movimiento y actualiza el saldo.
 * body: { owner_id, variant_id, tipo, cantidad, motivo? }
 *
 * `tipo` es entrega | devolucion | ajuste. Las ventas no se cargan a mano:
 * las escribe el cobro cuando el pago se confirma, para que no haya forma de
 * descontar stock sin que haya entrado el dinero.
 */
export async function POST(req) {
  try {
    const sesion = await resolveCustomerId(req)   // el proxy ya validó que es admin
    const body   = await req.json()

    const ownerId   = String(body.owner_id || '').trim()
    const variantId = Number(body.variant_id)
    const tipo      = String(body.tipo || '').trim()
    const cantidad  = Number(body.cantidad)
    const motivo    = (body.motivo || '').trim() || null

    if (!ownerId || !variantId) {
      return NextResponse.json({ ok: false, error: 'Falta el profesional o la variante' }, { status: 400 })
    }
    if (!['entrega', 'devolucion', 'ajuste'].includes(tipo)) {
      return NextResponse.json({ ok: false, error: 'Tipo inválido' }, { status: 400 })
    }
    if (!Number.isFinite(cantidad) || cantidad === 0) {
      return NextResponse.json({ ok: false, error: 'Cantidad inválida' }, { status: 400 })
    }
    // Solo el ajuste puede ser negativo: una entrega o devolución en negativo
    // sería en realidad el movimiento contrario, y así queda mal el historial.
    if (cantidad < 0 && tipo !== 'ajuste') {
      return NextResponse.json({ ok: false, error: 'Solo el ajuste puede ser negativo' }, { status: 400 })
    }

    // Datos del producto, para mostrarlos sin joinear después
    const { data: prod } = await supabase
      .from('product_catalog')
      .select('product_id, title, variant_title')
      .eq('variant_id', variantId)
      .maybeSingle()

    if (!prod) {
      return NextResponse.json({ ok: false, error: 'Esa variante no está en el catálogo' }, { status: 404 })
    }

    const { data: actual } = await supabase
      .from('consignment_stock')
      .select('id, entregado, vendido, devuelto, ajuste, disponible')
      .eq('owner_id', ownerId)
      .eq('variant_id', variantId)
      .maybeSingle()

    const base = actual || { entregado: 0, vendido: 0, devuelto: 0, ajuste: 0, disponible: 0 }
    const columna = COLUMNA[tipo]
    const nuevo   = Number(base[columna] || 0) + cantidad

    // No se puede devolver ni descontar más de lo que hay en el consultorio
    if (tipo === 'devolucion' && cantidad > base.disponible) {
      return NextResponse.json(
        { ok: false, error: `Solo tiene ${base.disponible} disponibles` }, { status: 400 }
      )
    }
    if (tipo === 'ajuste' && base.disponible + cantidad < 0) {
      return NextResponse.json(
        { ok: false, error: `El ajuste dejaría el saldo en negativo (hay ${base.disponible})` }, { status: 400 }
      )
    }

    const { data: guardado, error: upErr } = await supabase
      .from('consignment_stock')
      .upsert({
        ...(actual?.id ? { id: actual.id } : {}),
        owner_id:      ownerId,
        variant_id:    variantId,
        product_id:    prod.product_id,
        title:         prod.title,
        variant_title: prod.variant_title,
        entregado:     base.entregado,
        vendido:       base.vendido,
        devuelto:      base.devuelto,
        ajuste:        base.ajuste,
        [columna]:     nuevo,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'owner_id,variant_id' })
      .select()
      .single()

    if (upErr) throw upErr

    const { error: movErr } = await supabase
      .from('consignment_movements')
      .insert([{
        owner_id:   ownerId,
        variant_id: variantId,
        tipo,
        cantidad,
        motivo,
        creado_por: sesion || null,
      }])

    if (movErr) throw movErr

    return NextResponse.json({ ok: true, stock: guardado })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
