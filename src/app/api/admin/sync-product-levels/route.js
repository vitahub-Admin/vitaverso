import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const GQL_URL   = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`
const GQL_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const BATCH     = 50  // productos por query GQL

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
 * POST /api/admin/sync-product-levels
 *
 * Sincroniza level_1, level_2, level_3 desde metafields de Shopify → Supabase.
 * Es un endpoint one-shot: llamarlo una vez para poblar las columnas.
 *
 * Opcional: ?dry=true para solo ver qué se actualizaría sin escribir en Supabase.
 */
export async function POST(req) {
  try {
    const { searchParams } = new URL(req.url)
    const dry = searchParams.get('dry') === 'true'

    // ── 1. Traer todos los product_ids únicos de Supabase ───────────────────
    const { data: rows, error: dbErr } = await supabase
      .from('product_catalog')
      .select('product_id')

    if (dbErr) throw dbErr

    const uniqueIds = [...new Set((rows || []).map(r => r.product_id).filter(Boolean))]
    if (!uniqueIds.length) return NextResponse.json({ ok: true, message: 'No hay productos en product_catalog', updated: 0 })

    // ── 2. Batch GQL — 50 productos por request ─────────────────────────────
    const levelMap = {}  // { product_id: { level_1, level_2, level_3 } }

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

      const res  = await fetch(GQL_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
        body:    JSON.stringify({ query: `{ ${aliases} }` }),
      })
      const json = await res.json()

      chunk.forEach((id, j) => {
        const node = json?.data?.[`p${j}`]
        if (!node) return
        const l1 = parseLevel(node.l1?.value)
        const l2 = parseLevel(node.l2?.value)
        const l3 = parseLevel(node.l3?.value)
        if (l1 || l2 || l3) levelMap[id] = { level_1: l1, level_2: l2, level_3: l3 }
      })
    }

    const toUpdate = Object.entries(levelMap)  // [[product_id, {level_1, level_2, level_3}], ...]
    if (!toUpdate.length) {
      return NextResponse.json({ ok: true, message: 'Ningún producto tiene metafields de nivel en Shopify', updated: 0 })
    }

    // ── 3. Actualizar Supabase (por product_id) ──────────────────────────────
    if (!dry) {
      for (const [productId, levels] of toUpdate) {
        const { error } = await supabase
          .from('product_catalog')
          .update(levels)
          .eq('product_id', Number(productId))
        if (error) console.error(`[sync-levels] Error updating ${productId}:`, error.message)
      }
    }

    return NextResponse.json({
      ok:      true,
      dry,
      total:   uniqueIds.length,
      updated: toUpdate.length,
      skipped: uniqueIds.length - toUpdate.length,
      preview: dry ? toUpdate.slice(0, 10).map(([id, lvl]) => ({ id, ...lvl })) : undefined,
    })

  } catch (e) {
    console.error('[sync-product-levels]', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
