// scripts/export_lineitems_csv.js
// Exporta el detalle de line_items por orden (solo órdenes con share_cart) a CSV.
// Solo lectura — no modifica la DB.
// Uso: node --env-file=.env scripts/export_lineitems_csv.js
// Opcional: node --env-file=.env scripts/export_lineitems_csv.js 2024-01-01 2024-12-31

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const [, , fromArg, toArg] = process.argv

const PAGE_SIZE = 1000

async function fetchAllOrders() {
  let all = []
  let page = 0

  while (true) {
    const from = page * PAGE_SIZE

    let query = supabase
      .from('orders')
      .select('order_id, order_name, shopify_created_at, specialist_ref, customer_email, share_cart, line_items, total_discounts')
      .not('customer_email', 'is', null)
      .order('shopify_created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (fromArg && toArg) {
      query = query
        .gte('shopify_created_at', fromArg)
        .lte('shopify_created_at', toArg + 'T23:59:59')
    }

    const { data, error } = await query
    if (error) throw error

    all = [...all, ...data]
    console.log(`  Página ${page + 1}: ${data.length} órdenes (total: ${all.length})`)

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

function toRow(fields) {
  return fields.map(escapeCsv).join(',')
}

async function main() {
  console.log('Consultando Supabase...')
  if (fromArg && toArg) console.log(`  Filtro: ${fromArg} → ${toArg}`)

  const orders = await fetchAllOrders()
  console.log(`\nTotal órdenes con share_cart: ${orders.length}`)

  const headers = [
    'order_id',
    'order_name',
    'fecha',
    'specialist_ref',
    'customer_email',
    'share_cart',
    'sku',
    'product_id',
    'titulo',
    'precio_unitario',
    'cantidad',
    'subtotal_linea',
  ]

  const rows = [headers.join(',')]
  let totalLineItems = 0

  for (const order of orders) {
    const items = (order.line_items || []).filter(
      (i) => i.title && !i.title.toLowerCase().includes('tip')
    )

    for (const item of items) {
      const price    = Number(item.price || 0)
      const qty      = Number(item.quantity || 1)
      const subtotal = price * qty

      rows.push(toRow([
        order.order_id,
        order.order_name,
        order.shopify_created_at?.slice(0, 10),
        order.specialist_ref,
        order.customer_email,
        order.share_cart,
        item.sku       || '',
        item.product_id || '',
        item.title     || '',
        price.toFixed(2),
        qty,
        subtotal.toFixed(2),
      ]))

      totalLineItems++
    }
  }

  const filename = `lineitems_${fromArg || 'all'}_${toArg || 'all'}_${Date.now()}.csv`
  writeFileSync(filename, rows.join('\n'), 'utf8')

  console.log(`\n✅ ${totalLineItems} line items exportados → ${filename}`)
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
