// scripts/backfill_calendly_uris.js
// Rellena calendly_event_uri en capacitaciones existentes que tienen link de Calendly
// Uso: node scripts/backfill_calendly_uris.js

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

async function main() {
  // 1. Traer todos los event types de Calendly
  const res = await fetch(
    `https://api.calendly.com/event_types?user=https://api.calendly.com/users/${process.env.CALENDLY_USER_UUID}`,
    { headers: { Authorization: `Bearer ${process.env.CALENDLY_API_TOKEN}` } }
  )
  const { collection = [] } = await res.json()
  const normalize = url => url?.toLowerCase().replace(/\/$/, '')
  const byUrl = Object.fromEntries(collection.map(e => [normalize(e.scheduling_url), e.uri]))

  // 2. Traer capacitaciones con link de Calendly sin URI resuelta
  const { data: caps, error } = await supabase
    .from('capacitaciones')
    .select('id, title, link, calendly_event_uri')
    .ilike('link', '%calendly.com%')

  if (error) throw error
  console.log(`${caps.length} capacitaciones con link de Calendly encontradas`)

  // 3. Resolver y actualizar
  for (const cap of caps) {
    const uri = byUrl[normalize(cap.link)]
    if (!uri) {
      console.log(`  ⚠️  Sin match: ${cap.title} (${cap.link})`)
      continue
    }
    if (cap.calendly_event_uri === uri) {
      console.log(`  ✓  Ya tiene URI: ${cap.title}`)
      continue
    }
    const { error: updErr } = await supabase
      .from('capacitaciones')
      .update({ calendly_event_uri: uri })
      .eq('id', cap.id)

    if (updErr) console.error(`  ❌  Error en ${cap.title}:`, updErr.message)
    else console.log(`  ✅  ${cap.title}`)
  }

  console.log('Listo.')
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
