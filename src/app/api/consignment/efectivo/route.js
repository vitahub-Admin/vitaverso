import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveCustomerId } from '@/lib/customerAppAuth'
import { fetchVariantInfo } from '@/lib/shopifyPrices'
import {
  modoTester, stockTester, registrarEfectivoTester, efectivoDe as efectivoDeTester,
} from '@/lib/consignacionTester'
import {
  efectivoHabilitado, registrarVentaEfectivo, efectivoDe, resumenEfectivo,
} from '@/lib/ventasEfectivo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const noDisponible = () =>
  NextResponse.json({ ok: false, error: 'El cobro en efectivo todavía no está disponible' }, { status: 404 })

/**
 * GET /api/consignment/efectivo — lo que el profesional cobró en efectivo y aún no paga.
 *   ?resumen=1  solo los totales (lo usa el punto rojo del menú; es una consulta liviana)
 *
 * Tres modos: el sandbox local (memoria del servidor), y el real, solo para los profesionales
 * con el cobro habilitado (todo profesional con consignación, más las listas COBRO_EFECTIVO_REAL / COBRO_EFECTIVO_FANTASMA).
 */
export async function GET(req) {
  const sesion = await resolveCustomerId(req)
  if (modoTester()) {
    if (!sesion) return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 })
    return NextResponse.json({ ok: true, sandbox: true, ...efectivoDeTester(sesion) })
  }
  if (!sesion) return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 })
  if (!(await efectivoHabilitado(supabase, sesion))) return noDisponible()

  if (new URL(req.url).searchParams.get('resumen')) {
    return NextResponse.json({ ok: true, ...(await resumenEfectivo(supabase, sesion)) })
  }
  return NextResponse.json({ ok: true, ...(await efectivoDe(supabase, sesion)) })
}

/**
 * POST /api/consignment/efectivo
 * body: { items: [{ variant_id, quantity }], patient_name?, patient_phone?, patient_email?, dosis_map?, protocolo? }
 *
 * Registra que el profesional cobró en efectivo esos productos, que salen de su consultorio.
 * Precios y comisiones se vuelven a pedir aquí: no se aceptan montos del navegador.
 */
export async function POST(req) {
  try {
    const sesion = await resolveCustomerId(req)
    if (!sesion) return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 })
    if (!modoTester() && !(await efectivoHabilitado(supabase, sesion))) return noDisponible()

    const body  = await req.json()
    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length) return NextResponse.json({ ok: false, error: 'Sin productos' }, { status: 400 })

    const correo = String(body.patient_email || '').trim().toLowerCase()
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) {
      return NextResponse.json({ ok: false, error: 'El correo del paciente no es válido' }, { status: 400 })
    }

    // ── Modo real ──
    if (!modoTester()) {
      const r = await registrarVentaEfectivo(supabase, {
        ownerId: sesion,
        items,
        patient_name:  body.patient_name || null,
        patient_phone: body.patient_phone || null,
        patient_email: correo || null,
        dosis_map:     body.dosis_map || {},
        protocolo:     body.protocolo || null,
      })
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 })
      return NextResponse.json({ ok: true, venta: r.venta, ...(await efectivoDe(supabase, sesion)) }, { status: 201 })
    }

    // ── Sandbox local (memoria) ──
    const variantIds = items.map(i => Number(i.variant_id)).filter(Boolean)
    const { items: stock } = await stockTester(supabase, sesion)
    const saldo = Object.fromEntries(stock.map(s => [String(s.variant_id), s]))
    for (const it of items) {
      const pedido = Number(it.quantity) || 1
      const s = saldo[String(it.variant_id)]
      if (!s || s.disponible < pedido) {
        return NextResponse.json({
          ok: false,
          error: `No tienes ${pedido} de "${s?.title || it.variant_id}" en tu consultorio (hay ${s?.disponible ?? 0})`,
        }, { status: 400 })
      }
    }

    const [infoShopify, { data: comisiones }, { data: catalogo }] = await Promise.all([
      fetchVariantInfo(variantIds),
      supabase.from('product_variant_commissions')
        .select('variant_id, commission_percent').in('variant_id', variantIds).eq('active', true),
      supabase.from('product_catalog')
        .select('variant_id, product_id, title, variant_title, sku').in('variant_id', variantIds),
    ])
    const pct = Object.fromEntries((comisiones || []).map(c => [String(c.variant_id), Number(c.commission_percent)]))
    const cat = Object.fromEntries((catalogo || []).map(c => [String(c.variant_id), c]))

    const lineas = items.map(it => {
      const vid  = String(it.variant_id)
      const shop = infoShopify[vid] || {}
      const c    = cat[vid] || {}
      return {
        variant_id: Number(it.variant_id),
        title: c.title ?? shop.title ?? null,
        variant_title: c.variant_title ?? shop.variant_title ?? null,
        sku: c.sku ?? null,
        image: shop.image ?? null,
        quantity: Number(it.quantity) || 1,
        price: Number(shop.price ?? 0),
        commission_percent: pct[vid] ?? 0,
      }
    })
    if (lineas.some(l => l.price <= 0)) {
      return NextResponse.json({ ok: false, error: 'No se pudo obtener el precio de un producto' }, { status: 502 })
    }

    const venta = registrarEfectivoTester({
      ownerId: sesion,
      patient_name: body.patient_name || null,
      patient_phone: body.patient_phone || null,
      patient_email: correo || null,
      items: lineas,
    })
    return NextResponse.json({ ok: true, sandbox: true, venta, ...efectivoDeTester(sesion) }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
