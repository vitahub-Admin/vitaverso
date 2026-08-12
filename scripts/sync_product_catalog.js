// scripts/sync_product_catalog.js
// Sincroniza catálogo de productos desde Shopify → Supabase (product_catalog).
// Trae: variant_id, product_id, title, variant_title, sku, price, componente.
// El componente viene de custom.compuesto_principal (lista de metaobjects → texto plano).
//
// Uso: node --env-file=.env scripts/sync_product_catalog.js

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const GQL_URL   = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`
const GQL_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
    body:    JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── 1. Traer productos con compuesto_principal ────────────────

const PRODUCTS_QUERY = `
  query getProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          compuestoPrincipal: metafield(namespace: "custom", key: "compuesto_principal") {
            value
          }
          marcaLista: metafield(namespace: "custom", key: "marca_lista") {
            value
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                price
              }
            }
          }
        }
      }
    }
  }
`

async function fetchAllProducts() {
  const products = []
  let cursor = null
  let page   = 0

  while (true) {
    page++
    const data = await gql(PRODUCTS_QUERY, { cursor })
    const { edges, pageInfo } = data.products

    for (const { node: p } of edges) {
      products.push(p)
    }

    console.log(`  Página ${page}: ${products.length} productos`)
    if (!pageInfo.hasNextPage) break
    cursor = pageInfo.endCursor
    await sleep(300)
  }

  return products
}

// ── 2. Resolver GIDs de metaobjects (compuesto) ───────────────

async function resolveMetaobjectGids(gids) {
  if (!gids.size) return {}

  const gidList = [...gids]
  const result  = {}

  // Batch de 50 por request
  for (let i = 0; i < gidList.length; i += 50) {
    const chunk   = gidList.slice(i, i + 50)
    const aliases = chunk.map((gid, idx) =>
      `m${idx}: node(id: "${gid}") {
        ... on Metaobject {
          nombre: field(key: "nombre") { value }
          name:   field(key: "name")   { value }
        }
      }`
    ).join('\n')

    const data = await gql(`{ ${aliases} }`)

    chunk.forEach((gid, idx) => {
      const node = data?.[`m${idx}`]
      result[gid] = node?.nombre?.value || node?.name?.value || ''
    })

    await sleep(200)
  }

  return result
}

// ── 3. Transformar y upsert ───────────────────────────────────

async function main() {
  console.log('Obteniendo productos de Shopify...')
  const products = await fetchAllProducts()
  console.log(`  ${products.length} productos totales\n`)

  // Helper: extraer primer GID de un metafield tipo lista o string directo
  function extractFirstGid(raw) {
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed[0]
      if (typeof parsed === 'string' && parsed.startsWith('gid://')) return parsed
    } catch {
      if (raw.startsWith('gid://')) return raw
    }
    return null
  }

  // Recolectar GIDs únicos de compuesto_principal + marca_lista
  const allGids = new Set()
  for (const p of products) {
    const compGid  = extractFirstGid(p.compuestoPrincipal?.value)
    const marcaGid = extractFirstGid(p.marcaLista?.value)
    if (compGid)  allGids.add(compGid)
    if (marcaGid) allGids.add(marcaGid)
  }

  console.log(`Resolviendo ${allGids.size} metaobjects únicos (componentes + marcas)...`)
  const gidMap = await resolveMetaobjectGids(allGids)
  console.log(`  Resueltos: ${Object.values(gidMap).filter(Boolean).length}`)

  // Construir filas para upsert
  const rows = []
  let sinComponente = 0

  for (const p of products) {
    const productId = Number(p.id.replace('gid://shopify/Product/', ''))

    // Resolver componente y marca
    const compGid  = extractFirstGid(p.compuestoPrincipal?.value)
    const marcaGid = extractFirstGid(p.marcaLista?.value)
    const componente = compGid  ? (gidMap[compGid]  || null) : null
    const brand      = marcaGid ? (gidMap[marcaGid] || null) : null

    if (!componente) sinComponente++

    for (const { node: v } of p.variants.edges) {
      const variantId = Number(v.id.replace('gid://shopify/ProductVariant/', ''))
      rows.push({
        variant_id:    variantId,
        product_id:    productId,
        title:         p.title,
        variant_title: v.title === 'Default Title' ? null : v.title,
        sku:           v.sku || null,
        price:         Number(v.price) || null,
        componente,
        brand,
        synced_at:     new Date().toISOString(),
      })
    }
  }

  console.log(`\n  ${rows.length} variantes listas`)
  console.log(`  Sin componente: ${sinComponente} productos\n`)

  // Upsert en batches de 500
  const BATCH = 500
  let upserted = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from('product_catalog')
      .upsert(chunk, { onConflict: 'variant_id' })

    if (error) throw error
    upserted += chunk.length
    console.log(`  Batch ${Math.floor(i / BATCH) + 1}: ${upserted}/${rows.length} upserted`)
  }

  // Resumen de componentes únicos
  const componenteCounts = {}
  rows.forEach(r => {
    if (r.componente) componenteCounts[r.componente] = (componenteCounts[r.componente] || 0) + 1
  })
  const sorted = Object.entries(componenteCounts).sort((a, b) => b[1] - a[1])

  console.log(`\n── Componentes encontrados (${sorted.length}) ──`)
  sorted.forEach(([c, n]) => console.log(`  ${c.padEnd(30)} ${n} variantes`))
  console.log(`\n✅ Sync completo — ${upserted} variantes en product_catalog`)
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
