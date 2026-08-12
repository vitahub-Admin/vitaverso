// scripts/backfill_commission_history_bq.js
// Migra historial de comisiones desde BigQuery → product_commission_history en Supabase.
// Solo lectura de BQ — inserta en Supabase.
// Uso: node --env-file=.env scripts/backfill_commission_history_bq.js

import 'dotenv/config'
import { BigQuery } from '@google-cloud/bigquery'
import { createClient } from '@supabase/supabase-js'

const bigquery = new BigQuery({
  projectId: process.env.GOOGLE_PROJECT_ID,
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const QUERY = `
  SELECT
    variant_id,
    comission AS commission_percent,
    updated_at
  FROM \`vitahub-435120.Shopify.product_comission\`
  WHERE variant_id IS NOT NULL
  ORDER BY variant_id, updated_at
`

const BATCH = 500

async function main() {
  // Cargar mapa variant_id → product_id desde Supabase
  console.log('Cargando variant→product desde Supabase...')
  const { data: existing, error: supErr } = await supabase
    .from('product_variant_commissions')
    .select('variant_id, product_id')
  if (supErr) throw supErr
  const productMap = {}
  for (const r of existing) productMap[String(r.variant_id)] = r.product_id

  console.log('Consultando BigQuery...')
  const [rows] = await bigquery.query({ query: QUERY, location: 'us-east1' })
  console.log(`Total registros BQ: ${rows.length}\n`)

  let inserted = 0
  let errors   = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk   = rows.slice(i, i + BATCH)
    const records = chunk.map(row => ({
      variant_id:         Number(row.variant_id),
      product_id:         productMap[String(row.variant_id)] || 0,
      commission_percent: Number(row.commission_percent) * 100,
      recorded_at:        row.updated_at?.value || row.updated_at,
      source:             'bq',
    }))

    const { error } = await supabase
      .from('product_commission_history')
      .upsert(records, { onConflict: 'variant_id,recorded_at', ignoreDuplicates: true })

    if (error) {
      console.error(`  ✗ Error batch ${Math.floor(i / BATCH) + 1}:`, error.message)
      errors++
    } else {
      inserted += records.length
      console.log(`Batch ${Math.floor(i / BATCH) + 1}: ${records.length} registros (total: ${inserted})`)
    }
  }

  console.log(`\n✅ Listo — ${inserted} procesados, ${errors} errores`)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
