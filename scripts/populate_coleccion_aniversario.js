// scripts/populate_coleccion_aniversario.js
// One-off: lee SKUs de "coleccion aniversario.csv" (root del proyecto),
// los resuelve a productos vía Admin GraphQL y los agrega a la colección destino.
//
// Uso: node --env-file=.env scripts/populate_coleccion_aniversario.js
// Flags:
//   --dry-run       Resuelve y muestra qué agregaría, sin escribir
//   --id=N          ID numérico de la colección destino (default: 660037927233)
//   --file=path     Archivo de SKUs (default: coleccion aniversario.csv)

import fs from 'node:fs'
import path from 'node:path'

const DRY_RUN  = process.argv.includes('--dry-run')
const idArg    = process.argv.find(a => a.startsWith('--id='))
const fileArg  = process.argv.find(a => a.startsWith('--file='))
const COLL_ID  = idArg ? idArg.split('=')[1] : '660037927233'
const SKU_FILE = fileArg ? fileArg.split('=')[1] : 'coleccion aniversario.csv'

if (!/^\d+$/.test(COLL_ID)) {
  console.error('❌ --id debe ser el ID numérico de la colección (el número de la URL del admin)')
  process.exit(1)
}
const COLL_GID = `gid://shopify/Collection/${COLL_ID}`

const STORE = (process.env.SHOPIFY_STORE || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

if (!STORE || !TOKEN) {
  console.error('❌ Faltan SHOPIFY_STORE o SHOPIFY_ACCESS_TOKEN en .env')
  process.exit(1)
}

const API_URL = `https://${STORE}/admin/api/2024-10/graphql.json`

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function gql(query, variables = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  })

  if (res.status === 429) {
    await sleep(2000)
    return gql(query, variables)
  }

  const json = await res.json()
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`)
  return json.data
}

// ── 1. Leer SKUs del archivo ──────────────────────────────────

function leerSkus() {
  const raw = fs.readFileSync(path.resolve(SKU_FILE), 'utf-8')
  const skus = [...new Set(
    raw.split(/\r?\n/)
      .map(l => l.split(',')[0].trim())
      .filter(Boolean)
  )]
  return skus
}

// ── 2. Traer la colección destino por ID ──────────────────────

async function buscarColeccion() {
  const data = await gql(`
    query($id: ID!) {
      collection(id: $id) {
        id
        title
        handle
        ruleSet { rules { column } }
        productsCount { count }
      }
    }
  `, { id: COLL_GID })

  return data.collection
}

// ── 3. Resolver SKUs → product IDs (lotes de 40 por query) ────

async function resolverSkus(skus) {
  const skuToProduct = new Map()
  const BATCH = 40

  for (let i = 0; i < skus.length; i += BATCH) {
    const chunk = skus.slice(i, i + BATCH)
    const q = chunk.map(s => `sku:${s}`).join(' OR ')

    const data = await gql(`
      query($q: String!) {
        productVariants(first: 100, query: $q) {
          nodes {
            sku
            product { id title }
          }
        }
      }
    `, { q })

    for (const v of data.productVariants.nodes) {
      if (v.sku) skuToProduct.set(v.sku.trim(), v.product)
    }

    console.log(`  Resueltos ${Math.min(i + BATCH, skus.length)}/${skus.length} SKUs...`)
    await sleep(300)
  }

  return skuToProduct
}

// ── 4. Agregar productos a la colección (lotes de 250) ────────

async function agregarProductos(collectionId, productIds) {
  const BATCH = 250

  for (let i = 0; i < productIds.length; i += BATCH) {
    const chunk = productIds.slice(i, i + BATCH)
    const data = await gql(`
      mutation($id: ID!, $productIds: [ID!]!) {
        collectionAddProducts(id: $id, productIds: $productIds) {
          userErrors { field message }
        }
      }
    `, { id: collectionId, productIds: chunk })

    const errs = data.collectionAddProducts.userErrors
    if (errs.length) throw new Error(`collectionAddProducts: ${JSON.stringify(errs)}`)

    console.log(`  Agregados ${Math.min(i + BATCH, productIds.length)}/${productIds.length} productos`)
    await sleep(500)
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('=== Poblar colección aniversario ===')
  console.log(`  Archivo: ${SKU_FILE} | Colección ID: ${COLL_ID}${DRY_RUN ? ' | MODO DRY-RUN' : ''}\n`)

  const skus = leerSkus()
  console.log(`SKUs leídos: ${skus.length}\n`)

  console.log(`Buscando colección ${COLL_ID}...`)
  const coleccion = await buscarColeccion()

  if (!coleccion) {
    console.error(`❌ No existe una colección con ID ${COLL_ID} (¿la borraste o el ID está mal?)`)
    process.exit(1)
  }
  if (coleccion.ruleSet) {
    console.error(`❌ "${coleccion.title}" es una colección AUTOMÁTICA (smart) — no se le pueden agregar productos por API. Debe ser manual.`)
    process.exit(1)
  }
  console.log(`  ✓ "${coleccion.title}" (handle: ${coleccion.handle}, manual, ${coleccion.productsCount.count} productos actuales)\n`)

  console.log('Resolviendo SKUs a productos...')
  const skuToProduct = await resolverSkus(skus)

  const noEncontrados = skus.filter(s => !skuToProduct.has(s))
  const productIds = [...new Set([...skuToProduct.values()].map(p => p.id))]

  console.log(`\n  SKUs encontrados:     ${skus.length - noEncontrados.length}/${skus.length}`)
  console.log(`  Productos únicos:     ${productIds.length} (varios SKUs pueden ser variantes del mismo producto)`)

  if (noEncontrados.length) {
    console.log(`\n── ${noEncontrados.length} SKUs NO encontrados en Shopify ──`)
    for (const s of noEncontrados) console.log(`  ${s}`)
  }

  if (DRY_RUN) {
    console.log('\n✅ Dry-run completo — sin cambios escritos')
    return
  }

  console.log(`\nAgregando ${productIds.length} productos a "${coleccion.title}"...`)
  await agregarProductos(coleccion.id, productIds)

  console.log('\n=== Resumen final ===')
  console.log(`  SKUs procesados:   ${skus.length}`)
  console.log(`  SKUs sin match:    ${noEncontrados.length}`)
  console.log(`  Productos en colección: ${productIds.length} agregados`)
  console.log('\n✅ Listo. Revisa la colección en Shopify admin.')
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
