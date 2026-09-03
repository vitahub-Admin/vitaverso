// scripts/sort_top_aniversario.js
// Reordena la colección Aniversario: primero los SKUs de "top aniversario.csv"
// agrupados A → B → C, después el resto. Dentro de cada grupo (y en el resto)
// se conserva el orden ACTUAL de la colección (la base de más vendidos ya aplicada).
//
// Uso: node --env-file=.env scripts/sort_top_aniversario.js
// Flags:
//   --dry-run       Muestra el orden que quedaría, sin escribir
//   --id=N          ID numérico de la colección (default: 660037927233)
//   --file=path     CSV con columnas SKU y ABC (default: top aniversario.csv)

import fs from 'node:fs'
import path from 'node:path'

const DRY_RUN  = process.argv.includes('--dry-run')
const idArg    = process.argv.find(a => a.startsWith('--id='))
const fileArg  = process.argv.find(a => a.startsWith('--file='))
const COLL_ID  = idArg ? idArg.split('=')[1] : '660037927233'
const CSV_FILE = fileArg ? fileArg.split('=')[1] : 'top aniversario.csv'
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
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status === 429) { await sleep(2000); return gql(query, variables) }
  const json = await res.json()
  if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`)
  return json.data
}

// ── 1. Leer CSV (parser mínimo con soporte de comillas) ───────

function parseCsvLine(line) {
  const out = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') inQ = false
      else cur += ch
    } else {
      if (ch === '"') inQ = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

function leerGrupos() {
  const raw = fs.readFileSync(path.resolve(CSV_FILE), 'utf-8')
  const lines = raw.split(/\r?\n/).filter(l => l.trim())
  const header = parseCsvLine(lines[0]).map(h => h.trim().toUpperCase())
  const iSku = header.indexOf('SKU')
  const iAbc = header.indexOf('ABC')
  if (iSku === -1 || iAbc === -1) throw new Error(`El CSV debe tener columnas SKU y ABC (tiene: ${header.join(', ')})`)

  const grupos = new Map() // SKU (upper) → 'A' | 'B' | 'C'
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line)
    const sku = (cols[iSku] || '').trim().toUpperCase()
    const abc = (cols[iAbc] || '').trim().toUpperCase()
    if (!sku || !['A', 'B', 'C'].includes(abc)) continue
    grupos.set(sku, abc)
  }
  return grupos
}

// ── 2. Colección + productos en orden actual (con SKUs) ───────

async function getColeccion() {
  const data = await gql(`
    query($id: ID!) {
      collection(id: $id) {
        id title sortOrder
        ruleSet { rules { column } }
        productsCount { count }
      }
    }
  `, { id: COLL_GID })
  return data.collection
}

async function getProductos() {
  const productos = []
  let cursor = null

  while (true) {
    const data = await gql(`
      query($id: ID!, $cursor: String) {
        collection(id: $id) {
          products(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes {
              id
              title
              variants(first: 50) { nodes { sku } }
            }
          }
        }
      }
    `, { id: COLL_GID, cursor })

    const page = data.collection.products
    productos.push(...page.nodes)
    console.log(`  ${productos.length} productos cargados...`)
    if (!page.pageInfo.hasNextPage) break
    cursor = page.pageInfo.endCursor
    await sleep(300)
  }

  return productos
}

// Grupo del producto: la mejor letra entre sus variantes (A > B > C), o null
function grupoDe(product, grupos) {
  let mejor = null
  for (const v of product.variants.nodes) {
    const g = grupos.get((v.sku || '').trim().toUpperCase())
    if (g && (!mejor || g < mejor)) mejor = g
  }
  return mejor
}

// ── 3. Reordenar ──────────────────────────────────────────────

async function reordenar(ordenados) {
  const moves = ordenados.map((p, idx) => ({ id: p.id, newPosition: String(idx) }))
  const BATCH = 250

  for (let i = 0; i < moves.length; i += BATCH) {
    const chunk = moves.slice(i, i + BATCH)
    const data = await gql(`
      mutation($id: ID!, $moves: [MoveInput!]!) {
        collectionReorderProducts(id: $id, moves: $moves) {
          job { id }
          userErrors { field message }
        }
      }
    `, { id: COLL_GID, moves: chunk })

    const errs = data.collectionReorderProducts.userErrors
    if (errs.length) throw new Error(`collectionReorderProducts: ${JSON.stringify(errs)}`)
    console.log(`  Reordenados ${Math.min(i + BATCH, moves.length)}/${moves.length}`)
    await sleep(1000)
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log('=== Reordenar colección: top ABC + más vendidos ===')
  console.log(`  Colección ID: ${COLL_ID} | CSV: ${CSV_FILE}${DRY_RUN ? ' | MODO DRY-RUN' : ''}\n`)

  const grupos = leerGrupos()
  const conteo = { A: 0, B: 0, C: 0 }
  for (const g of grupos.values()) conteo[g]++
  console.log(`SKUs en CSV: ${grupos.size} (A: ${conteo.A}, B: ${conteo.B}, C: ${conteo.C})\n`)

  const col = await getColeccion()
  if (!col) { console.error(`❌ No existe colección ${COLL_ID}`); process.exit(1) }
  if (col.ruleSet) { console.error(`❌ "${col.title}" es automática — requiere colección manual.`); process.exit(1) }
  console.log(`  ✓ "${col.title}" (${col.productsCount.count} productos, orden actual: ${col.sortOrder})\n`)

  console.log('Cargando productos en orden actual...')
  const productos = await getProductos()

  // Rank: A=0, B=1, C=2, resto=3 — sort estable conserva el orden actual dentro de cada grupo
  const rank = { A: 0, B: 1, C: 2 }
  const conGrupo = productos.map(p => ({ ...p, grupo: grupoDe(p, grupos) }))
  const ordenados = [...conGrupo].sort((a, b) => (a.grupo ? rank[a.grupo] : 3) - (b.grupo ? rank[b.grupo] : 3))

  const enCsv = conGrupo.filter(p => p.grupo)
  console.log(`  Productos de la colección que están en el CSV: ${enCsv.length}`)

  // SKUs del CSV que no matchearon ningún producto de la colección
  const skusEnColeccion = new Set()
  for (const p of productos) for (const v of p.variants.nodes) if (v.sku) skusEnColeccion.add(v.sku.trim().toUpperCase())
  const sinMatch = [...grupos.keys()].filter(s => !skusEnColeccion.has(s))
  if (sinMatch.length) {
    console.log(`\n── ${sinMatch.length} SKUs del CSV que NO están en la colección ──`)
    for (const s of sinMatch) console.log(`  ${s} (${grupos.get(s)})`)
  }

  console.log('\n── Top 20 que quedarían arriba ──')
  for (const p of ordenados.slice(0, 20)) console.log(`  [${p.grupo || '-'}] ${p.title.slice(0, 70)}`)

  if (DRY_RUN) { console.log('\n✅ Dry-run completo — sin cambios escritos'); return }

  if (col.sortOrder !== 'MANUAL') {
    console.log(`\nCambiando orden de la colección de ${col.sortOrder} a MANUAL...`)
    const upd = await gql(`
      mutation($input: CollectionInput!) {
        collectionUpdate(input: $input) { userErrors { field message } }
      }
    `, { input: { id: COLL_GID, sortOrder: 'MANUAL' } })
    const errs = upd.collectionUpdate.userErrors
    if (errs.length) throw new Error(`collectionUpdate: ${JSON.stringify(errs)}`)
    await sleep(1500)
  }

  console.log('\nAplicando nuevo orden...')
  await reordenar(ordenados)

  console.log('\n✅ Listo. El reorden corre como job en Shopify — puede tardar ~1 min en reflejarse.')
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
