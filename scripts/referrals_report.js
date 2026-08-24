// scripts/referrals_report.js
// Reporte de referidos: quién refirió a quién y si el referido ha vendido.
// El referidor es apto de cobrar cuando su referido tiene al menos 1 venta.
//
// Uso:
//   node --env-file=.env scripts/referrals_report.js            # texto
//   node --env-file=.env scripts/referrals_report.js --csv      # CSV

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const CSV_MODE = process.argv.includes('--csv')

// ── Helpers ───────────────────────────────────────────────────────────────────
async function fetchAllAffiliates() {
  const PAGE = 1000
  let offset = 0
  const all  = []
  while (true) {
    const { data, error } = await supabase
      .from('affiliates')
      .select('shopify_customer_id, id, email, first_name, last_name, referral_id, status, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

function fullName(aff) {
  return [aff.first_name, aff.last_name].filter(Boolean).join(' ') || '(sin nombre)'
}

async function fetchVentasBySpecialist(ids) {
  if (!ids.length) return {}
  const PAGE = 1000
  let offset = 0
  const sales = {}
  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('specialist_ref, total')
      .in('specialist_ref', ids)
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data?.length) break
    for (const row of data) {
      const id = String(row.specialist_ref)
      if (!sales[id]) sales[id] = { count: 0, total: 0 }
      sales[id].count++
      sales[id].total += Number(row.total) || 0
    }
    if (data.length < PAGE) break
    offset += PAGE
  }
  return sales
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Cargando afiliados...')
  const all = await fetchAllAffiliates()
  console.log(`  ${all.length} afiliados totales`)

  // Índices para cruzar referral_id
  const byShopifyId = {}
  const byId        = {}
  const byEmail     = {}
  for (const a of all) {
    byShopifyId[String(a.shopify_customer_id)] = a
    byId[String(a.id)] = a
    if (a.email) byEmail[a.email] = a
  }

  // Filtrar referidos reales
  const INVALID_REFS = new Set(['n/a', 'na', 'null', 'none', '-', ''])
  const withRef = all.filter(a => {
    const r = (a.referral_id || '').trim().toLowerCase()
    return r && !INVALID_REFS.has(r)
  })
  console.log(`  ${withRef.length} afiliados con referral_id válido`)
  if (!withRef.length) { console.log('Nada que reportar.'); return }

  // Ventas por referido
  console.log('Cargando ventas...')
  const referidoIds = withRef.map(a => String(a.shopify_customer_id))
  const salesMap    = await fetchVentasBySpecialist(referidoIds)

  // Armar filas
  const rows = withRef.map(a => {
    const ref      = (a.referral_id || '').trim()
    const referrer = byShopifyId[ref] || byId[ref] || byEmail[ref] || null
    const id       = String(a.shopify_customer_id)
    const venta    = salesMap[id] || { count: 0, total: 0 }

    return {
      referido_shopify_id:  a.shopify_customer_id,
      referido_email:       a.email || '',
      ventas_count:         venta.count,
      ventas_total:         Math.round(venta.total),
      apto_cobrar:          venta.count > 0,
      referidor_shopify_id: referrer?.shopify_customer_id || '',
      referidor_email:      referrer?.email || '',
      referidor_nombre:     referrer ? fullName(referrer) : '⚠️  no encontrado',
      referidor_match:      !!referrer,
    }
  })

  // Ordenar: con ventas primero, luego sin ventas; sin match al final
  rows.sort((a, b) => {
    if (a.apto_cobrar !== b.apto_cobrar) return a.apto_cobrar ? -1 : 1
    if (a.referidor_match !== b.referidor_match) return a.referidor_match ? -1 : 1
    return b.ventas_count - a.ventas_count
  })

  const aptos   = rows.filter(r => r.apto_cobrar)
  const sinVent = rows.filter(r => !r.apto_cobrar && r.referidor_match)
  const sinMatch= rows.filter(r => !r.referidor_match)

  // ── TEXTO ──────────────────────────────────────────────────────────────────
  if (!CSV_MODE) {
    const W = 115
    const sep = '═'.repeat(W)
    const lin = '─'.repeat(W)

    const printSection = (title, subset) => {
      if (!subset.length) return
      console.log(`\n  ${title}  (${subset.length})`)
      console.log('  ' + lin)
      console.log(
        '  ' +
        'Referido (email)'.padEnd(38) +
        'Ventas'.padEnd(8) +
        'Total MXN'.padEnd(14) +
        'Referidor (nombre / email)'
      )
      console.log('  ' + lin)
      for (const r of subset) {
        const ref   = r.referido_email.slice(0, 36).padEnd(38)
        const vnt   = String(r.ventas_count).padEnd(8)
        const tot   = `$${r.ventas_total.toLocaleString('es-MX')}`.padEnd(14)
        const quien = r.referidor_match
          ? `${r.referidor_nombre}  <${r.referidor_email}>`
          : '⚠️  referral_id sin match'
        console.log(`  ${ref}${vnt}${tot}${quien}`)
      }
    }

    console.log('\n' + sep)
    console.log('  REPORTE DE REFERIDOS — PAGO')
    console.log(sep)

    printSection('✅ APTOS DE COBRAR — referido tiene ventas', aptos)
    printSection('⏳ SIN VENTAS AÚN — referido no ha vendido', sinVent)
    printSection('⚠️  REFERRAL SIN MATCH — referral_id no corresponde a ningún afiliado', sinMatch)

    console.log('\n' + lin)
    console.log(`  Total referidos:          ${rows.length}`)
    console.log(`  Aptos de cobrar:          ${aptos.length}`)
    console.log(`  Sin ventas aún:           ${sinVent.length}`)
    console.log(`  Sin match en referral_id: ${sinMatch.length}`)
    console.log(sep)
    return
  }

  // ── CSV ────────────────────────────────────────────────────────────────────
  const headers = [
    'referido_shopify_id', 'referido_email',
    'ventas_count', 'ventas_total_mxn', 'apto_cobrar',
    'referidor_shopify_id', 'referidor_nombre', 'referidor_email',
  ]
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csvLines = [
    headers.join(','),
    ...rows.map(r => [
      r.referido_shopify_id,
      escape(r.referido_email),
      r.ventas_count,
      r.ventas_total,
      r.apto_cobrar ? 'sí' : 'no',
      r.referidor_shopify_id,
      escape(r.referidor_nombre),
      escape(r.referidor_email),
    ].join(',')),
  ]

  const filename = `referrals_${new Date().toISOString().slice(0, 10)}.csv`
  writeFileSync(filename, csvLines.join('\n'), 'utf8')
  console.log(`\n✅ CSV guardado → ${filename}  (${rows.length} filas)`)
  console.log(`   aptos de cobrar: ${aptos.length}  |  sin ventas: ${sinVent.length}  |  sin match: ${sinMatch.length}`)
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
