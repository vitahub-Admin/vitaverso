import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

export async function GET() {
  // Total usuarios distintos con al menos 1 badge
  const { data: countData } = await supabase.rpc('count_badge_users')
  const totalUsuarios = countData || 0

  // Total badges asignadas
  const { count: totalBadges } = await supabase
    .from('affiliate_badges')
    .select('*', { count: 'exact', head: true })

  // Top 10 por cantidad de badges
  const { data: topRaw } = await supabase
    .rpc('top_badges_por_afiliado', { limite: 10 })

  const customerIds = topRaw?.map(r => r.customer_id) || []

  // Nombres de afiliados
  const { data: afiliados } = await supabase
    .from('affiliates')
    .select('shopify_customer_id, first_name, last_name')
    .in('shopify_customer_id', customerIds)

  const afilMap = Object.fromEntries(
    (afiliados || []).map(a => [a.shopify_customer_id, `${a.first_name || ''} ${a.last_name || ''}`.trim()])
  )

  // Badges de cada afiliado del top
  const { data: badgesRaw } = await supabase
    .from('affiliate_badges')
    .select('customer_id, badge_slug')
    .in('customer_id', customerIds)

  // Definiciones de badges
  const { data: defs } = await supabase
    .from('badge_definitions')
    .select('slug, nombre, level_slug')

  const { data: levels } = await supabase
    .from('badge_levels')
    .select('slug, color')

  const levelColorMap = Object.fromEntries((levels || []).map(l => [l.slug, l.color]))
  const defMap = Object.fromEntries((defs || []).map(d => [d.slug, { ...d, color: levelColorMap[d.level_slug] || '#94A3B8' }]))

  // Agrupar badges por customer
  const badgesByCustomer = {}
  for (const b of (badgesRaw || [])) {
    if (!badgesByCustomer[b.customer_id]) badgesByCustomer[b.customer_id] = []
    const def = defMap[b.badge_slug]
    if (def) badgesByCustomer[b.customer_id].push({
      slug:   def.slug,
      nombre: def.nombre,
      color:  def.badge_levels?.color || '#94A3B8',
    })
  }

  const top10 = (topRaw || []).map(r => ({
    customer_id: r.customer_id,
    nombre:      afilMap[r.customer_id] || String(r.customer_id),
    total:       r.total,
    badges:      badgesByCustomer[r.customer_id] || [],
  }))

  return Response.json({ totalUsuarios, totalBadges, top10 })
}
