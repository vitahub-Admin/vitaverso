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
 * Trae el protocolo y verifica que quien pide sea su dueño (o un admin).
 * Devuelve { protocolo } o { respuesta } con el error listo para retornar.
 */
async function protocoloPropio(req, id, permitirEjemplo = false) {
  const sesion = await resolveCustomerId(req)
  if (!sesion) {
    return { respuesta: NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 }) }
  }

  const { data, error } = await supabase
    .from('protocols')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error || !data) {
    return { respuesta: NextResponse.json({ ok: false, error: 'No encontrado' }, { status: 404 }) }
  }
  // Los ejemplos se pueden abrir para usarlos, pero no editar: al guardarlos
  // desde el armador se crea una copia con el profesional como dueño.
  if (permitirEjemplo && data.is_public) return { protocolo: data }
  if (!esAdmin(sesion) && String(data.owner_id) !== String(sesion)) {
    // Mismo mensaje que "no existe": no se revela qué protocolos tienen otros
    return { respuesta: NextResponse.json({ ok: false, error: 'No encontrado' }, { status: 404 }) }
  }
  return { protocolo: data }
}

export async function GET(req, { params }) {
  try {
    const { id } = await params
    const { protocolo, respuesta } = await protocoloPropio(req, id, true)
    if (respuesta) return respuesta
    return NextResponse.json({ ok: true, protocol: protocolo })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

/**
 * PATCH → actualiza nombre, descripción, componentes o estado.
 * Sirve también para convertir un borrador en plantilla: { status: 'plantilla', name }
 */
export async function PATCH(req, { params }) {
  try {
    const { id } = await params
    const { respuesta } = await protocoloPropio(req, id)
    if (respuesta) return respuesta

    const body = await req.json()
    const cambios = { updated_at: new Date().toISOString() }

    if (body.name !== undefined)        cambios.name = String(body.name).trim()
    if (body.description !== undefined) cambios.description = body.description || null
    if (body.components !== undefined)  cambios.components = body.components
    if (body.status !== undefined) {
      if (!ESTADOS.includes(body.status)) {
        return NextResponse.json({ ok: false, error: 'Estado inválido' }, { status: 400 })
      }
      cambios.status = body.status
    }
    if (cambios.status === 'plantilla' && cambios.name === '') {
      return NextResponse.json({ ok: false, error: 'Nombre requerido' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('protocols')
      .update(cambios)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, protocol: data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

/**
 * DELETE → borra el protocolo propio.
 *
 * Si es un ejemplo (is_public de otro dueño) no se borra: se registra que este
 * profesional no quiere verlo más. Para él desaparece; para el resto sigue ahí.
 */
export async function DELETE(req, { params }) {
  try {
    const { id } = await params
    const sesion = await resolveCustomerId(req)
    if (!sesion) {
      return NextResponse.json({ ok: false, error: 'Sin sesión' }, { status: 401 })
    }

    const { data: protocolo } = await supabase
      .from('protocols')
      .select('id, owner_id, is_public')
      .eq('id', id)
      .maybeSingle()

    if (!protocolo) {
      return NextResponse.json({ ok: false, error: 'No encontrado' }, { status: 404 })
    }

    const esPropio = String(protocolo.owner_id) === String(sesion)

    if (!esPropio) {
      if (!protocolo.is_public) {
        // Mismo mensaje que "no existe": no se revela qué tienen otros
        return NextResponse.json({ ok: false, error: 'No encontrado' }, { status: 404 })
      }
      const { error } = await supabase
        .from('protocol_hidden')
        .upsert({ owner_id: String(sesion), protocol_id: id }, { onConflict: 'owner_id,protocol_id' })
      if (error) throw error
      return NextResponse.json({ ok: true, oculto: true })
    }

    const { error } = await supabase.from('protocols').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
