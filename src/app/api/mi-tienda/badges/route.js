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

  const { data, error } = await supabase
    .from('affiliate_badges')
    .select(`
      earned_at,
      meta,
      badge_definitions!badge_slug (
        slug,
        nombre,
        descripcion,
        image_url,
        hito,
        orden,
        badge_levels!level_slug (
          slug,
          nombre,
          color,
          orden
        )
      )
    `)
    .eq('customer_id', Number(customerId))
    .order('earned_at', { ascending: false })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ badges: data || [] })
}
