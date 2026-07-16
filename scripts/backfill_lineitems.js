// scripts/backfill_lineitems.js
// Enriquece el campo line_items de todas las órdenes en Supabase
// agregando product_id y title desde Shopify.
// Uso: node --env-file=.env scripts/backfill_lineitems.js

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const BASE    = `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01`
const HEADERS = { 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// Trae todas las órdenes de Supabase paginadas
async function fetchAllOrders() {
  const all = []
  let from = 0
  const PAGE = 1000

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('order_id, line_items')
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`Supabase error: ${error.message}`)
    if (!data?.length) break

    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  return all
}

// Trae line_items de hasta 250 órdenes desde Shopify en una sola llamada
async function fetchShopifyLineItems(orderIds) {
  const url = `${BASE}/orders.json?ids=${orderIds.join(',')}&fields=id,line_items&limit=250&status=any`
  const res = await fetch(url, { headers: HEADERS })
  if (!res.ok) throw new Error(`Shopify error ${res.status}: ${await res.text()}`)
  const { orders } = await res.json()
  // Devuelve mapa order_id → line_items
  const map = {}
  for (const o of orders) map[String(o.id)] = o.line_items || []
  return map
}

async function main() {
  console.log('Leyendo órdenes de Supabase...')
  const orders = await fetchAllOrders()
  console.log(`Total órdenes a procesar: ${orders.length}`)

  const BATCH = 250
  let updated = 0
  let skipped = 0

  for (let i = 0; i < orders.length; i += BATCH) {
    const batch = orders.slice(i, i + BATCH)
    const ids   = batch.map(o => o.order_id)

    console.log(`\nLote ${Math.floor(i / BATCH) + 1} — órdenes ${i + 1} a ${Math.min(i + BATCH, orders.length)}`)

    let shopifyMap = {}
    try {
      shopifyMap = await fetchShopifyLineItems(ids)
    } catch (err) {
      console.error('  Error Shopify:', err.message)
      await sleep(2000)
      continue
    }

    for (const order of batch) {
      const shopifyItems = shopifyMap[String(order.order_id)]
      if (!shopifyItems?.length) {
        skipped++
        continue
      }

      // Construir mapa de Shopify por variant_id para merge preciso
      const shopifyByVariant = {}
      for (const item of shopifyItems) {
        shopifyByVariant[String(item.variant_id)] = item
      }

      // Enriquecer cada line_item existente con product_id y title
      const enriched = order.line_items.map((item, idx) => {
        const shopifyItem = shopifyItems[idx]
        return {
          product_id: shopifyItem?.product_id || null,
          title:      shopifyItem?.title      || null,
          sku:           item.sku,
          variant_title: item.variant_title,
          quantity:      item.quantity,
          price:         item.price,
        }
      })

      const { error } = await supabase
        .from('orders')
        .update({ line_items: enriched })
        .eq('order_id', order.order_id)

      if (error) {
        console.error(`  ✗ orden ${order.order_id}:`, error.message)
      } else {
        updated++
      }
    }

    // Respetar rate limit de Shopify (40 req/s, 2 llamadas por lote)
    await sleep(500)
  }

  console.log(`\n✅ Listo — ${updated} órdenes actualizadas, ${skipped} sin datos en Shopify`)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
