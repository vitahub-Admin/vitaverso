// scripts/corregir_ordenes_sin_sref.js
// Corrige órdenes sin specialist_ref:
//   1. Busca el owner_id en sharecarts via share_cart token
//   2. Actualiza orders.specialist_ref
//   3. Calcula comisión con historial al momento de la orden
//   4. Inserta point_transaction (idempotente — no duplica si ya existe)
//
// ⚠️  MODIFICA LA DB — revisar OUTPUT antes de confirmar.
// Uso: node --env-file=.env scripts/corregir_ordenes_sin_sref.js

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// ── CARGAR AQUÍ LAS ÓRDENES A CORREGIR ──────────────────────────────────────
const ORDER_NAMES = [
  '#ORDVHMX14931',
  '#ORDVHMX14888',
  '#ORDVHMX14781',
  '#ORDVHMX14590',
  '#ORDVHMX14572',
  '#ORDVHMX14845',
  '#ORDVHMX15038',
  '#ORDVHMX14921',
  '#ORDVHMX14810',
]
// ────────────────────────────────────────────────────────────────────────────

const DRY_RUN = false // ← cambiar a false para ejecutar cambios reales

async function getHistoricalComm(productId, variantMap, history, orderDate) {
  const variants = variantMap[String(productId)] || []
  const records  = history.filter(h => variants.includes(h.variant_id) && h.recorded_at <= orderDate)
  return records.length ? Number(records[0].commission_percent) : null
}

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — sin cambios reales\n' : '⚡ EJECUTANDO CAMBIOS REALES\n')

  // 1. Cargar órdenes
  const { data: orders, error: ordErr } = await supabase
    .from('orders')
    .select('order_id, order_name, specialist_ref, share_cart, shopify_created_at, line_items, total_discounts')
    .in('order_name', ORDER_NAMES)
  if (ordErr) throw ordErr

  console.log(`Órdenes encontradas: ${orders.length} de ${ORDER_NAMES.length}\n`)

  // 2. Buscar owner_id en sharecarts para cada token
  const tokens = orders.map(o => o.share_cart).filter(Boolean)
  const { data: carts } = await supabase
    .from('sharecarts')
    .select('token, owner_id')
    .in('token', tokens)

  const cartMap = {}
  for (const c of (carts || [])) cartMap[c.token] = c.owner_id

  // 3. Cargar historial de comisiones y mapa variant→product
  const productIds = [...new Set(orders.flatMap(o => (o.line_items || []).map(i => i.product_id).filter(Boolean)))]

  const { data: variantRows } = await supabase
    .from('product_variant_commissions')
    .select('variant_id, product_id')
    .in('product_id', productIds)

  const variantMap = {}
  for (const r of (variantRows || [])) {
    const pid = String(r.product_id)
    if (!variantMap[pid]) variantMap[pid] = []
    variantMap[pid].push(r.variant_id)
  }

  const allVariantIds = [...new Set(Object.values(variantMap).flat())]
  const { data: history } = await supabase
    .from('product_commission_history')
    .select('variant_id, commission_percent, recorded_at')
    .in('variant_id', allVariantIds)
    .order('recorded_at', { ascending: false })

  // 4. Procesar cada orden
  for (const order of orders) {
    const token      = order.share_cart
    const ownerId    = token ? cartMap[token] : null
    const specialistId = ownerId ? Number(ownerId) : null

    console.log(`\n── ${order.order_name} ──────────────────────`)
    console.log(`  share_cart:     ${token || 'ninguno'}`)
    console.log(`  owner_id supa:  ${ownerId || '❌ no encontrado en sharecarts'}`)

    if (!specialistId) {
      console.log(`  ⏭️  Saltando — sin specialist para asignar`)
      continue
    }

    // Calcular comisión histórica
    const items         = (order.line_items || []).filter(i => i.title && !i.title.toLowerCase().includes('tip'))
    const orderSubtotal = items.reduce((s, i) => s + Number(i.price || 0) * (i.quantity || 1), 0)
    const totalDiscount = Number(order.total_discounts || 0)

    let totalCommission = 0
    const breakdown     = []

    for (const item of items) {
      const commPct  = await getHistoricalComm(item.product_id, variantMap, history || [], order.shopify_created_at)
      const price    = Number(item.price || 0)
      const qty      = item.quantity || 1
      const lineSub  = price * qty
      const lineDisc = orderSubtotal > 0 ? totalDiscount * (lineSub / orderSubtotal) : 0
      const lineNet  = lineSub - lineDisc
      const lineComm = commPct !== null ? lineNet * (commPct / 100) : 0

      totalCommission += lineComm
      breakdown.push({
        title:              item.title?.slice(0, 40),
        commission_percent: commPct ?? 'SIN HISTORIAL',
        subtotal:           lineNet.toFixed(2),
        ganancia:           lineComm.toFixed(2),
      })
    }

    totalCommission = Number(totalCommission.toFixed(2))

    console.log(`  specialist_ref → ${specialistId}`)
    console.log(`  comisión total: $${totalCommission}`)
    breakdown.forEach(b => console.log(`    · ${b.title} — ${b.commission_percent}% → $${b.ganancia}`))

    if (DRY_RUN) {
      console.log(`  [DRY RUN] No se ejecutaron cambios`)
      continue
    }

    // Idempotencia — no duplicar transacción
    const { data: existingTx } = await supabase
      .from('point_transactions')
      .select('id')
      .eq('reference_id', String(order.order_id))
      .eq('reference_type', 'shopify_order')
      .eq('category', 'earning')
      .maybeSingle()

    // Actualizar specialist_ref
    const { error: updErr } = await supabase
      .from('orders')
      .update({ specialist_ref: String(specialistId) })
      .eq('order_id', order.order_id)

    if (updErr) { console.error(`  ❌ Error actualizando orden:`, updErr.message); continue }
    console.log(`  ✅ specialist_ref actualizado`)

    // Insertar transacción si no existe y hay comisión
    if (existingTx) {
      console.log(`  ⏭️  Transacción ya existe — omitida`)
    } else if (totalCommission > 0) {
      const { error: txErr } = await supabase
        .from('point_transactions')
        .insert([{
          customer_id:    specialistId,
          points:         totalCommission,
          direction:      'IN',
          category:       'earning',
          status:         'confirmed',
          reference_id:   String(order.order_id),
          reference_type: 'shopify_order',
          description:    `Ganancia por orden ${order.order_name}`,
          actor_type:     'system',
          metadata: {
            order_number:      order.order_name,
            shopify_order_id:  order.order_id,
            corrected:         true,
            commission_source: 'historical',
            breakdown,
          },
        }])
      if (txErr) console.error(`  ❌ Error insertando transacción:`, txErr.message)
      else console.log(`  ✅ Transacción creada: $${totalCommission}`)
    } else {
      console.log(`  ⚠️  Comisión $0 — transacción no creada`)
    }
  }

  console.log(`\n${'─'.repeat(50)}`)
  console.log(DRY_RUN ? '🔍 DRY RUN completo — cambiar DRY_RUN = false para ejecutar' : '✅ Corrección completa')
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
