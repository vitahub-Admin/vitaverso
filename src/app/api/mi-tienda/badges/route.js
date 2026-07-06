import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

export async function GET() {
  const cookieStore = cookies()
  const customerId = cookieStore.get('customerId')?.value
  if (!customerId) return Response.json({ error: 'no auth' }, { status: 401 })

  const { data: earned, error: e1 } = await supabase
    .from('affiliate_badges')
    .select('badge_slug, earned_at, meta')
    .eq('customer_id', Number(customerId))

  if (e1) return Response.json({ error: e1.message }, { status: 500 })
  if (!earned?.length) return Response.json({ badges: [] })

  const slugs = earned.map(b => b.badge_slug)

  const { data: defs, error: e2 } = await supabase
    .from('badge_definitions')
    .select('slug, nombre, descripcion, image_url, hito, orden, level_slug')
    .in('slug', slugs)

  if (e2) return Response.json({ error: e2.message }, { status: 500 })

  const levelSlugs = [...new Set(defs.map(d => d.level_slug))]

  const { data: levels, error: e3 } = await supabase
    .from('badge_levels')
    .select('slug, nombre, color, orden')
    .in('slug', levelSlugs)

  if (e3) return Response.json({ error: e3.message }, { status: 500 })

  const levelMap = Object.fromEntries(levels.map(l => [l.slug, l]))
  const defMap   = Object.fromEntries(defs.map(d => [d.slug, { ...d, badge_levels: levelMap[d.level_slug] }]))

  const badges = earned.map(b => ({
    earned_at: b.earned_at,
    meta:      b.meta,
    badge_definitions: defMap[b.badge_slug],
  }))

  return Response.json({ badges })
}
