// scripts/export_afiliados_funnel_csv.js
// Exporta todos los afiliados con su actividad en el funnel:
// registro → carrito → venta. Incluye afiliados sin actividad.
// Solo lectura — no modifica la DB.
// Uso: node --env-file=.env scripts/export_afiliados_funnel_csv.js

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
    'shopify_customer_id, first_name, last_name, email, profession, city, state, status, active_store, created_at',
    [(q) => q.order('created_at', { ascending: true })]
  )

  console.log('\nConsultando sharecarts...')
  const carts = await fetchAll(
    'sharecarts',
    'owner_id, created_at',
    [(q) => q.not('owner_id', 'is', null)]
  )

  console.log('\nConsultando órdenes...')
  const orders = await fetchAll(
    'orders',
    'specialist_ref, order_id, shopify_created_at',
    [(q) => q.not('specialist_ref', 'is', null).not('customer_email', 'is', null)]
  )

  // Índices por specialist
  const cartsByOwner = {}
  for (const c of carts) {
    const id = String(c.owner_id)
    if (!cartsByOwner[id]) cartsByOwner[id] = []
    cartsByOwner[id].push(c.created_at)
  }

  const ordersBySpec = {}
  const seenOrders = new Set()
  for (const o of orders) {
    const key = `${o.specialist_ref}_${o.order_id}`
    if (seenOrders.has(key)) continue
    seenOrders.add(key)
    const id = String(o.specialist_ref)
    if (!ordersBySpec[id]) ordersBySpec[id] = []
    ordersBySpec[id].push(o.shopify_created_at)
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
    'tienda_activa',
    'fecha_registro',
    'total_carritos',
    'fecha_primer_carrito',
    'total_ordenes',
    'fecha_primera_orden',
    'fecha_ultima_orden',
    'etapa_funnel',
  ]

  const rows = [headers.join(',')]

  for (const aff of affiliates) {
    const id     = String(aff.shopify_customer_id)
    const myCarts  = cartsByOwner[id] || []
    const myOrders = ordersBySpec[id] || []

    const totalCarritos = myCarts.length
    const totalOrdenes  = myOrders.length

    const primerCarrito  = myCarts.length  ? myCarts.sort()[0].slice(0, 10)  : ''
    const primeraOrden   = myOrders.length ? myOrders.sort()[0].slice(0, 10) : ''
    const ultimaOrden    = myOrders.length ? myOrders.sort().at(-1).slice(0, 10) : ''

    const etapa =
      totalOrdenes  > 0 ? 'vendio' :
      totalCarritos > 0 ? 'creo_carrito' :
                          'solo_registro'

    rows.push([
      id,
      aff.first_name  || '',
      aff.last_name   || '',
      aff.email       || '',
      aff.profession  || '',
      aff.city        || '',
      aff.state       || '',
      aff.status      || '',
      aff.active_store ? 'si' : 'no',
      aff.created_at  ? aff.created_at.slice(0, 10) : '',
      totalCarritos,
      primerCarrito,
      totalOrdenes,
      primeraOrden,
      ultimaOrden,
      etapa,
    ].map(escapeCsv).join(','))
  }

  const filename = `afiliados_funnel_${Date.now()}.csv`
  writeFileSync(filename, rows.join('\n'), 'utf8')

  const soloRegistro  = rows.filter(r => r.includes('solo_registro')).length
  const creoCarrito   = rows.filter(r => r.includes('creo_carrito')).length
  const vendio        = rows.filter(r => r.includes('vendio')).length

  console.log(`\n✅ ${affiliates.length} afiliados exportados → ${filename}`)
  console.log(`   Solo registro:  ${soloRegistro}`)
  console.log(`   Creó carrito:   ${creoCarrito}`)
  console.log(`   Vendió:         ${vendio}`)
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
