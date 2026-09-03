// scripts/sort_coleccion_aniversario.js
// Reordena la colección Aniversario dejando arriba los productos con mayor % de descuento
// (descuento = (compare_at_price - price) / compare_at_price, el mayor entre las variantes).
//
// Uso: node --env-file=.env scripts/sort_coleccion_aniversario.js
// Flags:
//   --dry-run       Muestra el orden que quedaría, sin escribir
//   --id=N          ID numérico de la colección (default: 660037927233)

const DRY_RUN = process.argv.includes('--dry-run')
const idArg   = process.argv.find(a => a.startsWith('--id='))
const COLL_ID = idArg ? idArg.split('=')[1] : '660037927233'
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

// ── 1. Colección + sortOrder ──────────────────────────────────

async function getColeccion() {
  const data = await gql(`
    query($id: ID!) {
      collection(id: $id) {
        id title handle sortOrder
        ruleSet { rules { column } }
        productsCount { count }
      }
    }
  `, { id: COLL_GID })
  return data.collection
}

// ── 2. Productos con precios (paginado) ───────────────────────

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
              variants(first: 50) {
                nodes { price compareAtPrice }
              }
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

// % de descuento del producto: el mayor entre sus variantes
function calcDescuento(product) {
  let max = 0
  for (const v of product.variants.nodes) {
    const price = Number(v.price)
    const compare = Number(v.compareAtPrice || 0)
    if (compare > price && compare > 0) {
      const d = (compare - price) / compare * 100
      if (d > max) max = d
    }
  }
  return Math.round(max * 10) / 10
}

// ── 3. Reordenar (moves en lotes de 250) ──────────────────────

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
  console.log('=== Reordenar colección por descuento ===')
  console.log(`  Colección ID: ${COLL_ID}${DRY_RUN ? ' | MODO DRY-RUN' : ''}\n`)

  const col = await getColeccion()
  if (!col) { console.error(`❌ No existe colección ${COLL_ID}`); process.exit(1) }
  if (col.ruleSet) { console.error(`❌ "${col.title}" es automática — el orden manual requiere colección manual.`); process.exit(1) }
  console.log(`  ✓ "${col.title}" (${col.productsCount.count} productos, orden actual: ${col.sortOrder})\n`)

  console.log('Cargando productos y precios...')
  const productos = await getProductos()

  const conDescuento = productos.map(p => ({ ...p, descuento: calcDescuento(p) }))
  // Mayor descuento primero; a igual descuento conserva el orden actual (sort estable)
  const ordenados = [...conDescuento].sort((a, b) => b.descuento - a.descuento)

  const top = ordenados.slice(0, 15)
  console.log('\n── Top 15 que quedarían arriba ──')
  for (const p of top) console.log(`  ${p.descuento}%  ${p.title.slice(0, 70)}`)
  const sinDesc = ordenados.filter(p => p.descuento === 0).length
  console.log(`\n  Productos sin descuento (van al final): ${sinDesc}/${ordenados.length}`)

  if (DRY_RUN) { console.log('\n✅ Dry-run completo — sin cambios escritos'); return }

  // Cambiar sortOrder a MANUAL si hace falta (requisito para reordenar)
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

  console.log('\n✅ Listo. El reorden corre como job en Shopify — puede tardar ~1 min en reflejarse en la tienda.')
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
