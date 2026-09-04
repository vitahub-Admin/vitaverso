// scripts/tag_coleccion_aniversario.js
// Agrega (o quita) el tag "vitadeals" a todos los productos de la colección Aniversario.
//
// Uso: node --env-file=.env scripts/tag_coleccion_aniversario.js
// Flags:
//   --dry-run       Muestra qué haría, sin escribir
//   --remove        Quita el tag en vez de agregarlo
//   --tag=nombre    Otro tag (default: vitadeals)
//   --id=N          ID numérico de la colección (default: 660037927233)

const DRY_RUN = process.argv.includes('--dry-run')
const REMOVE  = process.argv.includes('--remove')
const idArg   = process.argv.find(a => a.startsWith('--id='))
const tagArg  = process.argv.find(a => a.startsWith('--tag='))
const COLL_ID = idArg ? idArg.split('=')[1] : '660037927233'
const TAG     = tagArg ? tagArg.split('=')[1] : 'vitadeals'
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
  if (json.errors) {
    const throttled = json.errors.some(e => e.extensions?.code === 'THROTTLED')
    if (throttled) { await sleep(2000); return gql(query, variables) }
    throw new Error(`GraphQL: ${JSON.stringify(json.errors)}`)
  }
  return json.data
}

// ── 1. Productos de la colección con sus tags ─────────────────

async function getProductos() {
  const productos = []
  let cursor = null

  while (true) {
    const data = await gql(`
      query($id: ID!, $cursor: String) {
        collection(id: $id) {
          title
          ruleSet { rules { column } }
          products(first: 250, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            nodes { id title tags }
          }
        }
      }
    `, { id: COLL_GID, cursor })

    if (!data.collection) { console.error(`❌ No existe colección ${COLL_ID}`); process.exit(1) }
    if (!cursor) console.log(`  Colección: "${data.collection.title}"`)

    const page = data.collection.products
    productos.push(...page.nodes)
    console.log(`  ${productos.length} productos cargados...`)
    if (!page.pageInfo.hasNextPage) break
    cursor = page.pageInfo.endCursor
    await sleep(300)
  }

  return productos
}

// ── 2. tagsAdd / tagsRemove ───────────────────────────────────

async function aplicarTag(productId, mutation) {
  const data = await gql(`
    mutation($id: ID!, $tags: [String!]!) {
      ${mutation}(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }
  `, { id: productId, tags: [TAG] })

  const errs = data[mutation].userErrors
  if (errs.length) throw new Error(`${mutation} en ${productId}: ${JSON.stringify(errs)}`)
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const accion = REMOVE ? 'QUITAR' : 'AGREGAR'
  console.log(`=== ${accion} tag "${TAG}" a la colección ===`)
  console.log(`  Colección ID: ${COLL_ID}${DRY_RUN ? ' | MODO DRY-RUN' : ''}\n`)

  const productos = await getProductos()

  const yaLoTienen = productos.filter(p => p.tags.includes(TAG))
  const pendientes = REMOVE ? yaLoTienen : productos.filter(p => !p.tags.includes(TAG))

  console.log(`\n  Total en colección:      ${productos.length}`)
  console.log(`  Ya tienen "${TAG}":      ${yaLoTienen.length}`)
  console.log(`  A ${REMOVE ? 'quitar' : 'agregar'}:              ${pendientes.length}`)

  if (!pendientes.length) { console.log('\n✅ Nada que hacer.'); return }

  if (DRY_RUN) {
    console.log('\n── Primeros 10 afectados ──')
    for (const p of pendientes.slice(0, 10)) console.log(`  ${p.title.slice(0, 70)}`)
    console.log('\n✅ Dry-run completo — sin cambios escritos')
    return
  }

  const mutation = REMOVE ? 'tagsRemove' : 'tagsAdd'
  let done = 0
  for (const p of pendientes) {
    await aplicarTag(p.id, mutation)
    done++
    if (done % 25 === 0 || done === pendientes.length) console.log(`  ${done}/${pendientes.length}...`)
    await sleep(150)
  }

  console.log(`\n✅ Listo — tag "${TAG}" ${REMOVE ? 'quitado de' : 'agregado a'} ${done} productos.`)
}

main().catch(err => { console.error('❌', err.message); process.exit(1) })
