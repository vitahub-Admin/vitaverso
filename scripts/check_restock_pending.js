// scripts/check_restock_pending.js
// Muestra cambios recientes en product_stock_state y notificaciones pendientes.
//
// Uso:
//   node --env-file=.env scripts/check_restock_pending.js                        (últimos 7 días)
//   node --env-file=.env scripts/check_restock_pending.js --dias=30              (últimos N días)
//   node --env-file=.env scripts/check_restock_pending.js --test-email=tu@mail.com
//        → manda el email real al afiliado con más productos pendientes, pero a esa dirección

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)
const resend = new Resend(process.env.RESEND_API_KEY)

const diasArg      = (process.argv.find(a => a.startsWith('--dias='))       || '--dias=7').split('=')[1]
const testEmailArg =  process.argv.find(a => a.startsWith('--test-email='))
const TEST_EMAIL   = testEmailArg ? testEmailArg.split('=').slice(1).join('=') : null
const DIAS         = Math.max(1, parseInt(diasArg) || 7)
const cutoff       = new Date(Date.now() - DIAS * 24 * 3600 * 1000).toISOString()
const CUTOFF_DAYS  = 90

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

  // ── 4. Recomendación / test email ─────────────────────────────
  console.log('\n' + '═'.repeat(90))
  if (pendingWithVariant.length > 0) {
    console.log(`\n  ⚡ Hay ${pendingWithVariant.length} SKUs listos para notificar.`)
    if (TEST_EMAIL) {
      console.log(`\n  📧 Modo test — enviando a: ${TEST_EMAIL}`)
    } else {
      console.log(`     Corre: node --env-file=.env scripts/send_restock_emails.js`)
      console.log(`     O dispara el webhook de n8n manualmente.\n`)
    }
  } else {
    console.log(`\n  ✅ Sin pendientes — no hay nada que notificar ahora.\n`)
  }

  // ── 5. Test email ─────────────────────────────────────────────
  if (!TEST_EMAIL || !pendingWithVariant.length) return

  console.log('\n  Buscando afiliado con más productos pendientes...')

  // Sharecarts de los últimos 90 días
  const cartCutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 3600 * 1000).toISOString()
  const { data: allCarts } = await supabase
    .from('sharecarts').select('owner_id, items')
    .gte('created_at', cartCutoff).not('owner_id', 'is', null)

  // Índice variant_id → { owner_id: count }
  const variantOwnerCount = {}
  for (const cart of (allCarts || [])) {
    const items = Array.isArray(cart.items) ? cart.items : []
    const oid   = String(cart.owner_id)
    for (const item of items) {
      const vid = item.variant_id != null ? String(item.variant_id) : null
      if (!vid) continue
      if (!variantOwnerCount[vid]) variantOwnerCount[vid] = {}
      variantOwnerCount[vid][oid] = (variantOwnerCount[vid][oid] || 0) + 1
    }
  }

  // Cruzar con pendientes → owner con más productos
  const ownerProducts = {}
  for (const item of pendingWithVariant) {
    const ownerCount = variantOwnerCount[String(item.variant_id)] || {}
    for (const oid of Object.keys(ownerCount)) {
      if (!ownerProducts[oid]) ownerProducts[oid] = {}
      ownerProducts[oid][item.sku] = { sku: item.sku, variant_id: item.variant_id }
    }
  }

  const topOwner = Object.entries(ownerProducts)
    .sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)[0]

  if (!topOwner) {
    console.log('  ⚠️  Ningún afiliado tiene estos productos en sus sharecarts — email no enviado.')
    return
  }

  const [ownerId, productMap] = topOwner
  console.log(`  → Afiliado elegido: owner_id ${ownerId} (${Object.keys(productMap).length} productos)`)

  // Enriquecer productos
  const skus = Object.keys(productMap)
  const { data: catRows } = await supabase
    .from('product_catalog').select('sku, title, brand, price, product_id').in('sku', skus)
  const titleMap = Object.fromEntries((catRows || []).map(r => [r.sku, r]))

  const variantIds = Object.values(productMap).map(p => p.variant_id)
  const { data: commRows } = await supabase
    .from('product_variant_commissions').select('variant_id, commission_percent')
    .in('variant_id', variantIds).eq('active', true)
  const commMap = Object.fromEntries((commRows || []).map(r => [r.variant_id, r.commission_percent]))

  // Imágenes desde Shopify GraphQL
  const productIds = [...new Set((catRows || []).map(r => r.product_id).filter(Boolean))]
  let shopifyData = {}
  if (productIds.length) {
    const aliases = productIds.map((pid, i) =>
      `p${i}: node(id: "gid://shopify/Product/${pid}") { ... on Product { id handle featuredImage { url } } }`
    ).join('\n')
    const res  = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN },
      body: JSON.stringify({ query: `{ ${aliases} }` }),
    })
    const json = await res.json()
    productIds.forEach((pid, i) => {
      const node = json.data?.[`p${i}`]
      if (node) shopifyData[pid] = { image_url: node.featuredImage?.url || null, handle: node.handle || null }
    })
  }

  const products = skus.map(sku => {
    const cat = titleMap[sku] || {}
    const vid = productMap[sku].variant_id
    const sd  = shopifyData[cat.product_id] || {}
    return {
      sku,
      title:              cat.title  || sku,
      brand:              cat.brand  || null,
      price:              cat.price  || 0,
      commission_percent: commMap[vid] ?? null,
      image_url:          sd.image_url || null,
      handle:             sd.handle   || null,
    }
  })

  // Datos del afiliado
  const { data: aff } = await supabase
    .from('affiliates').select('first_name, last_name, email')
    .eq('shopify_customer_id', Number(ownerId)).maybeSingle()

  const specialistName = aff
    ? `${aff.first_name || ''} ${aff.last_name || ''}`.trim() || 'Especialista'
    : `Especialista (owner ${ownerId})`
  const realEmail = aff?.email || '(sin email)'

  // Construir HTML del email (mismo template que el route)
  const productRows = products.map(p => {
    const precio    = Number(p.price || 0)
    const comPct    = Number(p.commission_percent || 0)
    const comAmount = (precio * comPct / 100).toFixed(2)
    const precioFmt = precio.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
    const comFmt    = Number(comAmount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
    const productUrl = p.handle ? `https://vitahub.mx/products/${p.handle}` : null
    const imgHtml   = p.image_url
      ? `<img src="${p.image_url}" width="80" height="80" alt="${p.title}" style="border-radius:10px;object-fit:cover;display:block;">`
      : `<div style="width:80px;height:80px;background:#f3f4f6;border-radius:10px;"></div>`
    const imgCell   = productUrl ? `<a href="${productUrl}" style="display:block;">${imgHtml}</a>` : imgHtml
    const titleHtml = productUrl
      ? `<a href="${productUrl}" style="font-size:15px;font-weight:700;color:#1b3f7a;text-decoration:none;">${p.title}</a>`
      : `<span style="font-size:15px;font-weight:700;color:#1b3f7a;">${p.title}</span>`
    return `
    <tr><td style="padding:16px 0;border-bottom:1px solid #f0f0f0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="88" valign="top" style="padding-right:16px;">${imgCell}</td>
        <td valign="middle">
          <p style="margin:0 0 4px;">${titleHtml}</p>
          ${p.brand ? `<p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">${p.brand}</p>` : ''}
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:12px;">
              <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Precio</span><br>
              <span style="font-size:16px;font-weight:700;color:#111827;">${precioFmt}</span>
            </td>
            <td>
              <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Tu comisión</span><br>
              <span style="display:inline-block;background:#d1fae5;color:#065f46;font-size:15px;font-weight:800;padding:2px 10px;border-radius:20px;">${comFmt}</span>
            </td>
          </tr></table>
        </td>
      </tr></table>
    </td></tr>`
  }).join('')

  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Productos de vuelta en stock</title></head>
<body style="margin:0;padding:0;background:#F7F9FB;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F9FB;">
<tr><td align="center" style="padding:40px 20px;">
<table cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">
  <tr><td style="background:#1b3f7a;border-radius:16px 16px 0 0;padding:28px 36px 24px;">
    <p style="margin:0 0 6px;color:#7eb8c9;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">Vitahub Pro · TEST</p>
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.3;">🎉 Productos de vuelta en la tienda</h1>
  </td></tr>
  <tr><td style="background:#fff3cd;padding:10px 36px;border-bottom:2px solid #ffc107;">
    <p style="margin:0;font-size:12px;color:#856404;">
      🧪 <strong>Email de prueba</strong> — destinatario real: <strong>${specialistName}</strong> &lt;${realEmail}&gt;
    </p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:28px 36px 8px;">
    <p style="margin:0 0 6px;font-size:15px;color:#374151;">Hola <strong>${specialistName}</strong>,</p>
    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;">
      Los siguientes productos volvieron a estar disponibles en la tienda.<br>
      Ya puedes volver a incluirlos en tus prescripciones para tus pacientes.
    </p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:4px 36px 8px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">${productRows}</table>
  </td></tr>
  <tr><td style="background:#f0f7ff;border-top:2px solid #dbeafe;padding:24px 36px;text-align:center;border-radius:0 0 16px 16px;">
    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1b3f7a;">¿Ya probaste nuestro armador de prescripciones?</p>
    <a href="https://pro.vitahub.mx/mis-protocolos"
       style="display:inline-block;background:#1b3f7a;color:#ffffff;font-size:14px;font-weight:700;padding:13px 32px;border-radius:8px;text-decoration:none;">
      Ir al armador de prescripciones →
    </a>
  </td></tr>
</table></td></tr></table></body></html>`

  const subject = products.length === 1
    ? `🎉 [TEST] "${products[0].title}" volvió al stock`
    : `🎉 [TEST] ${products.length} productos volvieron al stock`

  const { error: resendErr } = await resend.emails.send({
    from:    'Vitahub Pro <noreply@pro.vitahub.mx>',
    to:      TEST_EMAIL,
    subject,
    html,
  })

  if (resendErr) {
    console.error(`\n  ❌ Error Resend: ${resendErr.message}\n`)
  } else {
    console.log(`\n  ✅ Email enviado a ${TEST_EMAIL}`)
    console.log(`     Simulando: ${specialistName} · ${products.length} producto${products.length !== 1 ? 's' : ''}`)
    console.log(`     (Email real del afiliado: ${realEmail})\n`)
  }
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
