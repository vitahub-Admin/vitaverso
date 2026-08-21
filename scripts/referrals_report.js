// scripts/referrals_report.js
// Lista afiliados con referral_id y quién es su referidor.
// Modo texto por defecto para inspección. Pasar --csv para exportar archivo.
//
// Uso:
//   node --env-file=.env scripts/referrals_report.js
//   node --env-file=.env scripts/referrals_report.js --csv

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'fs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const CSV_MODE = process.argv.includes('--csv')

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

async function main() {
  console.log('Cargando afiliados...')
  const all = await fetchAllAffiliates()
  console.log(`  ${all.length} afiliados totales`)

  // Índices para cruzar referral_id
  const byShopifyId = {}   // shopify_customer_id (string) → affiliate
  const byId        = {}   // id (string) → affiliate
  const byEmail     = {}   // email → affiliate

  for (const a of all) {
    byShopifyId[String(a.shopify_customer_id)] = a
    byId[String(a.id)] = a
    byEmail[a.email]   = a
  }

  // Filtrar los que tienen referral_id
  const withRef = all.filter(a => a.referral_id && a.referral_id.trim())
  console.log(`  ${withRef.length} afiliados con referral_id`)

  if (!withRef.length) {
    console.log('\nNingún afiliado tiene referral_id registrado.')
    return
  }

  // Cruzar referral_id con la tabla de afiliados
  const rows = withRef.map(a => {
    const ref = (a.referral_id || '').trim()

    // Intentar match por shopify_customer_id, luego por id, luego por email
    const referrer = byShopifyId[ref] || byId[ref] || byEmail[ref] || null

    return {
      // Afiliado referido
      referido_id:          a.shopify_customer_id,
      referido_nombre:      fullName(a),
      referido_email:       a.email,
      referido_status:      a.status || '',
      referido_alta:        a.created_at?.slice(0, 10) || '',
      // Valor crudo del campo
      referral_id_raw:      ref,
      // Referidor resuelto
      referidor_id:         referrer?.shopify_customer_id || '',
      referidor_nombre:     referrer ? fullName(referrer) : '⚠️  no encontrado',
      referidor_email:      referrer?.email || '',
    }
  })

  // ── Texto ──────────────────────────────────────────────────────
  if (!CSV_MODE) {
    const noMatch = rows.filter(r => !r.referidor_id)

    console.log('\n' + '═'.repeat(100))
    console.log('  AFILIADOS CON REFERRAL')
    console.log('═'.repeat(100))
    console.log(
      '  Referido'.padEnd(35) +
      'Referral_id raw'.padEnd(22) +
      'Referidor'.padEnd(35) +
      'Alta'
    )
    console.log('  ' + '─'.repeat(96))

    for (const r of rows) {
      const ref  = r.referido_nombre.slice(0, 33).padEnd(33)
      const raw  = r.referral_id_raw.slice(0, 20).padEnd(20)
      const who  = r.referidor_nombre.slice(0, 33).padEnd(33)
      const date = r.referido_alta
      console.log(`  ${ref}  ${raw}  ${who}  ${date}`)
    }

    console.log('\n' + '─'.repeat(100))
    console.log(`  Total con referral:     ${rows.length}`)
    console.log(`  Referidor encontrado:   ${rows.length - noMatch.length}`)
    console.log(`  Referral_id sin match:  ${noMatch.length}`)

    if (noMatch.length) {
      console.log('\n  ⚠️  referral_ids sin match:')
      for (const r of noMatch) {
        console.log(`     "${r.referral_id_raw}"  (afiliado: ${r.referido_email})`)
      }
    }

    // Ranking de referidores
    const countByReferidor = {}
    for (const r of rows) {
      if (!r.referidor_id) continue
      const key = `${r.referidor_nombre} <${r.referidor_email}>`
      countByReferidor[key] = (countByReferidor[key] || 0) + 1
    }
    const ranking = Object.entries(countByReferidor).sort((a, b) => b[1] - a[1])

    if (ranking.length) {
      console.log('\n  RANKING DE REFERIDORES:')
      for (const [who, n] of ranking) {
        console.log(`     ${n.toString().padStart(3)}  ${who}`)
      }
    }

    console.log('═'.repeat(100))
    return
  }

  // ── CSV ────────────────────────────────────────────────────────
  const headers = [
    'referido_shopify_id', 'referido_nombre', 'referido_email', 'referido_status', 'referido_alta',
    'referral_id_raw',
    'referidor_shopify_id', 'referidor_nombre', 'referidor_email',
  ]
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csvLines = [
    headers.join(','),
    ...rows.map(r => [
      r.referido_id, escape(r.referido_nombre), escape(r.referido_email), r.referido_status, r.referido_alta,
      r.referral_id_raw,
      r.referidor_id, escape(r.referidor_nombre), escape(r.referidor_email),
    ].join(',')),
  ]

  const filename = `referrals_${new Date().toISOString().slice(0, 10)}.csv`
  writeFileSync(filename, csvLines.join('\n'), 'utf8')
  console.log(`\n✅ CSV guardado → ${filename}  (${rows.length} filas)`)
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
