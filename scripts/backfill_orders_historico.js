// scripts/backfill_orders_historico.js
// Importa todo el historial de órdenes de Shopify a Supabase.
// Usa upsert con onConflict: order_id — órdenes ya existentes se omiten.
// Uso: node --env-file=.env scripts/backfill_orders_historico.js

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const BASE          = `https://${SHOPIFY_STORE}/admin/api/2024-01`
const HEADERS       = { 'X-Shopify-Access-Token': SHOPIFY_TOKEN }

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function getAttr(attrs, name) {
  return attrs?.find(a => a.name === name)?.value || ''
}

function buildRecord(order) {
  const customer     = order.customer || {}
  const specialistRef = getAttr(order.note_attributes, 'specialist_ref') || '0000'
  const shareCart    = getAttr(order.note_attributes, 'share_cart') || null
  const discountTitle = order.discount_codes?.[0]?.code || null

  const lineItems = (order.line_items || []).map(item => ({
    product_id:    item.product_id    || null,
    title:         item.title         || null,
    sku:           item.sku           || null,
    variant_title: item.variant_title || null,
    quantity:      item.quantity,
    price:         Number(item.price),
  }))

  return {
    order_id:          order.id,
    order_name:        order.name,
    customer_id:       customer.id    || null,
    customer_name:     [customer.first_name, customer.last_name].filter(Boolean).join(' ') || null,
    customer_email:    customer.email  || null,
    customer_phone:    customer.phone  || null,
    share_cart:        shareCart,
    specialist_ref:    specialistRef,
    corrected_ref:     null,
    status:            specialistRef && specialistRef !== '0000' ? 'ok' : 'ok',
    financial_status:  order.financial_status  || null,
    fulfillment_status: order.fulfillment_status || null,
    line_items:        lineItems,
    discount_title:    discountTitle,
    total:             Number(order.total_price      || 0),
    total_discounts:   Number(order.total_discounts  || 0),
    shopify_created_at: order.created_at,
    shopify_updated_at: order.updated_at,
  }
}

// Extrae el page_info del header Link de Shopify
function extractNextPageInfo(linkHeader) {
  if (!linkHeader) return null
  const match = linkHeader.match(/<[^>]*page_info=([^&>]+)[^>]*>;\s*rel="next"/)
  return match ? match[1] : null
}

async function main() {
  console.log('Iniciando backfill histórico de órdenes Shopify → Supabase\n')

  let pageInfo  = null
  let page      = 0
  let total     = 0
  let inserted  = 0
  let errors    = 0

  while (true) {
    page++

    // Construir URL con cursor o inicial
    // Nota: cuando hay page_info NO se pueden pasar otros params (status, fields, etc.)
    const url = pageInfo
      ? `${BASE}/orders.json?limit=250&page_info=${pageInfo}`
      : `${BASE}/orders.json?status=any&limit=250&fields=id,name,customer,note_attributes,line_items,financial_status,fulfillment_status,total_price,total_discounts,discount_codes,created_at,updated_at`

    const res = await fetch(url, { headers: HEADERS })

    if (!res.ok) {
      const body = await res.text()
      console.error(`Error Shopify ${res.status}: ${body}`)
      if (res.status === 400) break
      await sleep(2000)
      continue
    }

    const { orders } = await res.json()
    if (!orders?.length) break

    total += orders.length

    // Construir registros
    const records = orders.map(buildRecord)

    // Upsert en Supabase — ignora duplicados por order_id
    const { error } = await supabase
      .from('orders')
      .upsert(records, { onConflict: 'order_id', ignoreDuplicates: true })

    if (error) {
      console.error(`  ✗ Error upsert página ${page}:`, error.message)
      errors++
    } else {
      inserted += records.length
      console.log(`Página ${page}: ${orders.length} órdenes procesadas (total: ${total})`)
    }

    // Siguiente página
    const linkHeader = res.headers.get('link')
    pageInfo = extractNextPageInfo(linkHeader)
    if (!pageInfo) break

    // Rate limit: ~2 req/s
    await sleep(600)
  }

  console.log(`\n✅ Listo — ${total} órdenes procesadas, ~${inserted} insertadas/actualizadas, ${errors} errores`)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
