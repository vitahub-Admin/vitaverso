import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { confirmarVenta } from '@/lib/ventaConsultorio'
import { pasarelaActiva } from '@/lib/pasarelaPago'

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
      .select('id, owner_id, patient_name, items, subtotal, total, estado, payment_provider, payment_fee, payment_neto, paid_at, created_at')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ ok: false, error: 'Venta no encontrada' }, { status: 404 })

    // El nombre del profesional, para que el paciente sepa a quién le paga
    const { data: af } = await supabase
      .from('affiliates')
      .select('first_name, last_name')
      .eq('shopify_customer_id', data.owner_id)
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      venta: {
        ...data,
        profesional: af ? `${af.first_name || ''} ${af.last_name || ''}`.trim() : null,
      },
      pasarela: pasarelaActiva(),
      simulado: pasarelaActiva() === 'mock',
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
    if (pasarelaActiva() !== 'mock') {
      return NextResponse.json(
        { ok: false, error: 'El pago lo confirma la pasarela, no esta ruta' },
        { status: 403 }
      )
    }

    const { id } = await params
    const { accion } = await req.json().catch(() => ({}))

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

    const r = await confirmarVenta(supabase, id, { payment_id: `mock_${Date.now()}` })
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 })

    return NextResponse.json({ ok: true, venta: r.order })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
