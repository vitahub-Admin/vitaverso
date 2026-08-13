import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const GQL_URL   = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`
const GQL_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

// Trae featured images de Shopify para una lista de product_ids
async function fetchImages(productIds) {
  if (!productIds.length) return {}
  const ids = productIds.map(id => `gid://shopify/Product/${id}`)

  // Usamos aliases para evitar limit de nodes (250 max, que es más que suficiente)
  const aliases = ids.map((gid, i) =>
    `p${i}: node(id: "${gid}") { ... on Product { id featuredImage { url } } }`
  ).join('\n')

  const res = await fetch(GQL_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
    body:    JSON.stringify({ query: `{ ${aliases} }` }),
  })
  const json = await res.json()
  if (!json.data) return {}

  const map = {}
  productIds.forEach((pid, i) => {
    const node = json.data[`p${i}`]
    if (node?.featuredImage?.url) map[pid] = node.featuredImage.url
  })
  return map
}

// Trae price + inventoryQuantity de Shopify en tiempo real para una lista de variant_ids
async function fetchVariantData(variantIds) {
  if (!variantIds.length) return { prices: {}, stock: {} }
  const gids = variantIds.map(id => `gid://shopify/ProductVariant/${id}`)

  const aliases = gids.map((gid, i) =>
    `v${i}: node(id: "${gid}") { ... on ProductVariant { id price inventoryQuantity } }`
  ).join('\n')

  try {
    const res  = await fetch(GQL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
      body:    JSON.stringify({ query: `{ ${aliases} }` }),
    })
    const json = await res.json()
    if (!json.data) return { prices: {}, stock: {} }

    const prices = {}
    const stock  = {}
    variantIds.forEach((vid, i) => {
      const node = json.data[`v${i}`]
      if (!node) return
      if (node.price           != null) prices[vid] = parseFloat(node.price)
      if (node.inventoryQuantity != null) stock[vid] = node.inventoryQuantity
    })
    return { prices, stock }
  } catch {
    return { prices: {}, stock: {} } // Si Shopify falla no bloqueamos
  }
}

// GET /api/product-catalog
// ?componente=Magnesio  → variantes de ese componente, con imagen traída de Shopify
// (sin param)           → lista de componentes únicos con conteo

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const componente      = searchParams.get('componente')
    const variantIdsRaw   = searchParams.get('variant_ids')
    const productIdsRaw   = searchParams.get('product_ids')
    const descriptionId   = searchParams.get('description') // ?description=PRODUCT_ID

    // ?description=123 → trae descriptionHtml de Shopify para preview
    if (descriptionId) {
      const gid = `gid://shopify/Product/${descriptionId}`
      const res = await fetch(GQL_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
        body: JSON.stringify({
          query: `{
            node(id: "${gid}") {
              ... on Product {
                title
                descriptionHtml
              }
            }
          }`,
        }),
      })
      const json = await res.json()
      const node = json?.data?.node
      return NextResponse.json({
        ok:              true,
        title:           node?.title           ?? '',
        descriptionHtml: node?.descriptionHtml ?? '',
      })
    }

    // GET /api/product-catalog?product_ids=123,456  → imagen de Shopify por product_id
    if (productIdsRaw) {
      const ids = productIdsRaw.split(',').map(Number).filter(Boolean)
      const images = await fetchImages(ids)
      return NextResponse.json({ ok: true, images })
    }

    // GET /api/product-catalog?variant_ids=123,456  → precios + stock + comisiones
    if (variantIdsRaw) {
      const ids = variantIdsRaw.split(',').map(Number).filter(Boolean)

      // Precio + stock en tiempo real desde Shopify + comisiones desde Supabase (paralelo)
      const [{ prices, stock }, { data: commData }] = await Promise.all([
        fetchVariantData(ids),
        supabase
          .from('product_variant_commissions')
          .select('variant_id, commission_percent')
          .in('variant_id', ids)
          .eq('active', true),
      ])

      // Si Shopify no devolvió precios (fallo de red), fallback a Supabase
      const missingPrices = ids.filter(id => prices[id] == null)
      if (missingPrices.length) {
        const { data } = await supabase
          .from('product_catalog')
          .select('variant_id, price')
          .in('variant_id', missingPrices)
        for (const r of data || []) {
          if (prices[r.variant_id] == null) prices[r.variant_id] = r.price
        }
      }

      const commissions = {}
      for (const r of commData || []) {
        commissions[r.variant_id] = Number(r.commission_percent)
      }

      return NextResponse.json({ ok: true, prices, stock, commissions })
    }

    if (componente) {
      const { data, error } = await supabase
        .from('product_catalog')
        .select('variant_id, product_id, title, variant_title, sku, price, brand, primary_ingredient, primary_amount, primary_unit, nutrients, is_professional')
        .eq('componente', componente)
        .limit(2000)

      if (error) throw error
      const rows = data || []

      // Calcular precio mínimo y cantidad de variantes por producto
      const minPriceMap = {}
      const countMap    = {}
      for (const r of rows) {
        const pid = r.product_id
        if (r.price !== null && (minPriceMap[pid] === undefined || r.price < minPriceMap[pid])) {
          minPriceMap[pid] = r.price
        }
        countMap[pid] = (countMap[pid] || 0) + 1
      }

      // Traer imágenes + comisiones en paralelo
      const uniqueProductIds = [...new Set(rows.map(r => r.product_id))]
      const variantIds = rows.map(r => r.variant_id)

      const [imageMap, { data: commData }] = await Promise.all([
        fetchImages(uniqueProductIds),
        supabase
          .from('product_variant_commissions')
          .select('variant_id, commission_percent')
          .in('variant_id', variantIds)
          .eq('active', true),
      ])

      const commissionMap = {}
      for (const c of commData || []) {
        commissionMap[c.variant_id] = Number(c.commission_percent)
      }

      const enriched = rows
        .map(r => ({
          ...r,
          image_url:          imageMap[r.product_id] || null,
          min_price:          minPriceMap[r.product_id] ?? r.price,
          variant_count:      countMap[r.product_id] || 1,
          commission_percent: commissionMap[r.variant_id] ?? null,
        }))
        // Ordenar por precio DESC (más caro arriba)
        .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))

      return NextResponse.json({ ok: true, items: enriched })
    }

    // Lista de componentes únicos (paginado — Supabase cap server-side = 1000 filas)
    const allComps = []
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('product_catalog')
        .select('componente')
        .not('componente', 'is', null)
        .range(from, from + PAGE - 1)
      if (error) throw error
      if (!data?.length) break
      allComps.push(...data)
      if (data.length < PAGE) break
      from += PAGE
    }

    const counts = {}
    for (const r of allComps) {
      counts[r.componente] = (counts[r.componente] || 0) + 1
    }

    const componentes = Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ ok: true, componentes })
  } catch (err) {
    console.error('product-catalog error:', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
