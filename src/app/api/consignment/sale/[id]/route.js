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
      pasarela: pasarelaActiva(data.owner_id),
      simulado: pasarelaActiva(data.owner_id) === 'mock',
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

    const r = await confirmarVenta(supabase, id, { payment_id: `mock_${Date.now()}` })
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 })

    return NextResponse.json({ ok: true, venta: r.order })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
