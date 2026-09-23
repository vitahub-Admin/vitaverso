import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveCustomerId } from '@/lib/customerAppAuth'
import { esAdmin } from '@/lib/adminIds'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const ESTADOS = ['borrador', 'plantilla']

/**
 * GET /api/protocols
 *   ?owner_id=123          → protocolos de ese profesional (solo él o un admin)
 *   ?status=borrador       → filtra por estado (borrador | plantilla)
 *   sin owner_id           → todos, solo para administradores
 */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const ownerId  = searchParams.get('owner_id')
    const status   = searchParams.get('status')
    const sesion   = await resolveCustomerId(req)
    const admin    = esAdmin(sesion)

    if (status && !ESTADOS.includes(status)) {
      return NextResponse.json({ ok: false, error: 'Estado inválido' }, { status: 400 })
    }
    if (!ownerId && !admin) {
      return NextResponse.json({ ok: false, error: 'Falta owner_id' }, { status: 400 })
    }
    if (ownerId && !admin && String(sesion) !== String(ownerId)) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 403 })
    }

    let query = supabase
      .from('protocols')
      .select('id, name, description, owner_id, is_public, status, components, created_at, updated_at')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (ownerId) query = query.eq('owner_id', ownerId)
    if (status)  query = query.eq('status', status)

    const { data: protocols, error } = await query
    if (error) throw error

    // Vista admin: agregar el nombre del profesional dueño
    let enriched = protocols || []
    if (!ownerId && enriched.length > 0) {
      const ownerIds = [...new Set(enriched.map(p => p.owner_id).filter(Boolean))]
      if (ownerIds.length > 0) {
        const { data: affiliates } = await supabase
          .from('affiliates')
          .select('shopify_customer_id, first_name, last_name')
          .in('shopify_customer_id', ownerIds)

        const nameMap = Object.fromEntries(
          (affiliates || []).map(a => [
            String(a.shopify_customer_id),
            `${a.first_name || ''} ${a.last_name || ''}`.trim() || null,
          ])
        )
        enriched = enriched.map(p => ({
          ...p,
          owner_name: p.owner_id ? (nameMap[String(p.owner_id)] || null) : null,
        }))
      }
    }

    return NextResponse.json({ ok: true, protocols: enriched })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/protocols → crea un protocolo del profesional en sesión.
 * body: { name, description?, components, status?: 'borrador' | 'plantilla' }
 * El dueño sale de la sesión, no del body: nadie crea protocolos a nombre de otro.
 */
export async function POST(req) {
  try {
    const body   = await req.json()
    const sesion = await resolveCustomerId(req)
    const admin  = esAdmin(sesion)
    const { name, description, components, status = 'plantilla', is_public } = body

    const ownerId = admin && body.owner_id ? body.owner_id : sesion
    if (!ownerId) {
      return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 })
    }
    if (!ESTADOS.includes(status)) {
      return NextResponse.json({ ok: false, error: 'Estado inválido' }, { status: 400 })
    }
    // Un borrador puede no tener nombre todavía; una plantilla siempre lo lleva
    if (status === 'plantilla' && !name?.trim()) {
      return NextResponse.json({ ok: false, error: 'Nombre requerido' }, { status: 400 })
    }
    if (!components?.length) {
      return NextResponse.json({ ok: false, error: 'Al menos un producto requerido' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('protocols')
      .insert({
        name:        name?.trim() || nombreAutomatico(),
        description: description || null,
        owner_id:    String(ownerId),
        is_public:   admin ? !!is_public : false,
        status,
        components,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, protocol: data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// "Borrador · 23 sep 14:30"
function nombreAutomatico() {
  const f = new Date().toLocaleString('es-MX', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  })
  return `Borrador · ${f.replace(',', '')}`
}
