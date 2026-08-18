import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// GET /api/protocols → lista de protocolos públicos + los del owner_id si se pasa
// POST /api/protocols → crear protocolo

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const ownerId = searchParams.get('owner_id')

    let query = supabase
      .from('protocols')
      .select('id, name, description, owner_id, is_public, components, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (ownerId) {
      // Afiliado: ve públicos + los suyos
      query = query.or(`is_public.eq.true,owner_id.eq.${ownerId}`)
    }
    // Sin owner_id = vista admin → devuelve todos sin filtro

    const { data: protocols, error } = await query
    if (error) throw error

    // Vista admin (sin owner_id) → enriquecer con nombre del profesional
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

export async function POST(req) {
  try {
    const body = await req.json()
    const { name, description, owner_id, is_public, components } = body

    if (!name?.trim()) {
      return NextResponse.json({ ok: false, error: 'Nombre requerido' }, { status: 400 })
    }
    if (!components?.length) {
      return NextResponse.json({ ok: false, error: 'Al menos un componente requerido' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('protocols')
      .insert({ name: name.trim(), description: description || null, owner_id: owner_id || null, is_public: !!is_public, components })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, protocol: data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
