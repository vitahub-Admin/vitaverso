import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveCustomerId } from '@/lib/customerAppAuth'
import { esAdmin } from '@/lib/adminIds'
import { sePuedeCobrar } from '@/lib/pasarelaPago'
import { modoTester, stockTester } from '@/lib/consignacionTester'
import { esFantasma, efectivoHabilitado, reservadasDe } from '@/lib/ventasEfectivo'

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

    // Modo tester (solo local): stock de mentira, sin leer ni tocar el libro real
    if (modoTester()) {
      const t = await stockTester(supabase, ownerId)
      return NextResponse.json({
        ok: true, tester: true, efectivo: true, items: t.items, disponibles: t.disponibles,
        total_unidades: t.items.reduce((a, i) => a + i.disponible, 0),
        puede_cobrar: sePuedeCobrar(ownerId),
      })
    }

    // Profesional "fantasma" (pruebas del equipo): como si tuviera todo el catálogo en el consultorio,
    // sin límite. No se lee el libro; la pantalla trata cualquier producto como disponible.
    if (esFantasma(ownerId)) {
      return NextResponse.json({
        ok: true, efectivo: true, infinito: true, fantasma: true,
        items: [], disponibles: {}, total_unidades: 0,
        puede_cobrar: sePuedeCobrar(ownerId),
      })
    }

    const { data, error } = await supabase
      .from('consignment_stock')
      .select('variant_id, product_id, title, variant_title, entregado, vendido, devuelto, ajuste, disponible, updated_at')
      .eq('owner_id', ownerId)
      .order('title')

    if (error) throw error

    let items = data || []

    // Con el cobro en efectivo habilitado, lo cobrado y todavía sin pagar queda reservado: no cuenta
    // como disponible, aunque el libro no se toque hasta que el profesional pague.
    const conEfectivo = await efectivoHabilitado(supabase, ownerId)
    if (conEfectivo) {
      const reservadas = await reservadasDe(supabase, ownerId)
      items = items.map(i => {
        const reservado = Math.min(Math.max(0, i.disponible), reservadas[String(i.variant_id)] || 0)
        return { ...i, reservado, disponible: i.disponible - reservado }
      })
    }
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
      ...(conEfectivo ? { efectivo: true } : {}),
      // Sin pasarela no tiene sentido ofrecer "Cobrar aquí": generaría una
      // venta que nadie puede pagar.
      puede_cobrar: sePuedeCobrar(ownerId),
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
