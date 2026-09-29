import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveCustomerId } from '@/lib/customerAppAuth'
import { esAdmin } from '@/lib/adminIds'
import { sePuedeCobrar } from '@/lib/pasarelaPago'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

/**
 * GET /api/consignment?owner_id=123
 * Lo que el profesional tiene físicamente en su consultorio.
 *
 * Lo consume el armador para marcar "En tu consultorio · N" y para saber qué
 * parte de un protocolo se puede cerrar ahí mismo en vez de mandarlo a enviar.
 * Solo se ve el stock propio; un admin puede ver el de cualquiera.
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const sesion  = await resolveCustomerId(req)
    const admin   = esAdmin(sesion)
    const ownerId = searchParams.get('owner_id') || (sesion ? String(sesion) : null)

    if (!ownerId) {
      return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 })
    }
    if (!admin && String(sesion) !== String(ownerId)) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('consignment_stock')
      .select('variant_id, product_id, title, variant_title, entregado, vendido, devuelto, ajuste, disponible, updated_at')
      .eq('owner_id', ownerId)
      .order('title')

    if (error) throw error

    const items = data || []
    // Mapa listo para el armador: variant_id → unidades disponibles
    const disponibles = {}
    for (const i of items) {
      if (i.disponible > 0) disponibles[String(i.variant_id)] = i.disponible
    }

    return NextResponse.json({
      ok: true,
      items,
      disponibles,
      total_unidades: items.reduce((a, i) => a + Math.max(0, i.disponible), 0),
      // Sin pasarela no tiene sentido ofrecer "Cobrar aquí": generaría una
      // venta que nadie puede pagar.
      puede_cobrar: sePuedeCobrar(),
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
