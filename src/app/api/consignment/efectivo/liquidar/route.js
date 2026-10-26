import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveCustomerId } from '@/lib/customerAppAuth'
import { totalesDe } from '@/lib/totalesVenta'
import { modoTester, iniciarLiquidacionTester, efectivoDe as efectivoDeTester } from '@/lib/consignacionTester'
import { efectivoHabilitado, iniciarLiquidacion, efectivoDe } from '@/lib/ventasEfectivo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

/**
 * POST /api/consignment/efectivo/liquidar
 *
 * Arma el pago de todo el efectivo acumulado: una venta de consultorio con todos los productos, que se
 * paga por el checkout de Shopify. Al confirmarse ese pago se cierran las ventas: baja el inventario,
 * se mueve BaseLinker y se acredita la comisión.
 *
 * En el sandbox local el "checkout" es una venta en memoria que se paga con el simulador.
 */
export async function POST(req) {
  const sesion = await resolveCustomerId(req)
  if (!sesion) return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 })

  if (modoTester()) {
    const checkout = iniciarLiquidacionTester(sesion, totalesDe)
    if (!checkout) return NextResponse.json({ ok: false, error: 'No tienes efectivo por liquidar' }, { status: 400 })
    return NextResponse.json({
      ok: true, sandbox: true, payment_url: `/cobro/${checkout.id}`, total: checkout.total, ...efectivoDeTester(sesion),
    })
  }

  if (!efectivoHabilitado(sesion)) {
    return NextResponse.json({ ok: false, error: 'El cobro en efectivo todavía no está disponible' }, { status: 404 })
  }
  const r = await iniciarLiquidacion(supabase, sesion)
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 })
  return NextResponse.json({
    ok: true, payment_url: r.payment_url, total: r.total, ...(await efectivoDe(supabase, sesion)),
  })
}
