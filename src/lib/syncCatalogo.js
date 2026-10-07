/**
 * Sincroniza el catálogo de productos: Shopify → Supabase (product_catalog).
 *
 * Lo usan dos lugares, y tienen que hacer exactamente lo mismo:
 *   · scripts/sync_product_catalog.js     → a mano, con --simulacro para ver qué cambiaría
 *   · api/crons/sync-catalog              → programado (cada hora incremental, una vez al día completo)
 *
 * Trae: variant_id, product_id, title, variant_title, sku, price, componente, brand,
 *       level_1/2/3 (categoría) y modo_de_uso (texto del fabricante).
 *
 * Niveles y modo de uso solo se escriben cuando Shopify los trae: un producto que no
 * los tiene conserva lo que ya hubiera en la tabla, no se borra con vacío.
 *
 * Nota de imports: llevan extensión (.js) porque este archivo también lo carga Node
 * directo desde el script, no solo el empaquetador de Next.
 */

import { createClient } from '@supabase/supabase-js'
import { extraerModoDeUso } from './modoDeUso.js'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Los metafields de nivel son listas de texto: llegan como '["Proteínas"]'.
// Se toma el primer elemento (misma regla que api/admin/sync-product-levels).
function parseLevel(val) {
  if (!val) return null
  try {
    const parsed = JSON.parse(val)
    if (Array.isArray(parsed)) return parsed[0]?.trim() || null
    return typeof parsed === 'string' ? parsed.trim() || null : null
  } catch {
    return val.trim() || null
  }
}

// Primer GID de un metafield tipo lista, o el string directo
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

const PRODUCTS_QUERY = `
  query getProducts($cursor: String, $q: String) {
    products(first: 50, after: $cursor, query: $q) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          status
          descriptionHtml
          compuestoPrincipal: metafield(namespace: "custom", key: "compuesto_principal") { value }
          marcaLista: metafield(namespace: "custom", key: "marca_lista") { value }
          l1: metafield(namespace: "custom", key: "level_1") { value }
          l2: metafield(namespace: "custom", key: "level_2") { value }
          l3: metafield(namespace: "custom", key: "level_3") { value }
          variants(first: 100) {
            edges { node { id title sku price } }
          }
        }
      }
    }
  }
`

/**
 * @param {object}  [opts]
 * @param {string}  [opts.desde]      ISO: solo productos modificados desde esa fecha (incremental). Sin esto, todos.
 * @param {boolean} [opts.simulacro]  true: lee y compara, no escribe nada
 * @param {function}[opts.log]        dónde ir contando el avance
 */
export async function sincronizarCatalogo({ desde = null, simulacro = false, log = () => {} } = {}) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
  const GQL_URL  = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`
  const GQL_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

  // Si Shopify limita por costo se reintenta con espera creciente; cualquier otro
  // error se lanza. Una respuesta sin `data` leída como "sin productos" haría que
  // el sync pareciera exitoso sin haber traído nada.
  async function gql(query, variables = {}, intento = 1) {
    const res = await fetch(GQL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
      body:    JSON.stringify({ query, variables }),
    })
    const json = await res.json()
    if (json.errors) {
      if (JSON.stringify(json.errors).includes('THROTTLED') && intento <= 6) {
        await sleep(2000 * intento)
        return gql(query, variables, intento + 1)
      }
      throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`)
    }
    return json.data
  }

  // ¿Ya existe la columna `status`? Si el código se despliega antes de correr el
  // SQL, escribirla haría fallar el upsert entero y el proceso programado no
  // actualizaría nada. Así el orden de despliegue no importa: sin la columna,
  // sincroniza todo lo demás y avisa.
  const { error: errStatus } = await supabase.from('product_catalog').select('status').limit(1)
  const guardarStatus = !errStatus
  if (!guardarStatus) log('  (aviso: product_catalog.status no existe todavía; se sincroniza sin ella)')

  // ── 1. Productos ────────────────────────────────────────────────────────────
  const q = desde ? `updated_at:>${desde}` : null
  const products = []
  let cursor = null, page = 0
  while (true) {
    page++
    const data = await gql(PRODUCTS_QUERY, { cursor, q })
    const { edges, pageInfo } = data.products
    for (const { node } of edges) products.push(node)
    log(`  Página ${page}: ${products.length} productos`)
    if (!pageInfo.hasNextPage) break
    cursor = pageInfo.endCursor
    await sleep(300)
  }

  // ── 2. Nombres de componente y marca (metaobjects) ──────────────────────────
  const allGids = new Set()
  for (const p of products) {
    const c = extractFirstGid(p.compuestoPrincipal?.value)
    const m = extractFirstGid(p.marcaLista?.value)
    if (c) allGids.add(c)
    if (m) allGids.add(m)
  }

  const gidMap = {}
  const gidList = [...allGids]
  for (let i = 0; i < gidList.length; i += 50) {
    const chunk = gidList.slice(i, i + 50)
    const aliases = chunk.map((gid, idx) =>
      `m${idx}: node(id: "${gid}") { ... on Metaobject {
        nombre: field(key: "nombre") { value }
        name:   field(key: "name")   { value }
      } }`
    ).join('\n')
    const data = await gql(`{ ${aliases} }`)
    chunk.forEach((gid, idx) => {
      const node = data?.[`m${idx}`]
      gidMap[gid] = node?.nombre?.value || node?.name?.value || ''
    })
    await sleep(200)
  }

  // ── 3. Filas ────────────────────────────────────────────────────────────────
  // Solo se escribe lo que Shopify trae. Un upsert en bloque pone en NULL las
  // columnas que faltan en alguna fila, así que lo ausente NO se manda como null:
  // no va en la fila, y las filas se agrupan abajo por las columnas que sí tienen.
  const rows = []
  let sinComponente = 0
  for (const p of products) {
    const productId = Number(p.id.replace('gid://shopify/Product/', ''))
    const compGid  = extractFirstGid(p.compuestoPrincipal?.value)
    const marcaGid = extractFirstGid(p.marcaLista?.value)
    const componente = compGid  ? (gidMap[compGid]  || null) : null
    const brand      = marcaGid ? (gidMap[marcaGid] || null) : null
    if (!componente) sinComponente++

    const niveles = { level_1: parseLevel(p.l1?.value), level_2: parseLevel(p.l2?.value), level_3: parseLevel(p.l3?.value) }
    const tieneNiveles = Object.values(niveles).some(Boolean)
    const modoDeUso    = extraerModoDeUso(p.descriptionHtml)

    for (const { node: v } of p.variants.edges) {
      rows.push({
        variant_id:    Number(v.id.replace('gid://shopify/ProductVariant/', '')),
        product_id:    productId,
        title:         p.title,
        variant_title: v.title === 'Default Title' ? null : v.title,
        sku:           v.sku || null,
        price:         Number(v.price) || null,
        componente,
        brand,
        ...(guardarStatus && p.status ? { status: p.status } : {}),
        ...(tieneNiveles ? niveles : {}),
        ...(modoDeUso ? { modo_de_uso: modoDeUso } : {}),
        synced_at:     new Date().toISOString(),
      })
    }
  }

  const resumen = {
    modo:       desde ? `incremental desde ${desde}` : 'completo',
    productos:  products.length,
    variantes:  rows.length,
    conNiveles: rows.filter(r => 'level_1' in r).length,
    conModo:    rows.filter(r => 'modo_de_uso' in r).length,
    sinComponente,
    porEstado:  products.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc }, {}),
    columnaStatus: guardarStatus,
  }
  log(`\n  ${rows.length} variantes listas (${resumen.modo})`)

  // ── 4a. Simulacro: qué cambiaría respecto a lo que hay hoy, sin escribir ────
  if (simulacro) {
    const ids = rows.map(r => r.variant_id)
    const hoy = new Map()
    // En incremental alcanza con leer esas variantes; en completo, toda la tabla
    for (let i = 0; i < ids.length; i += 500) {
      const { data, error } = await supabase
        .from('product_catalog')
        .select(`variant_id, product_id, title, variant_title, sku, price, componente, brand, level_1, level_2, level_3, modo_de_uso${guardarStatus ? ', status' : ''}`)
        .in('variant_id', ids.slice(i, i + 500))
      if (error) throw error
      data.forEach(r => hoy.set(r.variant_id, r))
    }

    const nuevas = [], cambios = {}, ejemplos = {}
    for (const r of rows) {
      const actual = hoy.get(r.variant_id)
      if (!actual) { nuevas.push(r); continue }
      for (const k of Object.keys(r)) {
        if (k === 'synced_at') continue
        const a = actual[k] ?? null, b = r[k] ?? null
        if (String(a) !== String(b)) {
          cambios[k] = (cambios[k] || 0) + 1
          ;(ejemplos[k] ||= []).push(`${r.sku || r.variant_id}: ${a} → ${b}`)
        }
      }
    }
    return { ...resumen, simulacro: true, nuevas, cambios, ejemplos }
  }

  // ── 4b. Escritura: upsert en batches de 500, agrupado por columnas ──────────
  const grupos = new Map()
  for (const r of rows) {
    const firma = Object.keys(r).sort().join(',')
    if (!grupos.has(firma)) grupos.set(firma, [])
    grupos.get(firma).push(r)
  }

  let upserted = 0
  for (const grupo of grupos.values()) {
    for (let i = 0; i < grupo.length; i += 500) {
      const chunk = grupo.slice(i, i + 500)
      const { error } = await supabase.from('product_catalog').upsert(chunk, { onConflict: 'variant_id' })
      if (error) throw error
      upserted += chunk.length
      log(`  ${upserted}/${rows.length} upserted`)
    }
  }

  return { ...resumen, upserted }
}
