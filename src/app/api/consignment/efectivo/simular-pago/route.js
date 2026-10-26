import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveCustomerId } from '@/lib/customerAppAuth'
import { confirmarVenta } from '@/lib/ventaConsultorio'
import { esFantasma, efectivoDe } from '@/lib/ventasEfectivo'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

/**
 * POST /api/consignment/efectivo/simular-pago
 *
 * SOLO para los profesionales "fantasma" (pruebas del equipo). Cierra la liquidación sin pasar por
 * Shopify, para poder ver el final del recorrido —ventas pagadas y protocolo por correo a cada
 * paciente— sin que nadie pague de verdad.
 *
 * No toca nada físico ni financiero: el libro y BaseLinker no se mueven (confirmarVenta lo omite para
 * un fantasma) y la comisión se acredita en cero porque no se cobró dinero.
 */
export async function POST(req) {
  try {
    const sesion = await resolveCustomerId(req)
    if (!sesion) return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 })
    if (!esFantasma(sesion)) {
      return NextResponse.json({ ok: false, error: 'Esto solo existe para las pruebas del equipo' }, { status: 403 })
    }

    const { data: liq } = await supabase.from('liquidaciones_efectivo')
      .select('id, local_order_id').eq('owner_id', Number(sesion)).eq('estado', 'pendiente')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!liq?.local_order_id) {
      return NextResponse.json({ ok: false, error: 'Primero genera el pago con "Pagar"' }, { status: 400 })
    }

    // Cobrado en cero: sin dinero real no se acredita comisión (el wallet se puede retirar)
    await supabase.from('local_orders').update({ monto_cobrado: 0 }).eq('id', liq.local_order_id).eq('estado', 'pendiente')

    const r = await confirmarVenta(supabase, liq.local_order_id, {
      payment_id: `fantasma_${Date.now()}`,
      simulado:   true,
    })
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 })

    return NextResponse.json({ ok: true, ...(await efectivoDe(supabase, sesion)) })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
