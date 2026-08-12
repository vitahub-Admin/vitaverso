// scripts/analizar_ordenes_sin_sref.js
// Verifica cuáles órdenes del CSV tienen specialist_ref cargado en Supabase,
// y para las que no tienen sref, revisa si las comisiones de sus productos
// fueron modificadas después de la fecha de la orden.
// Solo lectura — no modifica la DB.
// Uso: node --env-file=.env scripts/analizar_ordenes_sin_sref.js

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const ORDER_NUMBERS = [
  2682, 2905, 2942, 3902, 4854, 12429, 14572, 14590, 14781, 14810,
  14845, 14888, 14921, 14931, 14959, 15011, 15038, 15031, 15063, 15085,
  15219, 15226, 15308, 15311, 15313, 15353, 15338, 15374, 15411, 15458,
  15478, 15498, 15518, 15551, 15564, 15602, 15653, 15697, 15709, 15719,
  15722, 15738, 15908,
].map(n => `#ORDVHMX${n}`)

async function main() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('order_id, order_name, specialist_ref, share_cart, shopify_created_at, line_items')
    .in('order_name', ORDER_NUMBERS)

  if (error) throw error

  const foundNames    = new Set(orders.map(o => o.order_name))
  const conSref       = orders.filter(o => o.specialist_ref)
  const sinSref       = orders.filter(o => !o.specialist_ref && o.shopify_created_at >= '2026-03-01')
  const noEncontradas = ORDER_NUMBERS.filter(n => !foundNames.has(n))

  console.log(`\n========== RESULTADO ==========`)
  console.log(`Total en CSV:          ${ORDER_NUMBERS.length}`)
  console.log(`Encontradas en Supa:   ${orders.length}`)
  console.log(`Con specialist_ref:    ${conSref.length}`)
  console.log(`Sin specialist_ref:    ${sinSref.length}`)
  console.log(`No existen en Supa:    ${noEncontradas.length}`)

  if (conSref.length) {
    console.log(`\n✅ FALSOS POSITIVOS (ya tienen sref — orden OK):`)
    conSref.forEach(o =>
      console.log(`  ${o.order_name}  share_cart: ${o.share_cart}  specialist_ref: ${o.specialist_ref}  fecha: ${o.shopify_created_at?.slice(0,10)}`)
    )
  }

  if (noEncontradas.length) {
    console.log(`\n⚠️  NO ENCONTRADAS EN SUPABASE:`)
    noEncontradas.forEach(n => console.log(`  ${n}`))
  }

  if (!sinSref.length) {
    console.log(`\nNo hay casos reales a corregir.`)
    return
  }

  // Para las órdenes sin sref, cruzar line_items con historial de comisiones
  const productIds = [...new Set(
    sinSref.flatMap(o => (o.line_items || []).map(i => i.product_id).filter(Boolean))
  )]

  // Comisión actual por product_id
  const { data: currentComm } = await supabase
    .from('product_variant_commissions')
    .select('variant_id, product_id, commission_percent')
    .in('product_id', productIds)
    .eq('active', true)

  const currentCommMap = {}
  for (const c of (currentComm || [])) {
    const pid = String(c.product_id)
    if (!currentCommMap[pid]) currentCommMap[pid] = Number(c.commission_percent)
  }

  // Necesitamos los variant_ids que corresponden a esos product_ids
  const { data: variantRows } = await supabase
    .from('product_variant_commissions')
    .select('variant_id, product_id')
    .in('product_id', productIds)

  // Mapa product_id → [variant_ids]
  const productToVariants = {}
  for (const r of (variantRows || [])) {
    const pid = String(r.product_id)
    if (!productToVariants[pid]) productToVariants[pid] = []
    productToVariants[pid].push(r.variant_id)
  }

  const allVariantIds = [...new Set(Object.values(productToVariants).flat())]

  const { data: history, error: commError } = await supabase
    .from('product_commission_history')
    .select('variant_id, product_id, commission_percent, recorded_at')
    .in('variant_id', allVariantIds)
    .order('recorded_at', { ascending: false })

  if (commError) throw commError

  // Para cada product_id y fecha, buscar la comisión histórica más reciente anterior o igual
  function getCommAtDate(productId, orderDate) {
    const variants = productToVariants[String(productId)] || []
    const records  = (history || []).filter(h => variants.includes(h.variant_id) && h.recorded_at <= orderDate)
    return records.length ? records[0] : null
  }

  console.log(`\n❌ CASOS REALES — análisis de comisiones:`)
  console.log(`${'Orden'.padEnd(20)} ${'share_cart'.padEnd(15)} ${'Fecha orden'.padEnd(12)} ${'Estado comisiones'}`)
  console.log('─'.repeat(90))

  let todosOk    = 0
  let conConflicto = 0

  for (const o of sinSref) {
    const items    = (o.line_items || []).filter(i => i.title && !i.title.toLowerCase().includes('tip'))
    const orderDate = o.shopify_created_at

    const conflictos = []
    const sinComision = []

    for (const item of items) {
      const pid      = String(item.product_id || '')
      const histComm = getCommAtDate(item.product_id, orderDate)
      const currComm = currentCommMap[pid]

      if (!histComm) {
        sinComision.push(item.title?.slice(0, 35))
        continue
      }

      const histVal = Number(histComm.commission_percent)
      const currVal = currComm ?? null

      if (currVal !== null && Math.abs(histVal - currVal) > 0.01) {
        conflictos.push({
          title:   item.title?.slice(0, 35),
          hist:    histVal,
          current: currVal,
        })
      }
    }

    const estadoLabel =
      sinComision.length > 0  ? '❓ SIN HISTORIAL' :
      conflictos.length  > 0  ? '⚠️  COMISION DIFIERE' :
                                '✅ OK — comisiones coinciden'

    if (sinComision.length > 0 || conflictos.length > 0) conConflicto++
    else todosOk++

    console.log(`${o.order_name.padEnd(20)} ${(o.share_cart || '-').padEnd(15)} ${orderDate?.slice(0,10).padEnd(12)} ${estadoLabel}`)

    sinComision.forEach(t => console.log(`       ↳ ❓ Sin historial: ${t}`))
    conflictos.forEach(c  => console.log(`       ↳ ⚠️  ${c.title} — histórica: ${c.hist}%  actual: ${c.current}%`))
  }

  console.log(`\n─────────────────────────────`)
  console.log(`✅ Corregibles sin problema:        ${todosOk}`)
  console.log(`❓ Sin historial de comisión:       ${conConflicto} (revisar manualmente)`)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
