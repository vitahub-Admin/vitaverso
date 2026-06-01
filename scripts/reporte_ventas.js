// scripts/reporte_ventas.js
// Genera reporte mensual TikTok + Shopify → Google Sheets (nueva tab por mes)
// Uso: node scripts/reporte_ventas.js 2026-05

import 'dotenv/config'
import { google } from 'googleapis'

const BL_TOKEN    = process.env.BASELINKER_TOKEN
const BL_URL      = 'https://api.baselinker.com/connector.php'
const BL_DELAY    = 650

const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

const SHEET_ID = '16qtU3hbpOynNt90htLrvQujMW3TAG8sWG-Z_uPN6Hno'

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

async function getTikTokOrders(year, month) {
  const lastDay = new Date(year, month, 0).getDate()
  const tsDesde = Math.floor(new Date(year, month - 1, 1, 0, 0, 0).getTime() / 1000)
  const tsHasta = Math.floor(new Date(year, month - 1, lastDay, 23, 59, 59).getTime() / 1000)

  const all = []
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

    const sources = [...new Set(orders.map(o => o.order_source || o.order_source_info || '(vacío)'))]
    console.log('  → order_source values:', sources)

    const tiktok = orders.filter(o =>
      (o.order_source || '').toLowerCase().includes('tiktok') ||
      (o.order_source_info || '').toLowerCase().includes('tiktok')
    )
    all.push(...tiktok)
    console.log(`  → ${all.length} órdenes TikTok acumuladas...`)

    if (orders.length < 100) break
    tsCursor = Math.max(...orders.map(o => o.date_confirmed || o.date_add || 0)) + 1
    await sleep(BL_DELAY)
  }

  return all
}

// ── Shopify orders ─────────────────────────────────────────────

async function getShopifyOrders(year, month) {
  const pad = n => String(n).padStart(2, '0')
  const dateMin = `${year}-${pad(month)}-01T00:00:00Z`
  // +2 días de buffer para cubrir desfase UTC vs timezone local (ej. México UTC-6)
  const bufferEnd = new Date(Date.UTC(year, month, 2))
  const dateMax = bufferEnd.toISOString()

  const all = []
  let url = `https://${SHOPIFY_STORE}/admin/api/2025-01/orders.json?status=any&financial_status=paid&limit=250&created_at_min=${dateMin}&created_at_max=${dateMax}`

  while (url) {
    const res = await fetch(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } })
    const data = await res.json()
    const orders = (data.orders || []).filter(o => !o.cancelled_at)
    all.push(...orders)
    console.log(`  → ${all.length} órdenes Shopify cargadas...`)

    const link = res.headers.get('Link') || ''
    const match = link.match(/<([^>]+)>;\s*rel="next"/)
    url = match ? match[1] : null
  }

  return all
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
  const d = new Date(Number(ts) * 1000)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function fmtISO(iso) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function parseDMY(s) {
  const [d, m, y] = s.split('/')
  return new Date(y, m - 1, d)
}

// ── Transform TikTok ──────────────────────────────────────────

function transformTikTok(orders, skuData) {
  const rows = []

  for (const order of orders) {
    if (order.order_status_id === STATUS_CANCELADO) continue
    const ts = order.date_confirmed || order.date_add
    if (!ts) continue

    const products = (order.products || []).filter(p => (p.sku || '').trim())
    if (!products.length) continue

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
        String(order.order_id), tipoCarrito, 'tiktok', tamano,
        p.name || '', info.vendor || '', info.marca || '', info.sku_seller || '',
        precio, qty, comision, ventaMenosCom,
        fmtTimestamp(ts), guia, extra, neto,
        sku, info.comision_afiliado || '', 'tiktok', '',
      ])
    }
  }

  return rows
}

// ── Transform Shopify ─────────────────────────────────────────

function transformShopify(orders, skuData, targetYear, targetMonth) {
  const rows = []

  for (const order of orders) {
    const orderName = order.name || ''
    const d = new Date(order.created_at)
    // Filtrar al mes exacto en timezone local (cubre el buffer de la query)
    if (d.getFullYear() !== targetYear || d.getMonth() + 1 !== targetMonth) continue
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

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const arg = process.argv[2]
  if (!arg || !/^\d{4}-\d{2}$/.test(arg)) {
    console.error('Uso: node scripts/reporte_ventas.js YYYY-MM')
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
  const tiktokRows  = transformTikTok(tiktokOrders, skuData)
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
