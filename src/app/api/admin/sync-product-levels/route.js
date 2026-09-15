import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Recorre ~2400 productos: sin esto Vercel corta la función mucho antes.
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const GQL_URL   = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`
const GQL_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const BATCH     = 50    // productos por query GQL
const DB_PAGE   = 1000  // Supabase devuelve como máximo 1000 filas por request
const DB_WRITES = 10    // updates concurrentes a Supabase

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// Los metafields list.single_line_text_field devuelven un JSON array ["valor"]
// Esta función extrae el primer elemento si es array, o devuelve el string tal cual
function parseLevel(val) {
  if (!val) return null
  try {
    const parsed = JSON.parse(val)
    if (Array.isArray(parsed)) return parsed[0]?.trim() || null
    return typeof parsed === 'string' ? parsed.trim() : val.trim()
  } catch {
    return val.trim()
  }
}

/**
 * Query GQL que no disfraza fallos de dato. Si Shopify limita por costo,
 * reintenta con espera creciente; si falla de otra forma, lanza.
 *
 * La versión anterior no miraba `errors`: una respuesta limitada llegaba sin
 * `data`, cada producto de esa tanda se leía como "sin niveles" y se salteaba
 * en silencio.
 */
async function gql(query, intento = 1) {
  const res  = await fetch(GQL_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
    body:    JSON.stringify({ query }),
  })
  const json = await res.json()
  if (json.errors) {
    const throttled = JSON.stringify(json.errors).includes('THROTTLED')
    if (throttled && intento <= 6) {
      await sleep(2000 * intento)
      return gql(query, intento + 1)
    }
    throw new Error(`Shopify GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`)
  }
  return json.data
}

/**
 * POST /api/admin/sync-product-levels
 *
 * Sincroniza level_1, level_2, level_3 desde metafields de Shopify → Supabase.
 * Solo escribe esas tres columnas, por product_id.
 *
 * Opcional: ?dry=true para ver qué se actualizaría sin escribir en Supabase.
 */
export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url)
    const dry = searchParams.get('dry') === 'true'

    // ── 1. Todos los product_ids únicos de Supabase, paginado ───────────────
    // Sin paginar, Supabase corta en 1000 filas: la primera corrida de este
    // sync solo vio ~900 productos y dejó sin niveles a más de 1000.
    const ids = new Set()
    for (let off = 0; ; off += DB_PAGE) {
      const { data, error } = await supabase
        .from('product_catalog')
        .select('product_id')
        .range(off, off + DB_PAGE - 1)
      if (error) throw error
      for (const r of data || []) if (r.product_id) ids.add(r.product_id)
      if (!data || data.length < DB_PAGE) break
    }

    const uniqueIds = [...ids]
    if (!uniqueIds.length) {
      return NextResponse.json({ ok: true, message: 'No hay productos en product_catalog', updated: 0 })
    }

    // ── 2. Batch GQL — 50 productos por request ─────────────────────────────
    const levelMap = {}  // { product_id: { level_1, level_2, level_3 } }
    let noEncontrados = 0

    for (let i = 0; i < uniqueIds.length; i += BATCH) {
      const chunk   = uniqueIds.slice(i, i + BATCH)
      const aliases = chunk.map((id, j) =>
        `p${j}: node(id: "gid://shopify/Product/${id}") {
           ... on Product {
             l1: metafield(namespace: "custom", key: "level_1") { value }
             l2: metafield(namespace: "custom", key: "level_2") { value }
             l3: metafield(namespace: "custom", key: "level_3") { value }
           }
         }`
      ).join('\n')

      const data = await gql(`{ ${aliases} }`)

      chunk.forEach((id, j) => {
        const node = data?.[`p${j}`]
        // Con gql() lanzando ante errores, un node vacío acá significa que el
        // producto ya no existe en Shopify, no que la consulta falló.
        if (!node) { noEncontrados++; return }
        const l1 = parseLevel(node.l1?.value)
        const l2 = parseLevel(node.l2?.value)
        const l3 = parseLevel(node.l3?.value)
        if (l1 || l2 || l3) levelMap[id] = { level_1: l1, level_2: l2, level_3: l3 }
      })

      await sleep(250)
    }

    const toUpdate = Object.entries(levelMap)  // [[product_id, {level_1, level_2, level_3}], ...]
    if (!toUpdate.length) {
      return NextResponse.json({ ok: true, message: 'Ningún producto tiene metafields de nivel en Shopify', updated: 0 })
    }

    // ── 3. Actualizar Supabase (por product_id) ──────────────────────────────
    let written = 0
    const failed = []

    if (!dry) {
      for (let i = 0; i < toUpdate.length; i += DB_WRITES) {
        const tanda   = toUpdate.slice(i, i + DB_WRITES)
        const results = await Promise.all(tanda.map(([productId, levels]) =>
          supabase.from('product_catalog').update(levels).eq('product_id', Number(productId))
        ))
        results.forEach(({ error }, k) => {
          if (error) {
            failed.push(tanda[k][0])
            console.error(`[sync-levels] Error updating ${tanda[k][0]}:`, error.message)
          } else {
            written++
          }
        })
      }
    }

    return NextResponse.json({
      ok:       failed.length === 0,
      dry,
      total:    uniqueIds.length,          // productos distintos en product_catalog
      updated:  toUpdate.length,           // con niveles en Shopify (se escriben, o se escribirían)
      skipped:  uniqueIds.length - toUpdate.length,
      notFound: noEncontrados,             // ya no existen en Shopify
      written:  dry ? 0 : written,
      failed:   failed.length,
      preview:  dry ? toUpdate.slice(0, 10).map(([id, lvl]) => ({ id, ...lvl })) : undefined,
    })

  } catch (e) {
    console.error('[sync-product-levels]', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
