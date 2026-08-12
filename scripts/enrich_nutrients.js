// scripts/enrich_nutrients.js
// Extrae datos nutricionales del HTML de Shopify y los guarda en product_catalog.
// Usa Cheerio para parsear la tabla nutricional — sin LLM, sin costo de API.
// Solo procesa productos con nutrients = null (seguro re-correr).
//
// Uso: node --env-file=.env scripts/enrich_nutrients.js
// Flags opcionales:
//   --dry-run   Muestra qué procesaría sin escribir a Supabase
//   --limit=N   Máximo N productos (útil para probar)

import 'dotenv/config'
import * as cheerio from 'cheerio'
import { createClient } from '@supabase/supabase-js'

// ─── Config ───────────────────────────────────────────────────────────────────

const GQL_URL   = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`
const GQL_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const DRY_RUN = process.argv.includes('--dry-run')
const limitArg = process.argv.find(a => a.startsWith('--limit='))
const LIMIT    = limitArg ? parseInt(limitArg.split('=')[1]) : Infinity

if (DRY_RUN) console.log('⚡ DRY RUN — sin escrituras a Supabase\n')

// ─── Shopify GQL helper ───────────────────────────────────────────────────────

async function gql(query, variables = {}) {
  const res  = await fetch(GQL_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
    body:    JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ─── Traer todos los productos con descriptionHtml ───────────────────────────

const PRODUCTS_QUERY = `
  query getProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          descriptionHtml
        }
      }
    }
  }
`

async function fetchAllShopifyProducts() {
  const products = []
  let cursor = null
  let page   = 0

  while (true) {
    page++
    const data = await gql(PRODUCTS_QUERY, { cursor })
    const conn = data.products

    for (const { node } of conn.edges) {
      products.push({
        id:    parseInt(node.id.split('/').at(-1)),
        title: node.title,
        html:  node.descriptionHtml || '',
      })
    }

    process.stdout.write(`\r  Shopify: ${products.length} productos...`)

    if (!conn.pageInfo.hasNextPage) break
    cursor = conn.pageInfo.endCursor
    await sleep(300)
  }

  console.log()
  return products
}

// ─── Parsear "1,000 mg" → { amount: 1000, unit: "mg" } ──────────────────────

function parseAmountUnit(str) {
  if (!str) return { amount: null, unit: null }
  const clean = str.trim()

  // Buscar patrón: número (con comas o punto) seguido de unidad
  const match = clean.match(/^([0-9][0-9,._]*)\s*([a-zA-Záéíóúüg%μµ]+)?/)
  if (!match) return { amount: null, unit: null }

  const amount = parseFloat(match[1].replace(/,/g, ''))
  const unit   = match[2]?.toLowerCase().trim() || null
  return { amount: isNaN(amount) ? null : amount, unit }
}

// ─── Parsear "%" del valor diario ────────────────────────────────────────────

function parseDailyValue(str) {
  if (!str) return null
  const clean = str.trim()
  if (clean === '*' || clean === 'N/A' || clean === '†' || clean === '-') return null
  const num = parseFloat(clean.replace('%', ''))
  return isNaN(num) ? null : num
}

// ─── Extraer nutrientes de HTML con Cheerio ───────────────────────────────────

function extractNutrientsFromHtml(html) {
  if (!html) return null

  const $ = cheerio.load(html)
  const nutritionRx = /componente|nutriente|ingrediente|porci[oó]n|valor\s+diario|cantidad/i

  // Buscar todas las tablas y quedarse con la nutricional
  let targetTable = null

  $('table').each((_, table) => {
    const text = $(table).text()
    if (nutritionRx.test(text)) {
      targetTable = table
      return false // break
    }
  })

  if (!targetTable) return null

  const nutrients = []

  // Leer filas del tbody (o todas las tr si no hay tbody)
  const rows = $(targetTable).find('tbody tr').length
    ? $(targetTable).find('tbody tr')
    : $(targetTable).find('tr').slice(1) // saltear header

  rows.each((_, row) => {
    const cells = $(row).find('td')
    if (cells.length < 2) return

    const name     = $(cells[0]).text().trim()
    const amtRaw   = $(cells[1]).text().trim()
    const dvRaw    = cells.length >= 3 ? $(cells[2]).text().trim() : ''

    if (!name) return

    const { amount, unit } = parseAmountUnit(amtRaw)
    const daily_value_pct  = parseDailyValue(dvRaw)

    nutrients.push({ name, amount, unit, daily_value_pct })
  })

  if (!nutrients.length) return null

  // El primero (o el de mayor amount) es el ingrediente principal
  const primary = nutrients[0]

  return {
    nutrients,
    primary_ingredient: primary.name,
    primary_amount:     primary.amount,
    primary_unit:       primary.unit,
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📂 Leyendo product_catalog de Supabase (paginado)...')
  const catalogRows = []
  const PAGE = 1000
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('product_catalog')
      .select('product_id, nutrients')
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`Supabase: ${error.message}`)
    if (!data?.length) break
    catalogRows.push(...data)
    process.stdout.write(`\r  Leídos: ${catalogRows.length} registros...`)
    if (data.length < PAGE) break
    from += PAGE
  }
  console.log()

  const allCatalogIds = new Set(catalogRows.map(r => r.product_id))
  const enrichedIds   = new Set(catalogRows.filter(r => r.nutrients != null).map(r => r.product_id))
  const pendingSet    = new Set([...allCatalogIds].filter(id => !enrichedIds.has(id)))

  console.log(`  Catálogo total:    ${allCatalogIds.size} product_ids únicos`)
  console.log(`  Ya enriquecidos:   ${enrichedIds.size}`)
  console.log(`  Pendientes:        ${pendingSet.size}`)

  if (pendingSet.size === 0) {
    console.log('\n✅ Todo el catálogo ya está enriquecido.')
    return
  }

  console.log('\n📦 Descargando productos de Shopify...')
  const shopifyProducts = await fetchAllShopifyProducts()
  console.log(`  Total en Shopify:  ${shopifyProducts.length} productos`)

  const toProcess = shopifyProducts
    .filter(p => pendingSet.has(p.id))
    .slice(0, LIMIT === Infinity ? undefined : LIMIT)

  console.log(`  A procesar ahora:  ${toProcess.length} productos\n`)

  if (toProcess.length === 0) {
    console.log('ℹ️  Ningún producto pendiente encontrado en Shopify.')
    return
  }

  let processed = 0, skipped = 0, errors = 0

  for (let i = 0; i < toProcess.length; i++) {
    const product  = toProcess[i]
    const progress = `[${String(i + 1).padStart(String(toProcess.length).length)}/${toProcess.length}]`

    const result = extractNutrientsFromHtml(product.html)

    if (!result) {
      console.log(`${progress} ⏭️  Sin tabla  — ${product.title.slice(0, 60)}`)
      skipped++
      continue
    }

    if (DRY_RUN) {
      const primStr = `${result.primary_ingredient} ${result.primary_amount ?? ''}${result.primary_unit ?? ''}`
      console.log(`${progress} ✅ ${result.nutrients.length} nutr. | ${primStr} — ${product.title.slice(0, 50)}`)
      processed++
      continue
    }

    try {
      const { error: upErr } = await supabase
        .from('product_catalog')
        .update({
          nutrients:          result.nutrients,
          primary_ingredient: result.primary_ingredient,
          primary_amount:     result.primary_amount ?? null,
          primary_unit:       result.primary_unit   ?? null,
        })
        .eq('product_id', product.id)

      if (upErr) throw new Error(upErr.message)

      const primStr = `${result.primary_ingredient} ${result.primary_amount ?? ''}${result.primary_unit ?? ''}`
      console.log(`${progress} ✅ ${result.nutrients.length} nutr. | ${primStr.trim()} — ${product.title.slice(0, 45)}`)
      processed++
    } catch (err) {
      console.log(`${progress} ❌ Error: ${err.message} — ${product.title.slice(0, 50)}`)
      errors++
    }
  }

  console.log('\n' + '─'.repeat(55))
  console.log('🎉 Proceso terminado')
  console.log(`   ✅ Enriquecidos:  ${processed}`)
  console.log(`   ⏭️  Sin tabla:     ${skipped}`)
  console.log(`   ❌ Errores:       ${errors}`)
  console.log(`   💸 Costo API:     $0.00 (Cheerio, sin LLM)`)
}

main().catch(err => {
  console.error('\n💥 Error fatal:', err.message)
  process.exit(1)
})
