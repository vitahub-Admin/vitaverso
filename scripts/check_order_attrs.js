// scripts/check_order_attrs.js
// Verifica que una orden de Shopify tiene los note_attributes correctos
// y cruza contra lo que quedó guardado en Supabase.
//
// Uso: node --env-file=.env scripts/check_order_attrs.js #ORDVHMX12345

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const ORDER_NAME = process.argv[2]
if (!ORDER_NAME) {
  console.error('Uso: node --env-file=.env scripts/check_order_attrs.js #ORDVHMX12345')
  process.exit(1)
}

const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

async function main() {
  // 1. Buscar la orden en Shopify por nombre
  const url = `https://${SHOPIFY_STORE}/admin/api/2025-01/orders.json?name=${encodeURIComponent(ORDER_NAME)}&status=any&fields=id,name,note_attributes,financial_status,customer`
  const res  = await fetch(url, {
    headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN },
  })
  const json = await res.json()
  const order = json.orders?.[0]

  if (!order) {
    console.log(`\n❌ Orden ${ORDER_NAME} no encontrada en Shopify`)
    return
  }

  console.log(`\n══════════════════════════════════════`)
  console.log(`Orden: ${order.name}  (id: ${order.id})`)
  console.log(`Estado: ${order.financial_status}`)
  console.log(`──────────────────────────────────────`)
  console.log(`note_attributes en Shopify:`)

  const attrs = order.note_attributes || []
  if (!attrs.length) {
    console.log('  (ninguno)')
  } else {
    attrs.forEach(a => console.log(`  ${a.name.padEnd(20)} = ${a.value}`))
  }

  const shopifyRef   = attrs.find(a => a.name === 'specialist_ref')?.value || null
  const shopifyToken = attrs.find(a => a.name === 'share_cart')?.value     || null

  console.log(`\n  specialist_ref → ${shopifyRef  || '❌ ausente'}`)
  console.log(`  share_cart     → ${shopifyToken || '❌ ausente'}`)

  // 2. Cruzar con Supabase
  const { data: supaOrder } = await supabase
    .from('orders')
    .select('order_id, order_name, specialist_ref, share_cart, status, corrected_ref')
    .eq('order_name', ORDER_NAME)
    .maybeSingle()

  console.log(`\n──────────────────────────────────────`)
  console.log(`En Supabase:`)
  if (!supaOrder) {
    console.log('  ❌ No existe en la tabla orders (webhook aún no procesado?)')
  } else {
    console.log(`  specialist_ref  = ${supaOrder.specialist_ref  || '❌ vacío'}`)
    console.log(`  share_cart      = ${supaOrder.share_cart      || '❌ vacío'}`)
    console.log(`  corrected_ref   = ${supaOrder.corrected_ref   || '-'}`)
    console.log(`  status          = ${supaOrder.status}`)
  }

  // 3. Cruzar el token con sharecarts
  if (shopifyToken || supaOrder?.share_cart) {
    const token = shopifyToken || supaOrder.share_cart
    const { data: cart } = await supabase
      .from('sharecarts')
      .select('token, owner_id, name, phone, created_at')
      .eq('token', token)
      .maybeSingle()

    console.log(`\n──────────────────────────────────────`)
    console.log(`Sharecart (token: ${token}):`)
    if (!cart) {
      console.log('  ❌ No encontrado en sharecarts')
    } else {
      console.log(`  owner_id  = ${cart.owner_id}`)
      console.log(`  cliente   = ${cart.name || '-'}`)
      console.log(`  phone     = ${cart.phone || '-'}`)
      console.log(`  creado    = ${cart.created_at?.slice(0,19)}`)
    }
  }

  // 4. Ver si hay transacción en wallet
  if (supaOrder?.order_id) {
    const { data: tx } = await supabase
      .from('point_transactions')
      .select('id, points, status, created_at')
      .eq('reference_id', String(supaOrder.order_id))
      .eq('reference_type', 'shopify_order')
      .eq('category', 'earning')
      .maybeSingle()

    console.log(`\n──────────────────────────────────────`)
    console.log(`Transacción de comisión:`)
    if (!tx) {
      console.log('  ❌ Sin transacción (sin comisión o no procesada)')
    } else {
      console.log(`  ✅ $${tx.points}  estado: ${tx.status}  fecha: ${tx.created_at?.slice(0,19)}`)
    }
  }

  console.log(`\n══════════════════════════════════════\n`)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
