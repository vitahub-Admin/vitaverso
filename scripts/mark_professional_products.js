// scripts/mark_professional_products.js
// Cuenta cuántas veces aparece cada product_id en órdenes de los últimos 90 días,
// luego marca is_professional = true en product_catalog para los que tienen >= 3 apariciones.
// Los que ya no califican se resetean a false automáticamente.
//
// NOTA: el webhook guarda en line_items: { product_id, title, sku, variant_title, quantity, price }
//       — no guarda variant_id. Por eso contamos por product_id y marcamos todas las variantes del producto.
//
// Uso: node --env-file=.env scripts/mark_professional_products.js
// Flags:
//   --dry-run         Muestra qué cambiaría sin escribir nada
//   --threshold=N     Sobrescribe el umbral (default 3)
//   --days=N          Sobrescribe la ventana de días (default 90)
//   --shopify-sync    Solo sincroniza tags de Shopify según el estado actual de Supabase
//                     (útil cuando Supabase ya está actualizado pero Shopify no)

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Parsear flags ─────────────────────────────────────────────

const DRY_RUN      = process.argv.includes('--dry-run')
const SHOPIFY_ONLY = process.argv.includes('--shopify-sync')
const threshArg    = process.argv.find(a => a.startsWith('--threshold='))
const daysArg      = process.argv.find(a => a.startsWith('--days='))
const THRESHOLD    = threshArg ? Number(threshArg.split('=')[1]) : 3
const DAYS         = daysArg   ? Number(daysArg.split('=')[1])   : 90

if (isNaN(THRESHOLD) || THRESHOLD < 1) {
  console.error('❌ --threshold debe ser un número entero >= 1')
  process.exit(1)
}
if (isNaN(DAYS) || DAYS < 1) {
  console.error('❌ --days debe ser un número entero >= 1')
  process.exit(1)
}

const CUTOFF = new Date(Date.now() - DAYS * 24 * 3600 * 1000).toISOString()

// ── 1. Paginar todas las órdenes ──────────────────────────────

async function fetchAllOrders() {
  const all  = []
  const PAGE = 1000
  let from   = 0
  let page   = 0

  while (true) {
    page++
    const { data, error } = await supabase
      .from('orders')
      .select('line_items')
      .gte('shopify_created_at', CUTOFF)
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`Supabase error al leer órdenes: ${error.message}`)
    if (!data?.length) break

    all.push(...data)
    console.log(`  Página ${page}: ${all.length} órdenes cargadas`)

    if (data.length < PAGE) break
    from += PAGE
    await sleep(100)
  }

  return all
}

// ── 2. Contar apariciones de product_id en line_items ─────────
//    El webhook guarda: { product_id, title, sku, variant_title, quantity, price }
//    — no guarda variant_id.

function contarProductos(orders) {
  const counts = new Map()

  for (const order of orders) {
    const items = order.line_items
    if (!Array.isArray(items) || !items.length) continue

    for (const item of items) {
      // Puede ser number o string — normalizamos a Number
      const pid = Number(item.product_id)
      if (!pid) continue
      counts.set(pid, (counts.get(pid) || 0) + 1)
    }
  }

  return counts
}

// ── 3. Leer variantes de los productos calificados ────────────

async function fetchVariantsForProducts(productIds) {
  if (!productIds.length) return []

  const all  = []
  const PAGE = 500
  let from   = 0

  while (true) {
    const { data, error } = await supabase
      .from('product_catalog')
      .select('variant_id, product_id')
      .in('product_id', productIds)
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`Error leyendo product_catalog: ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  return all
}

// ── 4. Leer qué variantes ya están marcadas true ──────────────

async function fetchCurrentlyTrue() {
  const all  = []
  const PAGE = 1000
  let from   = 0

  while (true) {
    const { data, error } = await supabase
      .from('product_catalog')
      .select('variant_id, product_id')
      .eq('is_professional', true)
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`Error leyendo product_catalog: ${error.message}`)
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  return all
}

// ── 5. Shopify: fetch tags + update ──────────────────────────

const SHOPIFY_URL = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`
const SHOPIFY_HDR = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
}

async function shopifyGql(query, variables = {}) {
  const res = await fetch(SHOPIFY_URL, {
    method: 'POST',
    headers: SHOPIFY_HDR,
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(`Shopify GQL: ${JSON.stringify(json.errors)}`)
  return json.data
}

// Fetch tags actuales de varios productos en un solo request (aliases)
async function fetchShopifyTags(productIds) {
  if (!productIds.length) return {}
  const aliases = productIds.map((pid, i) =>
    `p${i}: node(id: "gid://shopify/Product/${pid}") { ... on Product { id tags } }`
  ).join('\n')
  const data = await shopifyGql(`{ ${aliases} }`)
  const map = {}
  productIds.forEach((pid, i) => {
    const node = data[`p${i}`]
    if (node) map[pid] = node.tags || []
  })
  return map
}

// Actualizar tags de un producto
async function updateShopifyTags(productId, tags) {
  await shopifyGql(
    `mutation($input: ProductInput!) {
       productUpdate(input: $input) {
         userErrors { field message }
       }
     }`,
    { input: { id: `gid://shopify/Product/${productId}`, tags } }
  )
}

async function syncShopifyTags({ addProductIds, removeProductIds, dryRun }) {
  const allIds = [...new Set([...addProductIds, ...removeProductIds])]
  if (!allIds.length) { console.log('  Sin cambios de tags en Shopify.\n'); return }

  console.log(`\n🏷️  Sincronizando tags PRO en Shopify...`)
  console.log(`   +PRO: ${addProductIds.length} productos  |  -PRO: ${removeProductIds.length} productos`)

  // Fetch tags en batches de 50 (límite de aliases por query)
  const tagMap = {}
  const BATCH  = 50
  for (let i = 0; i < allIds.length; i += BATCH) {
    const chunk = allIds.slice(i, i + BATCH)
    const partial = await fetchShopifyTags(chunk)
    Object.assign(tagMap, partial)
    if (i + BATCH < allIds.length) await sleep(600) // respetar rate limit
  }

  const addSet    = new Set(addProductIds.map(String))
  const removeSet = new Set(removeProductIds.map(String))

  let updated = 0, skipped = 0, errors = 0

  for (const pid of allIds) {
    const current  = tagMap[pid] || []
    const hasPro   = current.map(t => t.toUpperCase()).includes('PRO')
    const needsAdd = addSet.has(String(pid))
    const needsRem = removeSet.has(String(pid))

    let newTags = [...current]

    if (needsAdd && !hasPro) {
      newTags = [...current, 'PRO']
    } else if (needsRem && hasPro) {
      newTags = current.filter(t => t.toUpperCase() !== 'PRO')
    } else {
      skipped++
      continue
    }

    if (dryRun) {
      console.log(`   [DRY] product ${pid}: [${current.join(', ')}] → [${newTags.join(', ')}]`)
      updated++
      continue
    }

    try {
      await updateShopifyTags(pid, newTags)
      updated++
      await sleep(300) // ~3 req/s para no saturar
    } catch (err) {
      console.error(`   ❌ product ${pid}: ${err.message}`)
      errors++
    }
  }

  console.log(`   ✅ Actualizados: ${updated}  |  Sin cambio: ${skipped}  |  Errores: ${errors}`)
}

// ── 6. Upsert en batches de 100 ───────────────────────────────

async function upsertBatch(rows, label) {
  const BATCH = 100
  let done    = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from('product_catalog')
      .upsert(chunk, { onConflict: 'variant_id' })

    if (error) throw new Error(`Supabase upsert error (${label}): ${error.message}`)
    done += chunk.length
    console.log(`  ${label}: ${done}/${rows.length} variantes`)
    await sleep(100)
  }
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  // ── Modo shopify-sync: solo sync de tags sin tocar Supabase ───
  if (SHOPIFY_ONLY) {
    console.log('=== Shopify PRO tag sync (desde Supabase) ===')
    if (DRY_RUN) console.log('  MODO DRY-RUN — sin escrituras en Shopify')
    console.log()

    // Leer todos los true/false actuales de Supabase
    console.log('Leyendo product_catalog de Supabase...')
    const PAGE = 1000
    let from   = 0
    const allVariants = []
    while (true) {
      const { data, error } = await supabase
        .from('product_catalog')
        .select('variant_id, product_id, is_professional')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`Error leyendo product_catalog: ${error.message}`)
      if (!data?.length) break
      allVariants.push(...data)
      if (data.length < PAGE) break
      from += PAGE
    }
    console.log(`  ${allVariants.length} variantes totales en product_catalog\n`)

    const trueSet  = new Set()
    const falseSet = new Set()
    for (const v of allVariants) {
      const pid = Number(v.product_id)
      if (!pid) continue
      if (v.is_professional) trueSet.add(pid)
      else falseSet.add(pid)
    }

    // Productos que deben tener PRO: is_professional true en AL MENOS UNA variante
    const addProductIds    = [...trueSet]
    // Productos que deben perder PRO: ninguna variante true
    const removeProductIds = [...falseSet].filter(pid => !trueSet.has(pid))

    console.log(`  Productos a marcar +PRO en Shopify: ${addProductIds.length}`)
    console.log(`  Productos a quitar -PRO en Shopify: ${removeProductIds.length}\n`)

    await syncShopifyTags({ addProductIds, removeProductIds, dryRun: DRY_RUN })
    console.log('\n✅ Shopify sync completado.')
    return
  }

  // ── Modo normal: full pipeline Supabase + Shopify ─────────────
  console.log('=== Marcar productos profesionales ===')
  console.log(`  Umbral:  >= ${THRESHOLD} apariciones`)
  console.log(`  Ventana: últimos ${DAYS} días (desde ${CUTOFF.slice(0, 10)})`)
  if (DRY_RUN) console.log('  MODO DRY-RUN — sin escrituras')
  console.log()

  // 1. Cargar todas las órdenes paginadas
  console.log('Cargando órdenes de Supabase...')
  const orders = await fetchAllOrders()
  console.log(`  ${orders.length} órdenes cargadas en total\n`)

  // 2. Contar apariciones de product_id en line_items
  console.log('Contando apariciones de product_id en line_items...')
  const counts = contarProductos(orders)
  console.log(`  ${counts.size} product_ids únicos encontrados en line_items\n`)

  if (counts.size === 0) {
    // Debug: mostrar un ejemplo de cómo está el line_items
    const sample = orders.find(o => o.line_items && Array.isArray(o.line_items) && o.line_items.length)
    if (sample) {
      console.log('  Ejemplo de line_items:', JSON.stringify(sample.line_items[0]))
    } else {
      console.log('  ⚠️  Todas las órdenes tienen line_items vacío o null')
    }
    return
  }

  // 3. Separar calificados (product_ids con >= threshold apariciones)
  const califican = []
  for (const [pid, n] of counts) {
    if (n >= THRESHOLD) califican.push(pid)
  }
  console.log(`  Productos calificados (>= ${THRESHOLD} apariciones): ${califican.length}`)

  if (califican.length === 0) {
    console.log('\n  ⚠️  Ningún producto supera el umbral.')
    if (THRESHOLD > 1) {
      const topCounts = [...counts.values()].sort((a, b) => b - a)
      console.log(`  Máximo de apariciones encontrado: ${topCounts[0] ?? 0}`)
    }
    return
  }

  // 4. Buscar todas las variantes de esos productos en product_catalog
  console.log('\nBuscando variantes de los productos calificados en product_catalog...')
  const calificadosVariants = await fetchVariantsForProducts(califican)
  console.log(`  ${calificadosVariants.length} variantes encontradas para ${califican.length} productos\n`)

  // 5. Leer qué variantes ya están marcadas true
  console.log('Leyendo variantes actualmente marcadas como profesional...')
  const currentlyTrue = await fetchCurrentlyTrue()
  const currentlyTrueSet = new Set(currentlyTrue.map(r => Number(r.variant_id)))
  console.log(`  ${currentlyTrueSet.size} variantes actualmente marcadas como profesional\n`)

  // 6. Determinar variantes a resetear a false:
  //    variantes que estaban en true pero cuyo product_id ya no califica
  const calificanSet    = new Set(califican)
  const toFalseVariants = currentlyTrue.filter(r => !calificanSet.has(Number(r.product_id)))

  const toTrueVariants = calificadosVariants.filter(r => !currentlyTrueSet.has(Number(r.variant_id)))

  console.log(`  Variantes a marcar is_professional = true (nuevas): ${toTrueVariants.length}`)
  console.log(`  Variantes a resetear is_professional = false:       ${toFalseVariants.length}\n`)

  // Unique product_ids para el sync de Shopify
  const addProductIds    = [...new Set(toTrueVariants.map(r => Number(r.product_id)))]
  const removeProductIds = [...new Set(toFalseVariants.map(r => Number(r.product_id)))]
    .filter(pid => !calificanSet.has(pid)) // no remover si el mismo producto tiene otras variantes que siguen true

  // ── Dry-run ───────────────────────────────────────────────
  if (DRY_RUN) {
    const top = [...counts.entries()]
      .filter(([, n]) => n >= THRESHOLD)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)

    if (top.length) {
      console.log(`── Top ${top.length} product_ids calificados ──`)
      for (const [pid, n] of top) {
        const variantCount = calificadosVariants.filter(r => Number(r.product_id) === pid).length
        console.log(`  product_id ${pid}: ${n} apariciones → ${variantCount} variante(s)`)
      }
    }

    if (toFalseVariants.length) {
      console.log(`\n── ${toFalseVariants.length} variantes que serían reseteadas a false ──`)
      for (const r of toFalseVariants.slice(0, 10)) {
        console.log(`  variant_id ${r.variant_id} (product_id ${r.product_id})`)
      }
      if (toFalseVariants.length > 10) console.log(`  ... y ${toFalseVariants.length - 10} más`)
    }

    await syncShopifyTags({ addProductIds, removeProductIds, dryRun: true })
    console.log(`\n✅ Dry-run completo — sin cambios escritos | Costo: $0.00`)
    return
  }

  // ── Escribir cambios ──────────────────────────────────────

  // 7. Upsert is_professional = true para las variantes nuevas
  if (toTrueVariants.length) {
    console.log(`Marcando ${toTrueVariants.length} variantes como is_professional = true...`)
    await upsertBatch(
      toTrueVariants.map(r => ({ variant_id: r.variant_id, product_id: r.product_id, is_professional: true })),
      'true'
    )
    console.log()
  } else {
    console.log('Sin variantes nuevas que marcar como true.\n')
  }

  // 8. Upsert is_professional = false para las que ya no califican
  if (toFalseVariants.length) {
    console.log(`Reseteando ${toFalseVariants.length} variantes a is_professional = false...`)
    await upsertBatch(
      toFalseVariants.map(r => ({ variant_id: r.variant_id, product_id: r.product_id, is_professional: false })),
      'false'
    )
    console.log()
  } else {
    console.log('Sin variantes que resetear a false.\n')
  }

  // 9. Sync tags en Shopify
  await syncShopifyTags({ addProductIds, removeProductIds, dryRun: false })

  // 10. Resumen final
  console.log('=== Resumen final ===')
  console.log(`  Órdenes procesadas:                   ${orders.length}`)
  console.log(`  product_ids únicos en line_items:     ${counts.size}`)
  console.log(`  Productos calificados (>= ${THRESHOLD}):         ${califican.length}`)
  console.log(`  Variantes marcadas is_professional:   ${toTrueVariants.length} nuevas`)
  console.log(`  Variantes reseteadas a false:         ${toFalseVariants.length}`)
  console.log(`  Productos Shopify +PRO:               ${addProductIds.length}`)
  console.log(`  Productos Shopify -PRO:               ${removeProductIds.length}`)
  console.log(`  Costo: $0.00`)
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
