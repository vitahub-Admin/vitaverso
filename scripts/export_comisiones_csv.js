// scripts/export_comisiones_csv.js
// Exporta comisiones por producto cruzando SKUs desde orders.line_items.
// Solo lectura — no modifica la DB.
// Uso: node --env-file=.env scripts/export_comisiones_csv.js

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const PAGE_SIZE = 1000

async function fetchAllOrders() {
  let all = []
  let page = 0
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('line_items')
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
    if (error) throw error
    all = [...all, ...data]
    console.log(`  orders página ${page + 1}: ${data.length} filas`)
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
  console.log('Consultando comisiones...')
  const { data: commissions, error } = await supabase
    .from('product_variant_commissions')
    .select('product_id, commission_percent, active')
    .order('commission_percent', { ascending: false })
  if (error) throw error

  console.log('\nConsultando SKUs desde orders.line_items...')
  const orders = await fetchAllOrders()

  // Construir mapa product_id → { sku, title } desde line_items
  const productMap = {}
  for (const order of orders) {
    for (const item of (order.line_items || [])) {
      const pid = String(item.product_id || '')
      if (!pid || productMap[pid]) continue
      productMap[pid] = {
        sku:   item.sku   || '',
        title: item.title || '',
      }
    }
  }

  console.log(`\nProductos con comisión: ${commissions.length}`)
  console.log(`Productos identificados en órdenes: ${Object.keys(productMap).length}`)

  const headers = ['product_id', 'sku', 'titulo', 'comision_pct', 'activo']
  const rows = [headers.join(',')]

  for (const c of commissions) {
    const pid     = String(c.product_id)
    const details = productMap[pid] || { sku: '', title: '' }
    rows.push([
      pid,
      details.sku,
      details.title,
      c.commission_percent,
      c.active ? 'si' : 'no',
    ].map(escapeCsv).join(','))
  }

  const filename = `comisiones_${Date.now()}.csv`
  writeFileSync(filename, rows.join('\n'), 'utf8')
  console.log(`\n✅ ${commissions.length} productos exportados → ${filename}`)
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
