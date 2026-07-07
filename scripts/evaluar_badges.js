// scripts/evaluar_badges.js
// Evalúa criterios de badges para todos los afiliados activos,
// los registra en Supabase y actualiza el metafield de Shopify si son públicos.
// Uso: node --env-file=.env scripts/evaluar_badges.js

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const BASE    = `https://${SHOPIFY_STORE}/admin/api/2024-01`
const HEADERS = { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function parseHito(h) { return typeof h === 'string' ? JSON.parse(h) : h }

// ── Stats del especialista desde Supabase ─────────────────────
async function getStats(customerId) {
  const { data: orders } = await supabase
    .from('orders')
    .select('customer_id')
    .or(`specialist_ref.eq.${customerId},corrected_ref.eq.${customerId}`)

  const carritos  = orders?.length || 0
  const pacientes = new Set(orders?.map(o => o.customer_id).filter(Boolean)).size

  return { carritos, pacientes }
}

// ── Meses activo desde Shopify ────────────────────────────────
async function getMesesActivo(customerId) {
  const res  = await fetch(`${BASE}/customers/${customerId}.json?fields=created_at`, { headers: HEADERS })
  const data = await res.json()
  if (!data.customer?.created_at) return 0
  return Math.floor((Date.now() - new Date(data.customer.created_at).getTime()) / (1000 * 60 * 60 * 24 * 30))
}

// ── Evaluación de criterios ───────────────────────────────────
function evaluarBadges(stats, meses, defs) {
  const { carritos, pacientes } = stats
  const califica = []

  for (const def of defs) {
    if (def.slug === 'fundador') {
      if (meses >= 12 && carritos >= 50) califica.push(def.slug)
      continue
    }
    if (!def.hito) continue
    const hito = parseHito(def.hito)
    if (def.grupo === 'carritos'  && carritos  >= hito.valor) califica.push(def.slug)
    if (def.grupo === 'pacientes' && pacientes >= hito.valor) califica.push(def.slug)
  }

  return califica
}

// ── Actualizar metafield de la colección Shopify ─────────────
async function actualizarColeccion(collectionId, badgesPublicas) {
  if (!collectionId) return false

  const simpleId = String(collectionId).split('/').pop()
  const value    = JSON.stringify(
    badgesPublicas.map(b => ({
      slug:      b.slug,
      nombre:    b.nombre,
      image_url: b.image_url || null,
      level:     b.level_slug,
    }))
  )

  const checkRes = await fetch(
    `${BASE}/collections/${simpleId}/metafields.json?namespace=custom&key=badges`,
    { headers: HEADERS }
  )
  const checkData = await checkRes.json()
  const existing  = checkData.metafields?.[0]

  if (existing) {
    const res  = await fetch(`${BASE}/metafields/${existing.id}.json`, {
      method:  'PUT',
      headers: HEADERS,
      body:    JSON.stringify({ metafield: { id: existing.id, value, type: 'json' } }),
    })
    const data = await res.json()
    if (!res.ok) console.log('     ⚠️ Shopify PUT error:', JSON.stringify(data))
    return res.ok
  } else {
    const res  = await fetch(`${BASE}/collections/${simpleId}/metafields.json`, {
      method:  'POST',
      headers: HEADERS,
      body:    JSON.stringify({ metafield: { namespace: 'custom', key: 'badges', value, type: 'json' } }),
    })
    const data = await res.json()
    if (!res.ok) console.log(`     ⚠️ Shopify POST error (collection: ${simpleId}):`, JSON.stringify(data))
    else console.log('     → metafield creado:', data.metafield?.id)
    return res.ok
  }
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log('=== Evaluador de Badges ===\n')

  // Cargar definiciones activas
  const { data: defs, error: defsErr } = await supabase
    .from('badge_definitions')
    .select('slug, nombre, image_url, hito, grupo, level_slug, publica')
    .eq('activo', true)

  if (defsErr) { console.error('❌ Error cargando badges:', defsErr.message); process.exit(1) }

  // Cargar afiliados activos con paginación
  const afiliados = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error: afilErr } = await supabase
      .from('affiliates')
      .select('shopify_customer_id, shopify_collection_id, first_name')
      .eq('status', 'active')
      .range(from, from + PAGE - 1)
    if (afilErr) { console.error('❌ Error cargando afiliados:', afilErr.message); process.exit(1) }
    afiliados.push(...(data || []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }

  const forceShopify = process.argv.includes('--force-shopify')
  console.log(`  ${afiliados.length} afiliados activos | ${defs.length} badges definidas${forceShopify ? ' | modo force-shopify' : ''}\n`)

  const resumen = { nuevos: 0, sin_cambios: 0, shopify_ok: 0, errores: 0 }

  for (const afiliado of afiliados) {
    const cid    = afiliado.shopify_customer_id
    const nombre = afiliado.first_name || String(cid)

    try {
      // Badges ya ganadas
      const { data: yaGanados } = await supabase
        .from('affiliate_badges')
        .select('badge_slug')
        .eq('customer_id', cid)
      const yaSet = new Set(yaGanados?.map(b => b.badge_slug) || [])

      // Stats
      const stats = await getStats(cid)
      const meses = await getMesesActivo(cid)

      // Evaluar
      const califica = evaluarBadges(stats, meses, defs)
      const nuevos   = califica.filter(slug => !yaSet.has(slug))

      if (!nuevos.length) {
        if (forceShopify && afiliado.shopify_collection_id) {
          const todosPublicos = defs.filter(d => yaSet.has(d.slug) && d.publica)
          if (todosPublicos.length) {
            const ok = await actualizarColeccion(afiliado.shopify_collection_id, todosPublicos)
            console.log(`  · ${nombre} — Shopify sync: ${ok ? '✅' : '❌'} (${todosPublicos.length} públicas)`)
            if (ok) resumen.shopify_ok++
          }
        } else {
          console.log(`  · ${nombre} — sin nuevos (carritos: ${stats.carritos} | pacientes: ${stats.pacientes})`)
        }
        resumen.sin_cambios++
        await sleep(350)
        continue
      }

      // Insertar nuevos en Supabase
      await supabase.from('affiliate_badges').upsert(
        nuevos.map(slug => ({
          customer_id: cid,
          badge_slug:  slug,
          meta: { trigger: 'evaluar_badges', carritos: stats.carritos, pacientes: stats.pacientes, meses },
        })),
        { onConflict: 'customer_id,badge_slug' }
      )

      console.log(`  🏅 ${nombre} — nuevos: ${nuevos.join(', ')}`)
      resumen.nuevos += nuevos.length

      // Actualizar colección Shopify si hay nuevos públicos
      const hayNuevosPublicos = defs.some(d => nuevos.includes(d.slug) && d.publica)
      if (hayNuevosPublicos && afiliado.shopify_collection_id) {
        const todosPublicos = defs.filter(d =>
          (yaSet.has(d.slug) || nuevos.includes(d.slug)) && d.publica
        )
        const ok = await actualizarColeccion(afiliado.shopify_collection_id, todosPublicos)
        console.log(`     → Shopify: ${ok ? '✅' : '❌'} (${todosPublicos.length} badges públicas)`)
        if (ok) resumen.shopify_ok++
      }

    } catch (err) {
      console.log(`  ❌ ${nombre} — ${err.message}`)
      resumen.errores++
    }

    await sleep(400)
  }

  console.log('\n=== Resumen ===')
  console.log(`  🏅 Nuevos badges:          ${resumen.nuevos}`)
  console.log(`  ✓  Sin cambios:            ${resumen.sin_cambios}`)
  console.log(`  🛍  Shopify actualizados:   ${resumen.shopify_ok}`)
  console.log(`  ❌ Errores:                ${resumen.errores}`)
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
