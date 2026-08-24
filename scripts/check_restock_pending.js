// scripts/check_restock_pending.js
// Muestra cambios recientes en product_stock_state y notificaciones pendientes.
// Solo lectura — no envía nada ni modifica la DB.
//
// Uso:
//   node --env-file=.env scripts/check_restock_pending.js           (últimos 7 días)
//   node --env-file=.env scripts/check_restock_pending.js --dias=30 (últimos N días)

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const diasArg = (process.argv.find(a => a.startsWith('--dias=')) || '--dias=7').split('=')[1]
const DIAS    = Math.max(1, parseInt(diasArg) || 7)
const cutoff  = new Date(Date.now() - DIAS * 24 * 3600 * 1000).toISOString()

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

async function main() {
  console.log(`\n📦 CHECK RESTOCK PENDING — últimos ${DIAS} días`)
  console.log(`   Desde: ${fmt(cutoff)}`)
  console.log('═'.repeat(90))

  // ── 1. Productos que volvieron al stock recientemente ──────────
  const { data: recentBack, error: e1 } = await supabase
    .from('product_stock_state')
    .select('sku, variant_id, stock_quantity, came_back_at, notified_at, updated_at')
    .not('came_back_at', 'is', null)
    .gte('came_back_at', cutoff)
    .order('came_back_at', { ascending: false })

  if (e1) throw new Error(`product_stock_state: ${e1.message}`)

  console.log(`\n🟢 VOLVIERON AL STOCK (últimos ${DIAS} días): ${recentBack?.length || 0} productos`)

  if (recentBack?.length) {
    console.log(
      '\n  ' +
      'SKU'.padEnd(22) +
      'Stock'.padEnd(8) +
      'Volvió'.padEnd(22) +
      'Notificado'.padEnd(22) +
      'Estado'
    )
    console.log('  ' + '─'.repeat(84))

    for (const r of recentBack) {
      const pendiente  = !r.notified_at || r.notified_at < r.came_back_at
      const estado     = pendiente ? '⏳ PENDIENTE' : '✅ notificado'
      const sku        = (r.sku || '').slice(0, 20).padEnd(20)
      const stock      = String(r.stock_quantity).padEnd(6)
      const back       = fmt(r.came_back_at).padEnd(20)
      const notif      = fmt(r.notified_at).padEnd(20)
      console.log(`  ${sku}  ${stock}  ${back}  ${notif}  ${estado}`)
    }
  }

  // ── 2. Productos que se agotaron recientemente ─────────────────
  const { data: recentOut, error: e2 } = await supabase
    .from('product_stock_state')
    .select('sku, stock_quantity, went_out_at, updated_at')
    .not('went_out_at', 'is', null)
    .gte('went_out_at', cutoff)
    .eq('stock_quantity', 0)
    .order('went_out_at', { ascending: false })

  if (e2) throw new Error(`product_stock_state (out): ${e2.message}`)

  console.log(`\n🔴 SE AGOTARON (últimos ${DIAS} días): ${recentOut?.length || 0} productos`)

  if (recentOut?.length) {
    console.log('\n  ' + 'SKU'.padEnd(22) + 'Se agotó')
    console.log('  ' + '─'.repeat(50))
    for (const r of recentOut) {
      console.log(`  ${(r.sku || '').slice(0, 20).padEnd(20)}  ${fmt(r.went_out_at)}`)
    }
  }

  // ── 3. Resumen de pendientes globales ─────────────────────────
  // PostgREST no soporta comparación columna-vs-columna en .or(),
  // así que hacemos dos queries y filtramos en JS.
  const [{ data: nullNotif, error: e3a }, { data: staleNotif, error: e3b }] = await Promise.all([
    // a) nunca notificados
    supabase.from('product_stock_state')
      .select('sku, variant_id, stock_quantity, came_back_at, notified_at')
      .not('came_back_at', 'is', null)
      .is('notified_at', null)
      .gt('stock_quantity', 0),
    // b) notificados antes del último restock
    supabase.from('product_stock_state')
      .select('sku, variant_id, stock_quantity, came_back_at, notified_at')
      .not('came_back_at', 'is', null)
      .not('notified_at', 'is', null)
      .gt('stock_quantity', 0),
  ])

  if (e3a) throw new Error(`pending (null): ${e3a.message}`)
  if (e3b) throw new Error(`pending (stale): ${e3b.message}`)

  const allPending = [
    ...(nullNotif  || []),
    ...(staleNotif || []).filter(p => p.notified_at < p.came_back_at),
  ].sort((a, b) => b.came_back_at.localeCompare(a.came_back_at))

  const pendingWithVariant  = (allPending || []).filter(p => p.variant_id)
  const pendingNoVariant    = (allPending || []).filter(p => !p.variant_id)

  console.log(`\n📊 PENDIENTES DE NOTIFICACIÓN GLOBALES:`)
  console.log(`   Total en stock con notif. pendiente: ${allPending?.length || 0}`)
  console.log(`   Con variant_id (enviables):          ${pendingWithVariant.length}`)
  console.log(`   Sin variant_id (no enviables):       ${pendingNoVariant.length}`)

  if (pendingWithVariant.length) {
    console.log(`\n  Más recientes a notificar:`)
    for (const r of pendingWithVariant.slice(0, 10)) {
      const dias = Math.round((Date.now() - new Date(r.came_back_at)) / (1000 * 3600 * 24))
      console.log(`     ${(r.sku || '').padEnd(22)} volvió hace ${dias} día${dias !== 1 ? 's' : ''}`)
    }
    if (pendingWithVariant.length > 10) {
      console.log(`     … y ${pendingWithVariant.length - 10} más`)
    }
  }

  // ── 4. Recomendación ──────────────────────────────────────────
  console.log('\n' + '═'.repeat(90))
  if (pendingWithVariant.length > 0) {
    console.log(`\n  ⚡ Hay ${pendingWithVariant.length} SKUs listos para notificar.`)
    console.log(`     Corre: node --env-file=.env scripts/send_restock_emails.js`)
    console.log(`     O dispara el webhook de n8n manualmente.\n`)
  } else {
    console.log(`\n  ✅ Sin pendientes — no hay nada que notificar ahora.\n`)
  }
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
