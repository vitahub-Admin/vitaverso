// scripts/reporte_ventas.js
// Genera reporte mensual o anual TikTok + Shopify → Google Sheets
// Uso: node scripts/reporte_ventas.js 2026-05          (mensual → tab "2026-05")
//      node scripts/reporte_ventas.js 2026             (anual   → tab "2026-general", comisiones históricas)

import 'dotenv/config'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'

const BL_TOKEN    = process.env.BASELINKER_TOKEN
const BL_URL      = 'https://api.baselinker.com/connector.php'
const BL_DELAY    = 650

const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

const SHEET_ID = '16qtU3hbpOynNt90htLrvQujMW3TAG8sWG-Z_uPN6Hno'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const STATUS_CANCELADO = 273408

const HEADERS = [
  'N° Orden', 'Tipo de carrito', 'Tipo de venta', 'Tamaño del carrito',
  'Nombre', 'Vendor', 'Marca', 'SKU_Seller', 'Precio', 'Cantidad',
  'Comision', 'Venta menos comisión', 'Fecha', 'Guía de envío',
  'Pto extra en carrito', 'Neto a liquidar', 'SKU', 'comision afiliado',
  'Canal de Venta', 'Free sample',
]

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ── Google Sheets ─────────────────────────────────────────────

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}


async function writeToSheet(tabName, rows) {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const existing = meta.data.sheets.find(s => s.properties.title === tabName)

  if (existing) {
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: `${tabName}!A:Z`,
    })
  } else {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
    })
  }

  // Reemplazar columnas calculadas con fórmulas (fila 2 en adelante por el header)
  const rowsWithFormulas = rows.map((row, idx) => {
    const r = idx + 2
    const r2 = [...row]
    r2[11] = `=I${r}*J${r}*(1-K${r}/100)` // Venta menos comisión
    r2[15] = `=L${r}-N${r}-O${r}`          // Neto a liquidar
    return r2
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${tabName}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [HEADERS, ...rowsWithFormulas] },
  })

  console.log(`  ✅ ${rows.length} filas escritas en tab '${tabName}'`)
}

// ── BaseLinker ─────────────────────────────────────────────────

async function blRequest(method, params) {
  const body = new URLSearchParams({ method, parameters: JSON.stringify(params) })
  const res = await fetch(BL_URL, {
    method: 'POST',
    headers: {
      'X-BLToken': BL_TOKEN,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
  return res.json()
}

async function getTikTokOrdersRange(tsDesde, tsHasta) {
  const seen = new Set()
  const all  = []
  let tsCursor = tsDesde

  while (true) {
    const result = await blRequest('getOrders', {
      date_confirmed_from: tsCursor,
      date_confirmed_to:   tsHasta,
      get_unconfirmed_orders: false,
    })

    if (result.status !== 'SUCCESS') {
      console.warn('  ⚠️ BaseLinker error:', result.error_message)
      break
    }

    const orders = result.orders || []
    if (!orders.length) break

    const tiktok = orders.filter(o =>
      (o.order_source || '').toLowerCase().includes('tiktok') ||
      (o.order_source_info || '').toLowerCase().includes('tiktok')
    )

    let newCount = 0
    for (const o of tiktok) {
      if (!seen.has(o.order_id)) {
        seen.add(o.order_id)
        all.push(o)
        newCount++
      }
    }
    console.log(`  → ${all.length} órdenes TikTok acumuladas (${newCount} nuevas)`)

    if (orders.length < 100) break
    if (newCount === 0) break

    const maxTs = Math.max(...orders.map(o => o.date_confirmed || o.date_add || 0))
    tsCursor = maxTs - 300
    await sleep(BL_DELAY)
  }

  return all
}

async function getTikTokOrders(year, month) {
  const tsDesde = Math.floor(Date.UTC(year, month - 1, 1, 0, 0, 0) / 1000)
  const tsHasta = Math.floor(Date.UTC(year, month, 1, 12, 0, 0) / 1000)
  return getTikTokOrdersRange(tsDesde, tsHasta)
}

// ── Shopify orders ─────────────────────────────────────────────

async function getShopifyOrdersRange(dateMin, dateMax) {
  console.log(`  dateMin: ${dateMin}`)
  console.log(`  dateMax: ${dateMax}`)

  const all = []
  let url = `https://${SHOPIFY_STORE}/admin/api/2025-01/orders.json?status=any&financial_status=paid&limit=250&created_at_min=${dateMin}&created_at_max=${dateMax}`

  while (url) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } })
    const data = await res.json()
    console.log(`  raw orders: ${data.orders?.length ?? 'error'}, error: ${data.errors ?? 'ninguno'}`)
    const orders = (data.orders || []).filter(o => !o.cancelled_at)
    all.push(...orders)
    console.log(`  → ${all.length} órdenes Shopify cargadas...`)

    const link = res.headers.get('Link') || ''
    const match = link.match(/<([^>]+)>;\s*rel="next"/)
    url = match ? match[1] : null
  }

  return all
}

async function getShopifyOrders(year, month) {
  const pad = n => String(n).padStart(2, '0')
  const dateMin = `${year}-${pad(month)}-01T00:00:00Z`
  const endUTC  = new Date(Date.UTC(year, month, 0, 23, 59, 59) + 6 * 3600 * 1000)
  return getShopifyOrdersRange(dateMin, endUTC.toISOString())
}

// ── Shopify SKU enrichment ─────────────────────────────────────

async function shopifySkuLookup(skus) {
  if (!skus.size) return {}

  const result = {}
  const skuList = [...skus]
  const marcaGids = new Set()

  // Batch de 20 SKUs por request usando aliases de productVariants
  for (let i = 0; i < skuList.length; i += 20) {
    const chunk = skuList.slice(i, i + 20)

    const aliases = chunk.map((sku, idx) => `
      v${idx}: productVariants(first: 1, query: "sku:'${sku.replace(/'/g, "\\'")}'") {
        edges {
          node {
            sku
            skuSeller:        metafield(namespace: "custom", key: "sku_seller") { value }
            comisionAfiliado: metafield(namespace: "custom", key: "comision_afiliado") { value }
            product {
              vendor
              marcaField: metafield(namespace: "custom", key: "marca_lista") { value }
            }
          }
        }
      }`).join('\n')

    const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ ${aliases} }` }),
    })
    const data = await res.json()

    chunk.forEach((sku, idx) => {
      const variant = data?.data?.[`v${idx}`]?.edges?.[0]?.node
      if (!variant) return

      const vendor   = variant.product?.vendor || ''
      const marcaRaw = variant.product?.marcaField?.value || ''
      if (marcaRaw.startsWith('gid://')) marcaGids.add(marcaRaw)

      result[sku] = {
        vendor,
        marca:             marcaRaw,
        sku_seller:        variant.skuSeller?.value || '',
        comision_afiliado: variant.comisionAfiliado?.value || '',
      }
    })

    await sleep(300)
  }

  // Resolver GIDs de metaobjects (marca)
  if (marcaGids.size > 0) {
    const gidList = [...marcaGids]
    const aliases = gidList
      .map((gid, idx) => `m${idx}: node(id: "${gid}") { ... on Metaobject { n: field(key: "nombre") { value } name: field(key: "name") { value } } }`)
      .join('\n')

    const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
      method: 'POST',
      headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `{ ${aliases} }` }),
    })
    const data = await res.json()

    const marcaMap = {}
    gidList.forEach((gid, idx) => {
      const node = data?.data?.[`m${idx}`]
      marcaMap[gid] = node?.n?.value || node?.name?.value || ''
    })

    for (const sku of Object.keys(result)) {
      const raw = result[sku].marca
      if (raw.startsWith('gid://')) {
        result[sku].marca = marcaMap[raw] || result[sku].vendor
      }
    }
  }

  return result
}

// ── Cart logic (Shopify) ──────────────────────────────────────

function calcCartFields(lineItems) {
  const subtotal = lineItems.reduce((s, i) => s + Number(i.price) * Number(i.quantity), 0)
  const tamano = subtotal >= 599 ? 'mayor que $599' : 'menor que $599'
  const vendors = new Set(lineItems.map(i => i.vendor).filter(Boolean))
  const tipoCarrito = vendors.size <= 1 ? 'Propio' : 'Compartido'

  const vendorSeen = new Set()
  const guiaExtra = lineItems.map(item => {
    const qty   = Number(item.quantity)
    const price = Number(item.price)
    const v     = item.vendor || ''

    if (subtotal < 599) return [0, 0]
    if (price < 599)    return [0, 20 * qty]

    if (!vendorSeen.has(v)) {
      vendorSeen.add(v)
      return [85, 20 * (qty - 1)]
    }
    return [0, 20 * qty]
  })

  return { guiaExtra, tipoCarrito, tamano }
}

// ── Date helpers ──────────────────────────────────────────────

function fmtTimestamp(ts) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(Number(ts) * 1000))
}

function tsMexicoMonth(ts) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric', month: '2-digit',
  }).format(new Date(Number(ts) * 1000)).slice(0, 7) // "2026-05"
}

function fmtISO(iso) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

function parseDMY(s) {
  const [d, m, y] = s.split('/')
  return new Date(y, m - 1, d)
}

// ── Transform TikTok ──────────────────────────────────────────

function transformTikTok(orders, skuData, targetYear, targetMonth) {
  const rows = []
  const targetKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`
  let skippedCancelled = 0, skippedDate = 0, skippedNoSku = 0

  for (const order of orders) {
    if (order.order_status_id === STATUS_CANCELADO) { skippedCancelled++; continue }
    const ts = order.date_confirmed || order.date_add
    if (!ts || tsMexicoMonth(ts) !== targetKey) { skippedDate++; continue }

    const products = (order.products || []).filter(p => (p.sku || '').trim())
    if (!products.length) { skippedNoSku++; continue }

    const subtotal = products.reduce((s, p) => s + Number(p.price_brutto || 0) * Number(p.quantity || 0), 0)
    const tamano   = subtotal >= 599 ? 'mayor que $599' : 'menor que $599'

    const vendors = new Set(
      products.map(p => skuData[(p.sku || '').trim().toUpperCase()]?.vendor).filter(Boolean)
    )
    const tipoCarrito = vendors.size <= 1 ? 'Propio' : 'Compartido'

    for (const p of products) {
      const sku    = (p.sku || '').trim().toUpperCase()
      const qty    = Number(p.quantity || 1)
      const precio = Number(p.price_brutto || 0)
      const info   = skuData[sku] || {}

      const comision      = 20
      const ventaMenosCom = Math.round(precio * qty * (1 - comision / 100) * 100) / 100
      const guia          = 0
      const extra         = 20 * qty
      const neto          = Math.round((ventaMenosCom - guia - extra) * 100) / 100

      rows.push([
        `tiktok${order.external_order_id || order.order_id}`, tipoCarrito, 'tiktok', tamano,
        p.name || '', info.vendor || '', info.marca || '', info.sku_seller || '',
        precio, qty, comision, ventaMenosCom,
        fmtTimestamp(ts), guia, extra, neto,
        sku, info.comision_afiliado || '', 'tiktok', '',
      ])
    }
  }

  console.log(`  TikTok descartadas → canceladas: ${skippedCancelled} | fuera de mes: ${skippedDate} | sin SKU: ${skippedNoSku}`)
  return rows
}

// ── Transform Shopify ─────────────────────────────────────────

function transformShopify(orders, skuData, targetYear, targetMonth) {
  const rows = []

  for (const order of orders) {
    const orderName = order.name || ''
    const targetKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`
    if (order.created_at.slice(0, 7) !== targetKey) continue
    const fecha = fmtISO(order.created_at)

    const specialistRef = (order.note_attributes || []).find(a => a.name === 'specialist_ref')?.value || ''
    const tipoVenta = specialistRef && specialistRef !== '0000' ? 'Afiliado' : 'marketplace'

    const lineItems = (order.line_items || []).filter(i => i.sku && !i.gift_card)
    if (!lineItems.length) continue

    const { guiaExtra, tipoCarrito, tamano } = calcCartFields(lineItems)

    lineItems.forEach((item, idx) => {
      const sku    = (item.sku || '').trim().toUpperCase()
      const qty    = Number(item.quantity || 1)
      const precio = Number(item.price || 0)
      const vendor = item.vendor || ''
      const info   = skuData[sku] || {}

      const comision      = 20
      const ventaMenosCom = Math.round(precio * qty * (1 - comision / 100) * 100) / 100
      const [guia, extra] = guiaExtra[idx] || [0, 0]
      const neto          = Math.round((ventaMenosCom - guia - extra) * 100) / 100

      rows.push([
        orderName, tipoCarrito, tipoVenta, tamano,
        item.name || item.title || '', vendor, info.marca || '', info.sku_seller || '',
        precio, qty, comision, ventaMenosCom,
        fecha, guia, extra, neto,
        sku, info.comision_afiliado || '', 'shopify', '',
      ])
    })
  }

  return rows
}

// ── Comisiones históricas (Supabase) ─────────────────────────

async function loadSkuToVariantMap(skus) {
  const result = {}
  const list   = [...skus]
  const BATCH  = 200
  for (let i = 0; i < list.length; i += BATCH) {
    const { data } = await supabase
      .from('product_catalog')
      .select('sku, variant_id')
      .in('sku', list.slice(i, i + BATCH))
    for (const r of data || []) if (r.sku) result[r.sku.toUpperCase()] = r.variant_id
  }
  return result
}

async function loadCommissionHistory() {
  const { data, error } = await supabase
    .from('product_commission_history')
    .select('variant_id, commission_percent, recorded_at')
    .order('recorded_at', { ascending: false })
  if (error) throw error
  return data || []
}

// Devuelve el commission_percent vigente en orderDate para ese SKU, o null si no hay registro
function getHistComm(sku, orderDate, skuToVariant, history) {
  const vid = skuToVariant[(sku || '').toUpperCase()]
  if (!vid) return null
  const r = history.find(h => h.variant_id === vid && h.recorded_at <= orderDate)
  return r ? Number(r.commission_percent) : null
}

// ── Transforms anuales (con comisiones históricas) ────────────

function transformTikTokAnnual(orders, skuData, skuToVariant, history) {
  const rows = []
  let skippedCancelled = 0, skippedNoSku = 0

  for (const order of orders) {
    if (order.order_status_id === STATUS_CANCELADO) { skippedCancelled++; continue }
    const ts = order.date_confirmed || order.date_add
    if (!ts) continue

    const products = (order.products || []).filter(p => (p.sku || '').trim())
    if (!products.length) { skippedNoSku++; continue }

    const subtotal    = products.reduce((s, p) => s + Number(p.price_brutto || 0) * Number(p.quantity || 0), 0)
    const tamano      = subtotal >= 599 ? 'mayor que $599' : 'menor que $599'
    const vendors     = new Set(products.map(p => skuData[(p.sku || '').trim().toUpperCase()]?.vendor).filter(Boolean))
    const tipoCarrito = vendors.size <= 1 ? 'Propio' : 'Compartido'
    const orderDate   = new Date(Number(ts) * 1000).toISOString()

    for (const p of products) {
      const sku    = (p.sku || '').trim().toUpperCase()
      const qty    = Number(p.quantity || 1)
      const precio = Number(p.price_brutto || 0)
      const info   = skuData[sku] || {}

      // TikTok no tiene sistema de afiliados → comision base 20
      const histComm     = getHistComm(sku, orderDate, skuToVariant, history)
      const comisionAfil = histComm !== null ? histComm : Number(info.comision_afiliado || 0)
      const comision     = 20

      const ventaMenosCom = Math.round(precio * qty * (1 - comision / 100) * 100) / 100
      const guia  = 0
      const extra = 20 * qty
      const neto  = Math.round((ventaMenosCom - guia - extra) * 100) / 100

      rows.push([
        `tiktok${order.external_order_id || order.order_id}`, tipoCarrito, 'tiktok', tamano,
        p.name || '', info.vendor || '', info.marca || '', info.sku_seller || '',
        precio, qty, comision, ventaMenosCom,
        fmtTimestamp(ts), guia, extra, neto,
        sku, comisionAfil > 0 ? comisionAfil : '', 'tiktok', '',
      ])
    }
  }

  console.log(`  TikTok descartadas → canceladas: ${skippedCancelled} | sin SKU: ${skippedNoSku}`)
  return rows
}

function transformShopifyAnnual(orders, skuData, skuToVariant, history) {
  const rows = []

  for (const order of orders) {
    const orderName     = order.name || ''
    const orderDate     = order.created_at
    const fecha         = fmtISO(orderDate)
    const specialistRef = (order.note_attributes || []).find(a => a.name === 'specialist_ref')?.value || ''
    const esAfiliado    = !!(specialistRef && specialistRef !== '0000')
    const tipoVenta     = esAfiliado ? 'Afiliado' : 'marketplace'

    const lineItems = (order.line_items || []).filter(i => i.sku && !i.gift_card)
    if (!lineItems.length) continue

    const enrichedItems = lineItems.map(i => ({
      ...i,
      vendor: skuData[(i.sku || '').trim().toUpperCase()]?.vendor || i.vendor || '',
    }))

    const { guiaExtra, tipoCarrito, tamano } = calcCartFields(enrichedItems)

    enrichedItems.forEach((item, idx) => {
      const sku    = (item.sku || '').trim().toUpperCase()
      const qty    = Number(item.quantity || 1)
      const precio = Number(item.price || 0)
      const info   = skuData[sku] || {}

      const histComm       = getHistComm(sku, orderDate, skuToVariant, history)
      const comisionAfil   = esAfiliado ? (histComm !== null ? histComm : Number(info.comision_afiliado || 0)) : 0
      const sinHistorial   = esAfiliado && histComm === null && comisionAfil > 0
      const comision       = 20 + comisionAfil

      const ventaMenosCom  = Math.round(precio * qty * (1 - comision / 100) * 100) / 100
      const [guia, extra]  = guiaExtra[idx] || [0, 0]
      const neto           = Math.round((ventaMenosCom - guia - extra) * 100) / 100

      // Col R: comision afiliado; asterisco si se usó valor actual por falta de historial
      const comisionAfilLabel = esAfiliado
        ? (sinHistorial ? `${comisionAfil}*` : `${comisionAfil}`)
        : ''

      rows.push([
        orderName, tipoCarrito, tipoVenta, tamano,
        item.name || item.title || '', info.vendor || '', info.marca || '', info.sku_seller || '',
        precio, qty, comision, ventaMenosCom,
        fecha, guia, extra, neto,
        sku, comisionAfilLabel, 'shopify', esAfiliado ? specialistRef : '',
      ])
    })
  }

  return rows
}

// ── Modo anual ────────────────────────────────────────────────

async function runAnnual(year) {
  const tabName  = `${year}-general`
  const now      = new Date()
  const maxMonth = year === now.getFullYear() ? now.getMonth() + 1 : 12

  // Rango: 1 ene → fin del maxMonth (con +12h de buffer para BL y +6h para Shopify/CDMX)
  const tsDesde  = Math.floor(Date.UTC(year, 0, 1, 0, 0, 0) / 1000)
  const tsHasta  = Math.floor(Date.UTC(year, maxMonth, 1, 12, 0, 0) / 1000)
  const dateMin  = `${year}-01-01T00:00:00Z`
  const endUTC   = new Date(Date.UTC(year, maxMonth, 0, 23, 59, 59) + 6 * 3600 * 1000)
  const dateMax  = endUTC.toISOString()

  console.log(`=== Reporte anual ${year} (ene–${String(maxMonth).padStart(2,'0')}) → tab '${tabName}' ===`)

  console.log('Obteniendo órdenes TikTok (BaseLinker)...')
  const tiktokOrders = await getTikTokOrdersRange(tsDesde, tsHasta)
  console.log(`  ${tiktokOrders.length} órdenes TikTok`)

  console.log('Obteniendo órdenes Shopify...')
  const shopifyOrders = await getShopifyOrdersRange(dateMin, dateMax)
  console.log(`  ${shopifyOrders.length} órdenes Shopify`)

  // SKUs únicos de ambas fuentes
  const allSkus = new Set()
  for (const o of tiktokOrders)  for (const p of o.products  || []) if (p.sku) allSkus.add(p.sku.trim().toUpperCase())
  for (const o of shopifyOrders) for (const i of o.line_items || []) if (i.sku) allSkus.add(i.sku.trim().toUpperCase())
  console.log(`  ${allSkus.size} SKUs únicos`)

  console.log('Enriqueciendo SKUs con Shopify GraphQL...')
  const skuData = await shopifySkuLookup(allSkus)
  console.log(`  ${Object.keys(skuData).length} SKUs enriquecidos`)

  console.log('Cargando mapa SKU → variante desde Supabase...')
  const skuToVariant = await loadSkuToVariantMap(allSkus)
  console.log(`  ${Object.keys(skuToVariant).length} SKUs mapeados`)

  console.log('Cargando historial de comisiones...')
  const history = await loadCommissionHistory()
  console.log(`  ${history.length} registros históricos`)

  console.log('Transformando...')
  const tiktokRows  = transformTikTokAnnual(tiktokOrders, skuData, skuToVariant, history)
  const shopifyRows = transformShopifyAnnual(shopifyOrders, skuData, skuToVariant, history)
  const rows = [...tiktokRows, ...shopifyRows].sort((a, b) => parseDMY(a[12]) - parseDMY(b[12]))
  console.log(`  TikTok: ${tiktokRows.length} | Shopify: ${shopifyRows.length} | Total: ${rows.length}`)

  console.log(`Escribiendo en Sheets tab '${tabName}'...`)
  await writeToSheet(tabName, rows)

  console.log(`=== Listo — ${rows.length} filas en tab '${tabName}' ===`)
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2]

  // Modo anual: YYYY
  if (arg && /^\d{4}$/.test(arg)) {
    await runAnnual(Number(arg))
    return
  }

  if (!arg || !/^\d{4}-\d{2}$/.test(arg)) {
    console.error('Uso: node --env-file=.env scripts/reporte_ventas.js YYYY-MM')
    console.error('     node --env-file=.env scripts/reporte_ventas.js YYYY   (anual → tab YYYY-general)')
    process.exit(1)
  }

  const [year, month] = arg.split('-').map(Number)

  console.log(`=== Reporte ventas ${arg} ===`)

  console.log('Obteniendo órdenes TikTok (BaseLinker)...')
  const tiktokOrders = await getTikTokOrders(year, month)
  console.log(`  ${tiktokOrders.length} órdenes TikTok`)

  console.log('Obteniendo órdenes Shopify...')
  const shopifyOrders = await getShopifyOrders(year, month)
  console.log(`  ${shopifyOrders.length} órdenes Shopify`)

  console.log('Enriqueciendo SKUs con Shopify GraphQL...')
  const allSkus = new Set()
  for (const o of tiktokOrders)  for (const p of o.products  || []) if (p.sku) allSkus.add(p.sku.trim().toUpperCase())
  for (const o of shopifyOrders) for (const i of o.line_items || []) if (i.sku) allSkus.add(i.sku.trim().toUpperCase())
  const skuData = await shopifySkuLookup(allSkus)
  console.log(`  ${Object.keys(skuData).length} SKUs enriquecidos`)

  console.log('Transformando...')
  const tiktokRows  = transformTikTok(tiktokOrders, skuData, year, month)
  const shopifyRows = transformShopify(shopifyOrders, skuData, year, month)
  const rows = [...tiktokRows, ...shopifyRows].sort((a, b) => parseDMY(a[12]) - parseDMY(b[12]))
  console.log(`  TikTok: ${tiktokRows.length} | Shopify: ${shopifyRows.length} | Total: ${rows.length}`)

  console.log(`Escribiendo en Sheets tab '${arg}'...`)
  await writeToSheet(arg, rows)

  console.log(`=== Listo ===`)
}

main().catch(err => {
  console.error('❌ Error:', err.message)
  process.exit(1)
})
