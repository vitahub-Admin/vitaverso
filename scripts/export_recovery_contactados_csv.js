// scripts/export_recovery_contactados_csv.js
// Exporta todos los contactados via recovery, deduplicados por teléfono.
// Solo lectura — no modifica la DB.
// Uso: node --env-file=.env scripts/export_recovery_contactados_csv.js

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
    if (data.length < PAGE_SIZE) break
    page++
  }
  return all
}

function normalizePhone(phone) {
  return phone ? phone.replace(/\D/g, '') : null
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
  console.log('Consultando carritos exportados...')
  const carts = await fetchAll(
    'sharecarts',
    'phone, name, token, owner_id, created_at, recovery_exported_at',
    [(q) => q.not('recovery_exported_at', 'is', null).not('phone', 'is', null).neq('phone', '')]
  )
  console.log(`  Total exportados: ${carts.length}`)

  console.log('Consultando afiliados...')
  const ownerIds = [...new Set(carts.map(c => c.owner_id).filter(Boolean))]
  const { data: affiliates } = await supabase
    .from('affiliates')
    .select('shopify_customer_id, first_name, last_name, email, phone')
    .in('shopify_customer_id', ownerIds)

  const affMap = {}
  for (const a of (affiliates || [])) {
    affMap[String(a.shopify_customer_id)] = a
  }

  // Deduplicar por teléfono normalizado — quedarse con el más reciente
  const byPhone = new Map()
  for (const c of carts) {
    const phone = normalizePhone(c.phone)
    if (!phone) continue
    const existing = byPhone.get(phone)
    if (!existing || c.recovery_exported_at > existing.recovery_exported_at) {
      byPhone.set(phone, c)
    }
  }

  console.log(`  Únicos por teléfono: ${byPhone.size}`)

  const headers = [
    'telefono',
    'nombre_cliente',
    'token_carrito',
    'fecha_carrito',
    'fecha_exportado',
    'specialist_id',
    'specialist_nombre',
    'specialist_apellido',
    'specialist_email',
  ]

  const rows = [headers.join(',')]

  for (const [phone, c] of [...byPhone.entries()].sort((a, b) =>
    b[1].recovery_exported_at.localeCompare(a[1].recovery_exported_at)
  )) {
    const aff = affMap[String(c.owner_id)] || {}
    rows.push([
      phone,
      c.name || '',
      c.token || '',
      c.created_at ? c.created_at.slice(0, 10) : '',
      c.recovery_exported_at ? c.recovery_exported_at.slice(0, 10) : '',
      c.owner_id || '',
      aff.first_name || '',
      aff.last_name  || '',
      aff.email      || '',
    ].map(escapeCsv).join(','))
  }

  const filename = `recovery_contactados_${Date.now()}.csv`
  writeFileSync(filename, rows.join('\n'), 'utf8')
  console.log(`\n✅ ${byPhone.size} contactos únicos exportados → ${filename}`)
  console.log(`   (de ${carts.length} registros totales, ${carts.length - byPhone.size} duplicados de teléfono eliminados)`)
}

main().catch((err) => {
  console.error('Error fatal:', err)
  process.exit(1)
})
