import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveCustomerId } from '@/lib/customerAppAuth'
import { moverStockConsultorios } from '@/lib/baselinker'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// Un paquete grande recorre BaseLinker producto por producto: se le da margen
export const maxDuration = 60

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
    let datos = {}
    if (ids.length) {
      const { data: afs } = await supabase
        .from('affiliates')
        .select('shopify_customer_id, first_name, last_name, email')
        .in('shopify_customer_id', ids)
      nombres = Object.fromEntries((afs || []).map(a => [
        String(a.shopify_customer_id),
        `${a.first_name || ''} ${a.last_name || ''}`.trim() || String(a.shopify_customer_id),
      ]))
      datos = Object.fromEntries((afs || []).map(a => [String(a.shopify_customer_id), a]))
    }

    return NextResponse.json({
      ok: true,
      items: items.map(i => ({
        ...i,
        owner_name: nombres[String(i.owner_id)] || null,
        owner_first_name: datos[String(i.owner_id)]?.first_name || null,
        owner_last_name:  datos[String(i.owner_id)]?.last_name || null,
        owner_email:      datos[String(i.owner_id)]?.email || null,
      })),
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

    // Paquete: varios productos en un solo movimiento
    if (Array.isArray(body.lineas)) return await registrarPaquete(body, sesion)

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
      .select('product_id, title, variant_title, sku')
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

    // El libro ya quedó bien; el almacén Consultorios de BaseLinker se mueve igual. Si
    // BaseLinker falla no se revierte nada: se avisa para corregirlo a mano. El ajuste
    // no se refleja allá a propósito (puede ser un conteo, no un movimiento físico).
    let baselinker = null
    if (tipo === 'entrega' || tipo === 'devolucion') {
      baselinker = await moverStockConsultorios(
        tipo,
        [{ product_id: prod.product_id, sku: prod.sku, cantidad }],
        `${motivo || 'sin motivo'} · profesional ${ownerId}`,
      )
    }

    return NextResponse.json({ ok: true, stock: guardado, baselinker })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

/**
 * body: { owner_id, tipo, motivo?, lineas: [{ variant_id, cantidad }] }
 *
 * Todo el paquete se valida antes de escribir nada: si una línea no se puede (una
 * devolución de más, una variante que no existe), no se guarda ninguna. Después se
 * escribe el libro línea por línea y BaseLinker recibe UN solo documento con todo.
 */
async function registrarPaquete(body, sesion) {
  const ownerId = String(body.owner_id || '').trim()
  const tipo    = String(body.tipo || '').trim()
  const motivo  = (body.motivo || '').trim() || null

  if (!ownerId) return NextResponse.json({ ok: false, error: 'Falta el profesional' }, { status: 400 })
  if (!['entrega', 'devolucion', 'ajuste'].includes(tipo)) {
    return NextResponse.json({ ok: false, error: 'Tipo inválido' }, { status: 400 })
  }

  // Las líneas repetidas de un mismo producto se suman
  const porVariante = new Map()
  for (const l of body.lineas) {
    const v = Number(l.variant_id)
    const c = Number(l.cantidad)
    if (!v || !Number.isFinite(c) || c === 0) {
      return NextResponse.json({ ok: false, error: 'Hay una línea sin producto o con cantidad inválida' }, { status: 400 })
    }
    if (c < 0 && tipo !== 'ajuste') {
      return NextResponse.json({ ok: false, error: 'Solo el ajuste puede ser negativo' }, { status: 400 })
    }
    porVariante.set(v, (porVariante.get(v) || 0) + c)
  }
  if (!porVariante.size) return NextResponse.json({ ok: false, error: 'El paquete está vacío' }, { status: 400 })
  if (porVariante.size > 60) return NextResponse.json({ ok: false, error: 'Máximo 60 productos por paquete' }, { status: 400 })

  const ids = [...porVariante.keys()]

  const { data: catalogo } = await supabase
    .from('product_catalog')
    .select('variant_id, product_id, title, variant_title, sku')
    .in('variant_id', ids)
  const prodDe = Object.fromEntries((catalogo || []).map(p => [p.variant_id, p]))
  const sinCatalogo = ids.filter(id => !prodDe[id])
  if (sinCatalogo.length) {
    return NextResponse.json({ ok: false, error: `Variantes que no están en el catálogo: ${sinCatalogo.join(', ')}` }, { status: 404 })
  }

  const { data: actuales } = await supabase
    .from('consignment_stock')
    .select('id, variant_id, entregado, vendido, devuelto, ajuste, disponible')
    .eq('owner_id', ownerId)
    .in('variant_id', ids)
  const actualDe = Object.fromEntries((actuales || []).map(a => [a.variant_id, a]))

  // Validar todo antes de escribir
  for (const id of ids) {
    const cantidad = porVariante.get(id)
    const disp = actualDe[id]?.disponible ?? 0
    const nombre = `${prodDe[id].sku || id} (${prodDe[id].variant_title || prodDe[id].title})`
    if (tipo === 'devolucion' && cantidad > disp) {
      return NextResponse.json({ ok: false, error: `${nombre}: solo tiene ${disp} disponibles` }, { status: 400 })
    }
    if (tipo === 'ajuste' && disp + cantidad < 0) {
      return NextResponse.json({ ok: false, error: `${nombre}: el ajuste dejaría el saldo en negativo (hay ${disp})` }, { status: 400 })
    }
  }

  const columna = COLUMNA[tipo]
  const guardadas = []
  for (const id of ids) {
    const cantidad = porVariante.get(id)
    const prod = prodDe[id]
    const base = actualDe[id] || { entregado: 0, vendido: 0, devuelto: 0, ajuste: 0 }

    const { data: guardado, error: upErr } = await supabase
      .from('consignment_stock')
      .upsert({
        ...(actualDe[id]?.id ? { id: actualDe[id].id } : {}),
        owner_id:      ownerId,
        variant_id:    id,
        product_id:    prod.product_id,
        title:         prod.title,
        variant_title: prod.variant_title,
        entregado:     base.entregado,
        vendido:       base.vendido,
        devuelto:      base.devuelto,
        ajuste:        base.ajuste,
        [columna]:     Number(base[columna] || 0) + cantidad,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'owner_id,variant_id' })
      .select()
      .single()
    if (upErr) return falloParcial(upErr.message, guardadas)

    const { error: movErr } = await supabase
      .from('consignment_movements')
      .insert([{ owner_id: ownerId, variant_id: id, tipo, cantidad, motivo, creado_por: sesion || null }])
    if (movErr) return falloParcial(movErr.message, guardadas)

    guardadas.push({ variant_id: id, sku: prod.sku, cantidad, disponible: guardado.disponible })
  }

  // Un solo documento en BaseLinker con todo el paquete. El ajuste no se refleja allá.
  let baselinker = null
  if (tipo === 'entrega' || tipo === 'devolucion') {
    baselinker = await moverStockConsultorios(
      tipo,
      ids.map(id => ({ product_id: prodDe[id].product_id, sku: prodDe[id].sku, cantidad: porVariante.get(id) })),
      `${motivo || 'sin motivo'} · profesional ${ownerId} · paquete de ${ids.length}`,
    )
  }

  return NextResponse.json({ ok: true, items: guardadas, baselinker })
}

function falloParcial(mensaje, guardadas) {
  return NextResponse.json({
    ok: false,
    error: `Se interrumpió a la mitad: ${mensaje}. Ya quedaron guardadas ${guardadas.length} líneas (${guardadas.map(g => g.sku || g.variant_id).join(', ') || 'ninguna'}); revisa antes de reintentar.`,
    guardadas,
  }, { status: 500 })
}
