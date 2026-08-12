import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

export async function GET(req, { params }) {
  try {
    const { id } = await params
    const { data, error } = await supabase
      .from('protocols')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return NextResponse.json({ ok: false, error: 'No encontrado' }, { status: 404 })
    return NextResponse.json({ ok: true, protocol: data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function PATCH(req, { params }) {
  try {
    const { id }  = await params
    const body    = await req.json()
    const { name, description, is_public, components } = body

    const { data, error } = await supabase
      .from('protocols')
      .update({ name, description, is_public, components, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, protocol: data })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req, { params }) {
  try {
    const { id } = await params
    const { error } = await supabase.from('protocols').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
