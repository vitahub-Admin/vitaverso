// scripts/sync_tag_coleccion.js
// Sincroniza un tag para que sea espejo EXACTO de una colección:
//   - agrega el tag a los productos de la colección que no lo tienen
//   - se lo quita a los productos que lo tienen pero NO están en la colección
//
// Uso: node --env-file=.env scripts/sync_tag_coleccion.js
// Flags:
//   --dry-run       Muestra qué haría, sin escribir
//   --tag=nombre    Tag a sincronizar (default: vitadeals)
//   --id=N          ID numérico de la colección fuente (default: 660037927233 = Aniversario)

const DRY_RUN = process.argv.includes('--dry-run')
const idArg   = process.argv.find(a => a.startsWith('--id='))
const tagArg  = process.argv.find(a => a.startsWith('--tag='))
const COLL_ID = idArg ? idArg.split('=')[1] : '660037927233'
const TAG     = tagArg ? tagArg.split('=')[1] : 'vitadeals'
const COLL_GID = `gid://shopify/Collection/${COLL_ID}`

const STORE = (process.env.SHOPIFY_STORE || '').replace(/^https?:\/\//, '').replace(/\/$/, '')
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
if (!STORE || !TOKEN) { console.error('❌ Faltan SHOPIFY_STORE o SHOPIFY_ACCESS_TOKEN'); process.exit(1) }

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
  if (json.errors) {
    if (json.errors.some(e => e.extensions?.code === 'THROTTLED')) { await sleep(2000); return gql(query, variables) }
    throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`)
  }
  return json.data
}

// ── 1. Productos de la colección ──────────────────────────────
async function productosDeColeccion() {
  const ids = new Map() // id → title
  let cursor = null
  while (true) {
    const data = await gql(`
      query($id: ID!, $cursor: String) {
        collection(id: $id) {
          title
          products(first: 250, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { id title tags }
          }
        }
      }
    `, { id: COLL_GID, cursor })
    if (!data.collection) { console.error(`❌ No existe colección ${COLL_ID}`); process.exit(1) }
    if (!cursor) console.log(`Colección fuente: "${data.collection.title}"`)
    const page = data.collection.products
    for (const p of page.nodes) ids.set(p.id, p)
    if (!page.pageInfo.hasNextPage) break
    cursor = page.pageInfo.endCursor
    await sleep(300)
  }
  return ids
}

// ── 2. Productos con el tag en TODA la tienda ─────────────────
async function productosConTag() {
  const out = []
  let cursor = null
  while (true) {
    const data = await gql(`
      query($q: String!, $cursor: String) {
        products(first: 250, query: $q, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes { id title }
        }
      }
    `, { q: `tag:${TAG}`, cursor })
    out.push(...data.products.nodes)
    if (!data.products.pageInfo.hasNextPage) break
    cursor = data.products.pageInfo.endCursor
    await sleep(300)
  }
  return out
}

async function aplicarTag(productId, mutation) {
  const data = await gql(`
    mutation($id: ID!, $tags: [String!]!) {
      ${mutation}(id: $id, tags: $tags) { userErrors { field message } }
    }
  `, { id: productId, tags: [TAG] })
  const errs = data[mutation].userErrors
  if (errs.length) throw new Error(`${mutation} ${productId}: ${JSON.stringify(errs)}`)
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  console.log(`=== Sincronizar tag "${TAG}" ⇄ colección ${COLL_ID}${DRY_RUN ? ' | DRY-RUN' : ''} ===\n`)

  const enColeccion = await productosDeColeccion()
  const conTag = await productosConTag()
  const conTagIds = new Set(conTag.map(p => p.id))

  const paraAgregar = [...enColeccion.values()].filter(p => !p.tags.includes(TAG))
  const paraQuitar  = conTag.filter(p => !enColeccion.has(p.id))

  console.log(`En colección: ${enColeccion.size} | Con tag en tienda: ${conTag.length}`)
  console.log(`→ Agregar tag a: ${paraAgregar.length}`)
  console.log(`→ Quitar tag a:  ${paraQuitar.length}\n`)

  if (DRY_RUN) {
    if (paraQuitar.length) {
      console.log('── Se les quitaría el tag ──')
      for (const p of paraQuitar) console.log(`  ${p.title.slice(0, 75)}`)
    }
    if (paraAgregar.length) {
      console.log('\n── Se les agregaría el tag ──')
      for (const p of paraAgregar) console.log(`  ${p.title.slice(0, 75)}`)
    }
    console.log('\n✅ Dry-run completo — sin cambios escritos')
    return
  }

  let done = 0
  for (const p of paraQuitar) {
    await aplicarTag(p.id, 'tagsRemove')
    if (++done % 25 === 0) console.log(`  quitados ${done}/${paraQuitar.length}...`)
    await sleep(150)
  }
  console.log(`✓ Tag quitado a ${paraQuitar.length} productos`)

  done = 0
  for (const p of paraAgregar) {
    await aplicarTag(p.id, 'tagsAdd')
    if (++done % 25 === 0) console.log(`  agregados ${done}/${paraAgregar.length}...`)
    await sleep(150)
  }
  console.log(`✓ Tag agregado a ${paraAgregar.length} productos`)
  console.log(`\n✅ Tag "${TAG}" sincronizado: exactamente los ${enColeccion.size} de la colección.`)
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
