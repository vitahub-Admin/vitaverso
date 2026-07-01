// scripts/audit_ordenes_recientes.js
// Audita y corrige órdenes de los últimos 2 días con lógica completa de resolución
// Uso: node scripts/audit_ordenes_recientes.js

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

// ── Shopify helpers ───────────────────────────────────────────

async function getRecentOrders() {
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const all = []
  let url = `${BASE}/orders.json?status=any&financial_status=paid&limit=250&created_at_min=${since}`
  while (url) {
    const res  = await fetch(url, { headers: HEADERS })
    const data = await res.json()
    all.push(...(data.orders || []))
    const link  = res.headers.get('Link') || ''
    const match = link.match(/<([^>]+)>;\s*rel="next"/)
    url = match ? match[1] : null
  }
  return all
}

async function getCustomerData(customerId) {
  const [custRes, metaRes] = await Promise.all([
    fetch(`${BASE}/customers/${customerId}.json?fields=id,tags,email`, { headers: HEADERS }),
    fetch(`${BASE}/customers/${customerId}/metafields.json`, { headers: HEADERS }),
  ])
  const custData = await custRes.json()
  const metaData = await metaRes.json()
  return {
    customer:   custData.customer  || null,
    metafields: metaData.metafields || [],
  }
}

async function setReferidoMetafield(customerId, value, existingMetafields) {
  const existing = existingMetafields.find(m => m.key === 'referido')
  if (existing) {
    const res = await fetch(`${BASE}/metafields/${existing.id}.json`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({ metafield: { id: existing.id, value: String(value), type: 'single_line_text_field' } }),
    })
    return res.ok
  } else {
    const res = await fetch(`${BASE}/customers/${customerId}/metafields.json`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ metafield: { namespace: 'custom', key: 'referido', value: String(value), type: 'single_line_text_field' } }),
    })
    return res.ok
  }
}

async function updateOrderInShopify(order, specialistRef) {
  const currentAttrs = order.note_attributes || []
  const mergedAttrs  = [
    ...currentAttrs.filter(a => a.name !== 'specialist_ref' && a.name !== 'corregido'),
    { name: 'specialist_ref', value: specialistRef },
    { name: 'corregido',      value: 'vitahubpro automat' },
  ]
  const res = await fetch(`${BASE}/orders/${order.id}.json`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify({ order: { id: order.id, note_attributes: mergedAttrs } }),
  })
  return res.ok
}

// ── Lógica de resolución de specialist_ref ───────────────────
// Prioridad:
// 1. Orden ya tiene specialist_ref válido → backfill referido si falta
// 2. Customer tiene tag "especialista" → self-referral
// 3. Customer tiene metafield "referido" → usarlo
// 4. Orden tiene share_cart → buscar en Supabase → backfill referido
// 5. Suspect

async function resolveSpecialistRef(order, customerId) {
  const getAttr   = (name) => order.note_attributes?.find(a => a.name === name)?.value || ''
  const existingRef = getAttr('specialist_ref')
  const shareCart   = getAttr('share_cart') || null

  const { customer, metafields } = await getCustomerData(customerId)
  const referidoMeta  = metafields.find(m => m.key === 'referido')
  const referidoValue = referidoMeta?.value || ''
  const isEspecialista = (customer?.tags || '')
    .split(',').map(t => t.trim().toLowerCase()).includes('especialista')

  // 1. Ya tiene specialist_ref válido
  if (existingRef && existingRef !== '0000') {
    let backfilled = false
    if (!referidoValue) {
      backfilled = await setReferidoMetafield(customerId, existingRef, metafields)
    }
    return { ref: existingRef, source: 'original', backfilled_referido: backfilled }
  }

  // 2. Customer es especialista → self-referral
  if (isEspecialista) {
    let backfilled = false
    if (!referidoValue) {
      backfilled = await setReferidoMetafield(customerId, String(customerId), metafields)
    }
    return { ref: String(customerId), source: 'self_especialista', backfilled_referido: backfilled }
  }

  // 3. Customer tiene metafield referido
  if (referidoValue) {
    return { ref: referidoValue, source: 'referido_metafield' }
  }

  // 4. Share cart
  if (shareCart) {
    const { data: cartData } = await supabase
      .from('sharecarts')
      .select('owner_id')
      .eq('token', shareCart)
      .maybeSingle()

    if (cartData?.owner_id) {
      await setReferidoMetafield(customerId, String(cartData.owner_id), metafields)
      return { ref: String(cartData.owner_id), source: 'sharecart', backfilled_referido: true }
    }
    return { ref: null, source: 'suspect', motivo: 'share_cart no encontrado en supabase' }
  }

  return { ref: null, source: 'suspect', motivo: 'sin specialist_ref, sin tag especialista, sin referido, sin share_cart' }
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('=== Auditoría órdenes últimos 2 días ===\n')

  const orders = await getRecentOrders()
  console.log(`Órdenes encontradas: ${orders.length}\n`)

  const stats = { original: 0, self_especialista: 0, referido_metafield: 0, sharecart: 0, suspect: 0 }

  for (const order of orders) {
    if (order.cancelled_at) continue
    const customerId = order.customer?.id
    if (!customerId) {
      console.log(`  ⚠️  ${order.name} — sin customer_id, saltando`)
      continue
    }

    const resolution = await resolveSpecialistRef(order, customerId)
    stats[resolution.source] = (stats[resolution.source] || 0) + 1

    const prefix = `  ${order.name} | ${order.created_at?.slice(0,10)} | $${order.total_price} | ${order.email}`

    if (!resolution.ref) {
      console.log(`  ⚠️  ${prefix}`)
      console.log(`       motivo: ${resolution.motivo}`)
      continue
    }

    const sourceLabel = {
      original:          '✅ ya tenía ref',
      self_especialista: '🧑‍⚕️ auto-asignado (especialista)',
      referido_metafield:'📋 metafield referido',
      sharecart:         '🛒 share cart',
    }[resolution.source] || resolution.source

    console.log(`  ${prefix}`)
    console.log(`     → ${resolution.ref} [${sourceLabel}]${resolution.backfilled_referido ? ' + referido backfilled' : ''}`)

    // Si la fuente no es "original" (ya tenía ref válido), actualizar orden en Shopify
    if (resolution.source !== 'original') {
      const shopifyOk = await updateOrderInShopify(order, resolution.ref)
      console.log(`     Shopify PUT: ${shopifyOk ? '✅' : '❌'}`)

      const { error } = await supabase
        .from('orders')
        .upsert({
          order_id:       order.id,
          order_name:     order.name,
          customer_email: order.email,
          status:         'corrected',
          corrected_ref:  resolution.ref,
          specialist_ref: '0000',
          total:          Number(order.total_price),
        }, { onConflict: 'order_id' })
      console.log(`     Supabase:    ${error ? `❌ ${error.message}` : '✅'}`)
    }

    await sleep(300)
  }

  console.log('\n=== Resumen ===')
  console.log(`  ✅ Ya tenían ref válido:        ${stats.original || 0}`)
  console.log(`  🧑‍⚕️  Auto-asignados (especialista): ${stats.self_especialista || 0}`)
  console.log(`  📋 Via metafield referido:      ${stats.referido_metafield || 0}`)
  console.log(`  🛒 Via share cart:              ${stats.sharecart || 0}`)
  console.log(`  ⚠️  Sospechosas sin rescate:    ${stats.suspect || 0}`)
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
