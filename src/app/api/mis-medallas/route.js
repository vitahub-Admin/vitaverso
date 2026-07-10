import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

export async function GET() {
  const cookieStore = await cookies()
  const customerId = cookieStore.get('customerId')?.value
  if (!customerId) return Response.json({ error: 'no auth' }, { status: 401 })

  const { data: allDefs, error: e1 } = await supabase
    .from('badge_definitions')
    .select('slug, nombre, descripcion, image_url, hito, orden, grupo, level_slug')
    .eq('activo', true)
    .order('orden')

  if (e1) return Response.json({ error: e1.message }, { status: 500 })

  const levelSlugs = [...new Set(allDefs.map(d => d.level_slug))]
  const { data: levels, error: e2 } = await supabase
    .from('badge_levels')
    .select('slug, nombre, color, orden')
    .in('slug', levelSlugs)

  if (e2) return Response.json({ error: e2.message }, { status: 500 })

  const levelMap = Object.fromEntries(levels.map(l => [l.slug, l]))
  const defs = allDefs.map(d => ({ ...d, level: levelMap[d.level_slug] }))

  const { data: earned, error: e3 } = await supabase
    .from('affiliate_badges')
    .select('badge_slug, earned_at')
    .eq('customer_id', Number(customerId))

  if (e3) return Response.json({ error: e3.message }, { status: 500 })

  const earnedMap = Object.fromEntries((earned || []).map(e => [e.badge_slug, e.earned_at]))

  // Agrupar por grupo
  const grupos = {}
  const singles = []

  for (const def of defs) {
    if (def.grupo) {
      if (!grupos[def.grupo]) grupos[def.grupo] = []
      grupos[def.grupo].push(def)
    } else {
      singles.push(def)
    }
  }

  const result = []

  // Badges de grupo → una card por grupo
  for (const tiers of Object.values(grupos)) {
    tiers.sort((a, b) => a.orden - b.orden)

    const earnedTiers = tiers.filter(t => earnedMap[t.slug])
    const highestEarned = earnedTiers.at(-1) || null
    const displayBadge = highestEarned || tiers[0]

    // Próximo tier después del alcanzado
    let proximo = null
    if (highestEarned) {
      const idx = tiers.findIndex(t => t.slug === highestEarned.slug)
      const next = tiers[idx + 1]
      if (next) proximo = { hito: next.hito, descripcion: next.descripcion }
    } else {
      proximo = { hito: tiers[0].hito, descripcion: tiers[0].descripcion }
    }

    result.push({
      tipo:      'grupo',
      badge:     displayBadge,
      ganado:    !!highestEarned,
      earned_at: highestEarned ? earnedMap[highestEarned.slug] : null,
      proximo,
    })
  }

  // Badges únicos
  for (const def of singles) {
    result.push({
      tipo:      'unico',
      badge:     def,
      ganado:    !!earnedMap[def.slug],
      earned_at: earnedMap[def.slug] || null,
    })
  }

  // Ganados primero
  result.sort((a, b) => (b.ganado ? 1 : 0) - (a.ganado ? 1 : 0))

  return Response.json({ badges: result })
}
