// scripts/reporte_ventas_afiliados.js
// Reporte anual de ventas de afiliados — último año completo.
// Fuente de órdenes: Supabase (filtra solo afiliado).
// Enriquecimiento de SKUs: Shopify GraphQL (vendor, marca, sku_seller, comision_afiliado).
// Escribe una tab por mes en el Google Sheet existente.
//
// Uso: node --env-file=.env scripts/reporte_ventas_afiliados.js
//      node --env-file=.env scripts/reporte_ventas_afiliados.js 2025-08 2026-07  (rango manual)

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const SHEET_ID      = '16qtU3hbpOynNt90htLrvQujMW3TAG8sWG-Z_uPN6Hno'

const HEADERS = [
  'N° Orden', 'Tipo de carrito', 'Tipo de venta', 'Tamaño del carrito',
  'Nombre', 'Vendor', 'Marca', 'SKU_Seller', 'Precio', 'Cantidad',
  'Comision', 'Venta menos comisión', 'Fecha', 'Guía de envío',
  'Pto extra en carrito', 'Neto a liquidar', 'SKU', 'comision afiliado',
  'Canal de Venta', 'specialist_ref',
]

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Rango de fechas ───────────────────────────────────────────

function buildRange(arg) {
  if (arg) {
    // YYYY-MM → solo ese mes
    const [y, m] = arg.split('-').map(Number)
    const lastDay = new Date(y, m, 0).getDate()
    return {
      fromISO: `${arg}-01T00:00:00Z`,
      toISO:   `${arg}-${String(lastDay).padStart(2, '0')}T23:59:59Z`,
      tabName: arg,             // tab "2026-07" igual que el original
      label:   arg,
    }
  }
  // Sin arg → año en curso completo, tab "YYYY-general"
  const now  = new Date()
  const year = now.getFullYear()
  return {
    fromISO: `${year}-01-01T00:00:00Z`,
    toISO:   `${year}-12-31T23:59:59Z`,
    tabName: `${year}-general`,
    label:   `${year} completo`,
  }
}

// ── Supabase: órdenes de afiliado en rango ────────────────────

async function getAffiliateOrders(fromISO, toISO) {
  const PAGE = 1000
  let offset = 0
  const all  = []

  while (true) {
    const { data, error } = await supabase
      .from('orders')
      .select('order_id, order_name, specialist_ref, corrected_ref, share_cart, shopify_created_at, line_items, total, total_discounts')
      .eq('financial_status', 'paid')
      .or('specialist_ref.not.is.null,corrected_ref.not.is.null')
      .neq('specialist_ref', '0000')
      .gte('shopify_created_at', fromISO)
      .lte('shopify_created_at', toISO)
      .order('shopify_created_at', { ascending: true })
      .range(offset, offset + PAGE - 1)

    if (error) throw error
    if (!data?.length) break
    all.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }

  return all
}

// ── Shopify: enriquecimiento de SKUs ──────────────────────────

async function shopifySkuLookup(skus) {
  if (!skus.size) return {}

  const result  = {}
  const skuList = [...skus]
  const marcaGids = new Set()

  for (let i = 0; i < skuList.length; i += 20) {
    const chunk   = skuList.slice(i, i + 20)
    const aliases = chunk.map((sku, idx) => `
      v${idx}: productVariants(first: 1, query: "sku:'${sku.replace(/'/g, "\\'")}'" ) {
        edges { node {
          sku
          skuSeller:        metafield(namespace: "custom", key: "sku_seller")        { value }
          comisionAfiliado: metafield(namespace: "custom", key: "comision_afiliado") { value }
          product {
            vendor
            marcaField: metafield(namespace: "custom", key: "marca_lista") { value }
          }
        }}
      }`).join('\n')

    const res  = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
      method:  'POST',
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query: `{ ${aliases} }` }),
    })
    const data = await res.json()

    chunk.forEach((sku, idx) => {
      const variant = data?.data?.[`v${idx}`]?.edges?.[0]?.node
      if (!variant) return
      const marcaRaw = variant.product?.marcaField?.value || ''
      if (marcaRaw.startsWith('gid://')) marcaGids.add(marcaRaw)
      result[sku] = {
        vendor:            variant.product?.vendor || '',
        marca:             marcaRaw,
        sku_seller:        variant.skuSeller?.value        || '',
        comision_afiliado: variant.comisionAfiliado?.value || '',
      }
    })
    await sleep(300)
  }

  // Resolver GIDs de marca
  if (marcaGids.size) {
    const gidList = [...marcaGids]
    const aliases = gidList.map((gid, i) =>
      `m${i}: node(id: "${gid}") { ... on Metaobject { n: field(key: "nombre") { value } name: field(key: "name") { value } } }`
    ).join('\n')
    const res  = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
      method:  'POST',
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ query: `{ ${aliases} }` }),
    })
    const data = await res.json()
    const marcaMap = {}
    gidList.forEach((gid, i) => {
      const node = data?.data?.[`m${i}`]
      marcaMap[gid] = node?.n?.value || node?.name?.value || ''
    })
    for (const sku of Object.keys(result)) {
      const raw = result[sku].marca
      if (raw.startsWith('gid://')) result[sku].marca = marcaMap[raw] || result[sku].vendor
    }
  }

  return result
}

// ── Comisiones históricas ─────────────────────────────────────

async function loadCommissionData() {
  // 1. product_id → [variant_ids]
  const { data: variantRows, error: e1 } = await supabase
    .from('product_variant_commissions')
    .select('variant_id, product_id')
  if (e1) throw e1

  const productToVariants = {}
  for (const r of variantRows || []) {
    const pid = String(r.product_id)
    if (!productToVariants[pid]) productToVariants[pid] = []
    productToVariants[pid].push(r.variant_id)
  }

  // 2. Historial completo, desc por fecha (el primero ≤ orderDate es el vigente)
  const { data: history, error: e2 } = await supabase
    .from('product_commission_history')
    .select('variant_id, commission_percent, recorded_at')
    .order('recorded_at', { ascending: false })
  if (e2) throw e2

  return { productToVariants, history: history || [] }
}

function getHistoricalComm(productId, orderDate, productToVariants, history) {
  const variants = productToVariants[String(productId)] || []
  const record   = history.find(h => variants.includes(h.variant_id) && h.recorded_at <= orderDate)
  return record ? Number(record.commission_percent) : null
}

// ── Transform ─────────────────────────────────────────────────

function fmtISO(iso) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

function calcCartFields(lineItems) {
  const subtotal  = lineItems.reduce((s, i) => s + Number(i.price) * Number(i.quantity || 1), 0)
  const tamano    = subtotal >= 599 ? 'mayor que $599' : 'menor que $599'
  const vendors   = new Set(lineItems.map(i => i.vendor).filter(Boolean))
  const tipoCarrito = vendors.size <= 1 ? 'Propio' : 'Compartido'

  const vendorSeen = new Set()
  const guiaExtra  = lineItems.map(item => {
    const qty   = Number(item.quantity || 1)
    const price = Number(item.price || 0)
    const v     = item.vendor || ''
    if (subtotal < 599) return [0, 0]
    if (price < 599)    return [0, 20 * qty]
    if (!vendorSeen.has(v)) { vendorSeen.add(v); return [85, 20 * (qty - 1)] }
    return [0, 20 * qty]
  })
  return { guiaExtra, tipoCarrito, tamano }
}

function transformOrders(orders, skuData, productToVariants, history) {
  const byMonth = {}

  for (const order of orders) {
    const rawRef   = order.specialist_ref || order.corrected_ref || ''
    const sref     = rawRef === '0000' ? '' : rawRef
    const monthKey = order.shopify_created_at.slice(0, 7)
    const fecha    = fmtISO(order.shopify_created_at)

    const items = (order.line_items || []).filter(i =>
      i.sku && !String(i.title || '').toLowerCase().includes('tip')
    )
    if (!items.length) continue

    const enrichedItems = items.map(i => ({
      ...i,
      vendor: skuData[(i.sku || '').trim().toUpperCase()]?.vendor || '',
    }))

    const { guiaExtra, tipoCarrito, tamano } = calcCartFields(enrichedItems)
    const discountTotal = Number(order.total_discounts || 0)
    const subtotal      = enrichedItems.reduce((s, i) => s + Number(i.price) * Number(i.quantity || 1), 0)

    if (!byMonth[monthKey]) byMonth[monthKey] = []

    enrichedItems.forEach((item, idx) => {
      const sku    = (item.sku || '').trim().toUpperCase()
      const qty    = Number(item.quantity || 1)
      const precio = Number(item.price || 0)
      const info   = skuData[sku] || {}

      const lineSubtotal = precio * qty
      const lineDisc     = subtotal > 0 ? discountTotal * (lineSubtotal / subtotal) : 0
      const lineNet      = lineSubtotal - lineDisc

      // Comisión afiliado: histórica al momento de la orden, fallback al metafield actual
      const histComm     = getHistoricalComm(item.product_id, order.shopify_created_at, productToVariants, history)
      const comisionAfil = histComm !== null ? histComm : Number(info.comision_afiliado || 0)
      const sinHistorial = histComm === null && comisionAfil > 0 // usó valor actual

      // Comisión total: base 20 + afiliado (solo si la orden es de afiliado)
      const esAfiliado = !!sref
      const comision   = esAfiliado ? 20 + comisionAfil : 20

      const ventaMenosCom = Math.round(lineNet * (1 - comision / 100) * 100) / 100
      const [guia, extra] = guiaExtra[idx] || [0, 0]
      const neto          = Math.round((ventaMenosCom - guia - extra) * 100) / 100

      // En col R mostramos solo la parte del afiliado (con * si no hay historial)
      const comisionAfilLabel = esAfiliado
        ? (sinHistorial ? `${comisionAfil}*` : `${comisionAfil}`)
        : ''

      byMonth[monthKey].push([
        order.order_name, tipoCarrito, esAfiliado ? 'Afiliado' : 'marketplace', tamano,
        item.title || '', info.vendor || '', info.marca || '', info.sku_seller || '',
        precio, qty, comision, ventaMenosCom,
        fecha, guia, extra, neto,
        sku, comisionAfilLabel, 'shopify', sref,
      ])
    })
  }

  return byMonth
}

// ── Google Sheets ─────────────────────────────────────────────

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key:  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

async function writeToSheet(sheets, tabName, rows) {
  const meta     = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const existing = meta.data.sheets.find(s => s.properties.title === tabName)

  if (existing) {
    await sheets.spreadsheets.values.clear({ spreadsheetId: SHEET_ID, range: `${tabName}!A:Z` })
  } else {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    })
  }

  const rowsWithFormulas = rows.map((row, idx) => {
    const r  = idx + 2
    const r2 = [...row]
    r2[11] = `=I${r}*J${r}*(1-K${r}/100)`
    r2[15] = `=L${r}-N${r}-O${r}`
    return r2
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADERS, ...rowsWithFormulas] },
  })
  console.log(`  ✅ '${tabName}' → ${rows.length} filas`)
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2] // opcional: "2026-07"
  if (arg && !/^\d{4}-\d{2}$/.test(arg)) {
    console.error('Uso: node scripts/reporte_ventas_afiliados.js [YYYY-MM]')
    process.exit(1)
  }

  const { fromISO, toISO, tabName, label } = buildRange(arg)

  console.log(`=== Reporte ventas: ${label} ===`)
  console.log(`Consultando Supabase [${fromISO} … ${toISO}]...`)

  const orders = await getAffiliateOrders(fromISO, toISO)
  console.log(`  ${orders.length} órdenes`)

  if (!orders.length) { console.log('Sin órdenes. Fin.'); return }

  console.log('Recolectando SKUs únicos...')
  const allSkus = new Set()
  for (const o of orders)
    for (const i of (o.line_items || []))
      if (i.sku) allSkus.add(i.sku.trim().toUpperCase())
  console.log(`  ${allSkus.size} SKUs únicos`)

  console.log('Enriqueciendo desde Shopify GraphQL...')
  const skuData = await shopifySkuLookup(allSkus)
  console.log(`  ${Object.keys(skuData).length} SKUs enriquecidos`)

  console.log('Cargando comisiones históricas desde Supabase...')
  const { productToVariants, history } = await loadCommissionData()
  console.log(`  ${history.length} registros históricos`)

  console.log('Transformando...')
  const byMonth = transformOrders(orders, skuData, productToVariants, history)
  const allRows = Object.values(byMonth).flat()

  console.log(`Escribiendo ${allRows.length} líneas en tab '${tabName}'...`)
  const auth   = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  await writeToSheet(sheets, tabName, allRows)

  console.log(`\n=== Listo — ${allRows.length} líneas en '${tabName}' ===`)
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
