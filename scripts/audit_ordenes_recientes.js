// scripts/audit_ordenes_recientes.js
// Audita órdenes de los últimos 2 días simulando la lógica del webhook
// Uso: node scripts/audit_ordenes_recientes.js

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

async function getRecentOrders() {
  const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const all = []
  let url = `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?status=any&financial_status=paid&limit=250&created_at_min=${since}`

  while (url) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } })
    const data = await res.json()
    all.push(...(data.orders || []))
    const link = res.headers.get('Link') || ''
    const match = link.match(/<([^>]+)>;\s*rel="next"/)
    url = match ? match[1] : null
  }

  return all
}

async function main() {
  console.log('=== Auditoría órdenes últimos 2 días ===\n')

  const orders = await getRecentOrders()
  console.log(`Órdenes encontradas: ${orders.length}\n`)

  const getAttr = (order, name) =>
    order.note_attributes?.find(a => a.name === name)?.value || ''

  const results = { ok: [], corrected: [], suspect: [] }

  for (const order of orders) {
    if (order.cancelled_at) continue

    const specialistRef = getAttr(order, 'specialist_ref') || '0000'
    const shareCart     = getAttr(order, 'share_cart') || null
    const orderInfo     = {
      id:       order.id,
      name:     order.name,
      email:    order.email,
      total:    order.total_price,
      fecha:    order.created_at?.slice(0, 10),
      specialist_ref: specialistRef,
      share_cart:     shareCart,
    }

    if (specialistRef && specialistRef !== '0000') {
      results.ok.push(orderInfo)
      continue
    }

    // Sin especialista — intentar corregir via share cart
    if (shareCart) {
      const { data: cartData } = await supabase
        .from('sharecarts')
        .select('owner_id, phone')
        .eq('token', shareCart)
        .maybeSingle()

      if (cartData?.owner_id) {
        results.corrected.push({ ...orderInfo, corrected_to: String(cartData.owner_id) })
      } else {
        results.suspect.push({ ...orderInfo, motivo: 'share_cart no encontrado en supabase' })
      }
    } else {
      results.suspect.push({ ...orderInfo, motivo: 'sin specialist_ref y sin share_cart' })
    }
  }

  // ── Resumen ──────────────────────────────────────────────────
  console.log(`✅ OK (con especialista):          ${results.ok.length}`)
  console.log(`🔧 Corregibles (via share cart):   ${results.corrected.length}`)
  console.log(`⚠️  Sospechosas (sin rescate):      ${results.suspect.length}`)
  console.log('')

  if (results.corrected.length > 0) {
    console.log('── CORREGIBLES → aplicando corrección ─────────')
    for (const o of results.corrected) {
      console.log(`\n  ${o.name} | ${o.fecha} | $${o.total} | ${o.email}`)
      console.log(`    share_cart: ${o.share_cart}  →  owner: ${o.corrected_to}`)

      // 1. Obtener note_attributes actuales de Shopify
      const shopifyRes = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/orders/${o.id}.json?fields=id,note_attributes`,
        { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
      )
      const shopifyData = await shopifyRes.json()
      const currentAttrs = shopifyData.order?.note_attributes || []

      // 2. Merge: reemplazar specialist_ref, agregar corregido
      const mergedAttrs = [
        ...currentAttrs.filter(a => a.name !== 'specialist_ref' && a.name !== 'corregido'),
        { name: 'specialist_ref', value: o.corrected_to },
        { name: 'corregido',      value: 'vitahubpro automat' },
      ]

      // 3. PUT a Shopify
      const putRes = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2024-01/orders/${o.id}.json`,
        {
          method: 'PUT',
          headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
          body: JSON.stringify({ order: { id: o.id, note_attributes: mergedAttrs } }),
        }
      )
      console.log(`    Shopify PUT: ${putRes.ok ? '✅ ok' : `❌ ${putRes.status}`}`)
      if (!putRes.ok) console.log('   ', await putRes.text())

      // 4. Upsert en Supabase orders
      const { error: sbError } = await supabase
        .from('orders')
        .upsert(
          {
            order_id:      o.id,
            order_name:    o.name,
            customer_email: o.email,
            status:        'corrected',
            corrected_ref: o.corrected_to,
            specialist_ref: '0000',
            share_cart:    o.share_cart,
            total:         Number(o.total),
          },
          { onConflict: 'order_id' }
        )
      console.log(`    Supabase upsert: ${sbError ? `❌ ${sbError.message}` : '✅ ok'}`)
    }
    console.log('')
  }

  if (results.suspect.length > 0) {
    console.log('── SOSPECHOSAS ────────────────────────────────')
    for (const o of results.suspect) {
      console.log(`  ${o.name} | ${o.fecha} | $${o.total} | ${o.email}`)
      console.log(`    motivo: ${o.motivo}`)
      if (o.share_cart) console.log(`    share_cart: ${o.share_cart}`)
    }
    console.log('')
  }
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
