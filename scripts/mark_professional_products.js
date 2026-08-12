// scripts/mark_professional_products.js
// Cuenta cuántas veces aparece cada product_id en todas las órdenes de Supabase,
// luego marca is_professional = true en product_catalog para los que tienen >= 5 apariciones.
//
// NOTA: el webhook guarda en line_items: { product_id, title, sku, variant_title, quantity, price }
//       — no guarda variant_id. Por eso contamos por product_id y marcamos todas las variantes del producto.
//
// Uso: node --env-file=.env scripts/mark_professional_products.js
// Flags:
//   --dry-run       Muestra qué cambiaría sin escribir nada
//   --threshold=N   Sobrescribe el umbral (default 5)

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Parsear flags ─────────────────────────────────────────────

const DRY_RUN   = process.argv.includes('--dry-run')
const threshArg = process.argv.find(a => a.startsWith('--threshold='))
const THRESHOLD = threshArg ? Number(threshArg.split('=')[1]) : 5

if (isNaN(THRESHOLD) || THRESHOLD < 1) {
  console.error('❌ --threshold debe ser un número entero >= 1')
  process.exit(1)
}

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

// ── 5. Upsert en batches de 100 ───────────────────────────────

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
  console.log('=== Marcar productos profesionales ===')
  console.log(`  Umbral: >= ${THRESHOLD} apariciones en órdenes${DRY_RUN ? ' | MODO DRY-RUN (sin escrituras)' : ''}\n`)

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
  const calificanSet = new Set(califican)
  const currentlyTruePids = new Set(currentlyTrue.map(r => Number(r.product_id)))
  const toFalseVariants = currentlyTrue.filter(r => !calificanSet.has(Number(r.product_id)))

  const toTrueVariants = calificadosVariants.filter(r => !currentlyTrueSet.has(Number(r.variant_id)))

  console.log(`  Variantes a marcar is_professional = true (nuevas): ${toTrueVariants.length}`)
  console.log(`  Variantes a resetear is_professional = false:       ${toFalseVariants.length}\n`)

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

  // 9. Resumen final
  console.log('=== Resumen final ===')
  console.log(`  Órdenes procesadas:                   ${orders.length}`)
  console.log(`  product_ids únicos en line_items:     ${counts.size}`)
  console.log(`  Productos calificados (>= ${THRESHOLD}):         ${califican.length}`)
  console.log(`  Variantes marcadas is_professional:   ${toTrueVariants.length} nuevas`)
  console.log(`  Variantes reseteadas a false:         ${toFalseVariants.length}`)
  console.log(`  Costo: $0.00`)
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
