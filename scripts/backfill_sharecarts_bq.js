// scripts/backfill_sharecarts_bq.js
// Migra sharecarts históricos de BigQuery → Supabase.
// Los items individuales no existen en BQ, se guardan como [] y los
// conteos quedan en extra.bq para referencia.
// Uso: node --env-file=.env scripts/backfill_sharecarts_bq.js

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
    code,
    customer_id,
    created_at,
    note,
    phone,
    opens_count,
    items_count,
    items_value,
    currency,
    ip,
    city,
    country,
    continent,
    region,
    timezone,
    latitude,
    longitue AS longitude
  FROM \`vitahub-435120.sharecart.carritos\`
  WHERE code IS NOT NULL AND code != ''
  QUALIFY ROW_NUMBER() OVER (PARTITION BY code ORDER BY created_at DESC) = 1
`

function buildRecord(row) {
  return {
    token:      row.code,
    owner_id:   String(row.customer_id),
    name:       row.note   || null,
    phone:      row.phone  || null,
    items:      [],
    created_at: row.created_at?.value || row.created_at,
    location: {
      ip:        row.ip        || null,
      city:      row.city      || null,
      country:   row.country   || null,
      continent: row.continent || null,
      region:    row.region    || null,
      timezone:  row.timezone  || null,
      latitude:  row.latitude  || null,
      longitude: row.longitude || null,
    },
    extra: {
      bq: {
        opens_count:  row.opens_count  || 0,
        items_count:  row.items_count  || 0,
        items_value:  row.items_value  ? row.items_value / 100 : 0,
        currency:     row.currency     || null,
      },
    },
  }
}

const BATCH = 500

async function main() {
  console.log('Consultando BigQuery...')
  const [rows] = await bigquery.query({ query: QUERY, location: 'us-east1' })
  console.log(`Total registros BQ: ${rows.length}\n`)

  let inserted = 0
  let skipped  = 0
  let errors   = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk   = rows.slice(i, i + BATCH)
    const records = chunk.map(buildRecord)

    const { error } = await supabase
      .from('sharecarts')
      .upsert(records, { onConflict: 'token', ignoreDuplicates: true })

    if (error) {
      console.error(`  ✗ Error batch ${Math.floor(i / BATCH) + 1}:`, error.message)
      errors++
    } else {
      inserted += records.length
      console.log(`Batch ${Math.floor(i / BATCH) + 1}: ${records.length} registros (total: ${inserted})`)
    }
  }

  console.log(`\n✅ Listo — ${inserted} procesados, ${skipped} omitidos, ${errors} errores`)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
