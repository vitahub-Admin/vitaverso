// scripts/export_afiliados_resumen_csv.js
// Exporta resumen agregado por afiliado con métricas de ventas.
// Solo lectura — no modifica la DB.
// Uso: node --env-file=.env scripts/export_afiliados_resumen_csv.js

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
    'shopify_customer_id, first_name, last_name, email, profession, city, state, status, created_at',
    [(q) => q.order('created_at', { ascending: true })]
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

  const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // Agregar por specialist
  const seenOrders = new Set()
  const specMap = {}

  for (const order of orders) {
    const key = `${order.specialist_ref}_${order.order_id}`
    if (seenOrders.has(key)) continue
    seenOrders.add(key)

    const sid = String(order.specialist_ref)
    if (!specMap[sid]) specMap[sid] = {
      total_conversiones:  0,
      ingreso_total:       0,
      comision_total:      0,
      carritos_mas_1200:   0,
      ultima_orden:        null,
    }

    const items         = (order.line_items || []).filter(i => i.title && !i.title.toLowerCase().includes('tip'))
    const orderSubtotal = items.reduce((s, i) => s + Number(i.price || 0) * (i.quantity || 1), 0)
    const totalDiscount = Number(order.total_discounts || 0)

    let ordenIngreso  = 0
    let ordenComision = 0

    for (const item of items) {
      const commission   = commMap[String(item.product_id || '')] ?? 0
      const price        = Number(item.price || 0)
      const qty          = item.quantity || 1
      const lineSubtotal = price * qty
      const lineDiscount = orderSubtotal > 0 ? totalDiscount * (lineSubtotal / orderSubtotal) : 0
      const lineNet      = lineSubtotal - lineDiscount
      ordenIngreso  += lineNet
      ordenComision += lineNet * (commission / 100)
    }

    specMap[sid].total_conversiones++
    specMap[sid].ingreso_total     += ordenIngreso
    specMap[sid].comision_total    += ordenComision
    if (ordenIngreso > 1200) specMap[sid].carritos_mas_1200++
    if (!specMap[sid].ultima_orden || order.shopify_created_at > specMap[sid].ultima_orden) {
      specMap[sid].ultima_orden = order.shopify_created_at
    }
  }

  const headers = [
    'shopify_customer_id',
    'nombre',
    'apellido',
    'email',
    'profesion',
    'ciudad',
    'estado',
    'status',
    'fecha_registro',
    'meses_activo',
    'total_conversiones',
    'ingreso_total',
    'comision_total',
    'ingreso_promedio_mensual',
    'comision_mensual',
    'carritos_mas_1200',
    'carrito_ultima_semana',
  ]

  const rows = [headers.join(',')]
  const now  = new Date()

  for (const aff of affiliates) {
    const sid    = String(aff.shopify_customer_id)
    const stats  = specMap[sid] || { total_conversiones: 0, ingreso_total: 0, comision_total: 0, carritos_mas_1200: 0, ultima_orden: null }

    const altaDate    = aff.created_at ? new Date(aff.created_at) : now
    const mesesActivo = Math.max(1, Math.round((now - altaDate) / (1000 * 60 * 60 * 24 * 30)))

    const carrito_ultima_semana = stats.ultima_orden && stats.ultima_orden >= SEVEN_DAYS_AGO ? 'si' : 'no'

    rows.push([
      sid,
      aff.first_name || '',
      aff.last_name  || '',
      aff.email      || '',
      aff.profession || '',
      aff.city       || '',
      aff.state      || '',
      aff.status     || '',
      aff.created_at ? aff.created_at.slice(0, 10) : '',
      mesesActivo,
      stats.total_conversiones,
      stats.ingreso_total.toFixed(2),
      stats.comision_total.toFixed(2),
      (stats.ingreso_total / mesesActivo).toFixed(2),
      (stats.comision_total / mesesActivo).toFixed(2),
      stats.carritos_mas_1200,
      carrito_ultima_semana,
    ].map(escapeCsv).join(','))
  }

  const filename = `afiliados_resumen_${Date.now()}.csv`
  writeFileSync(filename, rows.join('\n'), 'utf8')
  console.log(`\n✅ ${affiliates.length} afiliados exportados → ${filename}`)
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
