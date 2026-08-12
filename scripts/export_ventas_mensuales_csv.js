// scripts/export_ventas_mensuales_csv.js
// Exporta ventas mensuales por profesional desde su fecha de alta.
// Solo lectura — no modifica la DB.
// Uso: node --env-file=.env scripts/export_ventas_mensuales_csv.js

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
  console.log('Consultando afiliados...')
  const affiliates = await fetchAll(
    'affiliates',
    'shopify_customer_id, first_name, last_name, email, created_at, profession, city, state'
  )

  console.log('\nConsultando órdenes...')
  const orders = await fetchAll(
    'orders',
    'order_id, specialist_ref, shopify_created_at, line_items, total_discounts',
    [(q) => q.not('specialist_ref', 'is', null).not('customer_email', 'is', null)]
  )

  console.log('\nConsultando comisiones...')
  const { data: commissions, error: commError } = await supabase
    .from('product_variant_commissions')
    .select('product_id, commission_percent')
    .eq('active', true)
  if (commError) throw commError

  const commMap = {}
  for (const c of commissions) commMap[String(c.product_id)] = Number(c.commission_percent)

  const affMap = {}
  for (const a of affiliates) affMap[String(a.shopify_customer_id)] = a

  // Agregar por specialist + año-mes
  const map = {}

  for (const order of orders) {
    const sid = String(order.specialist_ref)
    const ym  = order.shopify_created_at?.slice(0, 7)
    if (!ym) continue

    const key = `${sid}__${ym}`
    if (!map[key]) map[key] = { sid, ym, ordenes: 0, items: 0, ganancia: 0 }

    const items         = (order.line_items || []).filter(i => i.title && !i.title.toLowerCase().includes('tip'))
    const orderSubtotal = items.reduce((s, i) => s + Number(i.price || 0) * (i.quantity || 1), 0)
    const totalDiscount = Number(order.total_discounts || 0)

    map[key].ordenes++

    for (const item of items) {
      const commission   = commMap[String(item.product_id || '')] ?? 0
      const price        = Number(item.price || 0)
      const qty          = item.quantity || 1
      const lineSubtotal = price * qty
      const lineDiscount = orderSubtotal > 0 ? totalDiscount * (lineSubtotal / orderSubtotal) : 0
      map[key].items   += qty
      map[key].ganancia += (lineSubtotal - lineDiscount) * (commission / 100)
    }
  }

  const headers = [
    'specialist_id',
    'nombre',
    'apellido',
    'email',
    'profesion',
    'ciudad',
    'estado',
    'fecha_alta',
    'mes_alta',
    'anio_mes',
    'mes_desde_alta',
    'ordenes',
    'items',
    'ganancia',
  ]

  const rows = [headers.join(',')]

  for (const entry of Object.values(map).sort((a, b) => a.sid.localeCompare(b.sid) || a.ym.localeCompare(b.ym))) {
    const aff      = affMap[entry.sid] || {}
    const altaDate = aff.created_at ? aff.created_at.slice(0, 7) : null

    let mesDesdAlta = ''
    if (altaDate) {
      const [ay, am] = altaDate.split('-').map(Number)
      const [ey, em] = entry.ym.split('-').map(Number)
      mesDesdAlta = (ey - ay) * 12 + (em - am) + 1
    }

    rows.push([
      entry.sid,
      aff.first_name  || '',
      aff.last_name   || '',
      aff.email       || '',
      aff.profession  || '',
      aff.city        || '',
      aff.state       || '',
      aff.created_at  ? aff.created_at.slice(0, 10) : '',
      altaDate        || '',
      entry.ym,
      mesDesdAlta,
      entry.ordenes,
      entry.items,
      entry.ganancia.toFixed(2),
    ].map(escapeCsv).join(','))
  }

  const filename = `ventas_mensuales_${Date.now()}.csv`
  writeFileSync(filename, rows.join('\n'), 'utf8')
  console.log(`\n✅ ${rows.length - 1} filas exportadas → ${filename}`)
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
