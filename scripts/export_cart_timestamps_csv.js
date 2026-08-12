// scripts/export_cart_timestamps_csv.js
// Exporta timestamps de creación y conversión por carrito.
// Solo lectura — no modifica la DB.
// Uso: node --env-file=.env scripts/export_cart_timestamps_csv.js

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const PAGE_SIZE = 1000

async function fetchAll(table, select, filters = []) {
  let all = []
  let page = 0
  while (true) {
    let query = supabase.from(table).select(select).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    for (const f of filters) query = f(query)
    const { data, error } = await query
    if (error) throw error
    all = [...all, ...data]
    console.log(`  ${table} página ${page + 1}: ${data.length} filas (total: ${all.length})`)
    if (data.length < PAGE_SIZE) break
    page++
  }
  return all
}

function escapeCsv(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

async function main() {
  console.log('Consultando sharecarts...')
  const carts = await fetchAll(
    'sharecarts',
    'token, owner_id, name, created_at',
    [(q) => q.not('owner_id', 'is', null)]
  )

  console.log('\nConsultando orders con share_cart...')
  const orders = await fetchAll(
    'orders',
    'share_cart, order_id, order_name, shopify_created_at, financial_status',
    [(q) => q.not('share_cart', 'is', null)]
  )

  // Índice: token → primera orden (por fecha)
  const orderByToken = {}
  for (const o of orders) {
    if (!o.share_cart) continue
    const existing = orderByToken[o.share_cart]
    if (!existing || o.shopify_created_at < existing.shopify_created_at) {
      orderByToken[o.share_cart] = o
    }
  }

  const headers = [
    'token',
    'owner_id',
    'client_name',
    'cart_created_at',
    'order_created_at',
    'horas_a_conversion',
    'convertido',
    'order_id',
    'order_name',
    'financial_status',
  ]

  const rows = [headers.join(',')]

  for (const cart of carts) {
    const order = orderByToken[cart.token] || null

    let horasAConversion = ''
    if (order?.shopify_created_at && cart.created_at) {
      const diffMs = new Date(order.shopify_created_at) - new Date(cart.created_at)
      horasAConversion = (diffMs / (1000 * 60 * 60)).toFixed(2)
    }

    rows.push([
      cart.token,
      cart.owner_id,
      cart.name || '',
      cart.created_at || '',
      order?.shopify_created_at || '',
      horasAConversion,
      order ? 'si' : 'no',
      order?.order_id || '',
      order?.order_name || '',
      order?.financial_status || '',
    ].map(escapeCsv).join(','))
  }

  const filename = `cart_timestamps_${Date.now()}.csv`
  writeFileSync(filename, rows.join('\n'), 'utf8')
  console.log(`\n✅ ${carts.length} carritos exportados → ${filename}`)
  console.log(`   Convertidos: ${Object.keys(orderByToken).length} | Sin conversión: ${carts.length - Object.keys(orderByToken).length}`)
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
