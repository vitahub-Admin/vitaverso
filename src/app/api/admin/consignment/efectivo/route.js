import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { modoTester, efectivoPendienteDeTodos } from '@/lib/consignacionTester'
import { deudoresEfectivo } from '@/lib/ventasEfectivo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

/**
 * GET /api/admin/consignment/efectivo
 * Qué profesionales tienen efectivo cobrado en consultorio sin pagar, cuánto y desde cuándo.
 * El proxy ya exigió sesión de administrador para todo /api/admin.
 *
 * Lee las ventas en efectivo reales (o las del sandbox local, en modo tester). Si nadie debe nada,
 * responde vacío y el panel no se muestra.
 */
export async function GET() {
  try {
    const lista = modoTester() ? efectivoPendienteDeTodos() : await deudoresEfectivo(supabase)
    const ids = lista.map(l => Number(l.owner_id))
    let nombres = {}
    if (ids.length) {
      const { data } = await supabase
        .from('affiliates')
        .select('shopify_customer_id, first_name, last_name, email')
        .in('shopify_customer_id', ids)
      nombres = Object.fromEntries((data || []).map(a => [String(a.shopify_customer_id), a]))
    }

    const deudores = lista.map(l => {
      const a = nombres[String(l.owner_id)]
      return {
        ...l,
        first_name: a?.first_name || '',
        last_name: a?.last_name || '',
        email: a?.email || null,
      }
    })
    return NextResponse.json({
      ok: true,
      deudores,
      total: Math.round(deudores.reduce((s, d) => s + d.a_pagar, 0) * 100) / 100,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
