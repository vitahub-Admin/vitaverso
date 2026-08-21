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

// Trae price + inventoryQuantity + product.status de Shopify en tiempo real para una lista de variant_ids
async function fetchVariantData(variantIds) {
  if (!variantIds.length) return { prices: {}, stock: {}, productStatus: {} }
  const gids = variantIds.map(id => `gid://shopify/ProductVariant/${id}`)

  const aliases = gids.map((gid, i) =>
    `v${i}: node(id: "${gid}") { ... on ProductVariant { id price inventoryQuantity product { status } } }`
  ).join('\n')

  try {
    const res  = await fetch(GQL_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
      body:    JSON.stringify({ query: `{ ${aliases} }` }),
    })
    const json = await res.json()
    if (!json.data) return { prices: {}, stock: {}, productStatus: {} }

    const prices        = {}
    const stock         = {}
    const productStatus = {}
    variantIds.forEach((vid, i) => {
      const node = json.data[`v${i}`]
      if (!node) return
      if (node.price             != null) prices[vid]        = parseFloat(node.price)
      if (node.inventoryQuantity != null) stock[vid]         = node.inventoryQuantity
      if (node.product?.status)           productStatus[vid] = node.product.status
    })
    return { prices, stock, productStatus }
  } catch {
    return { prices: {}, stock: {}, productStatus: {} } // Si Shopify falla no bloqueamos
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
    const searchQuery     = searchParams.get('search')      // ?search=nombre producto

    // ?titles_for=123,456 → títulos desde product_catalog local, sin llamar a Shopify
    // Usado para restaurar extras en historial de protocolos
    const titlesFor = searchParams.get('titles_for')
    if (titlesFor) {
      const ids = titlesFor.split(',').map(Number).filter(Boolean)
      if (!ids.length) return NextResponse.json({ ok: true, variants: {} })

      const { data, error } = await supabase
        .from('product_catalog')
        .select('variant_id, product_id, title, variant_title, price, componente')
        .in('variant_id', ids)

      if (error) throw error

      const variants = {}
      for (const row of data || []) {
        variants[row.variant_id] = {
          title:         row.title,
          variant_title: row.variant_title || null,
          price:         row.price ?? 0,
          product_id:    row.product_id    || null,
          componente:    row.componente    || null,
        }
      }
      return NextResponse.json({ ok: true, variants })
    }

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

    // GET /api/product-catalog?search=nombre  → búsqueda libre por título de producto
    if (searchQuery) {
      const { data, error } = await supabase
        .from('product_catalog')
        .select('variant_id, product_id, title, variant_title, sku, price, brand, primary_ingredient, primary_amount, primary_unit, nutrients, is_professional, componente')
        .ilike('title', `%${searchQuery}%`)
        .limit(60)

      if (error) throw error
      const rows = data || []

      const uniqueProductIds = [...new Set(rows.map(r => r.product_id))]
      const variantIds = rows.map(r => r.variant_id)

      const [imageMap, { data: commData }, { stock, productStatus }] = await Promise.all([
        fetchImages(uniqueProductIds),
        variantIds.length
          ? supabase.from('product_variant_commissions').select('variant_id, commission_percent').in('variant_id', variantIds).eq('active', true)
          : Promise.resolve({ data: [] }),
        variantIds.length ? fetchVariantData(variantIds) : Promise.resolve({ prices: {}, stock: {}, productStatus: {} }),
      ])

      const commissionMap = {}
      for (const c of commData || []) commissionMap[c.variant_id] = Number(c.commission_percent)

      // Agrupar por producto (un card por producto, variantes anidadas)
      const productMap = new Map()
      for (const r of rows) {
        const ps = productStatus[r.variant_id]
        if (ps && ps !== 'ACTIVE') continue // excluir borradores/archivados
        if (!productMap.has(r.product_id)) {
          productMap.set(r.product_id, {
            product_id:         r.product_id,
            title:              r.title,
            image_url:          imageMap[r.product_id] || null,
            brand:              r.brand || null,
            primary_ingredient: r.primary_ingredient || null,
            primary_amount:     r.primary_amount || null,
            primary_unit:       r.primary_unit || null,
            is_professional:    r.is_professional || false,
            componente:         r.componente || null,
            variants:           [],
          })
        }
        productMap.get(r.product_id).variants.push({
          variant_id:         r.variant_id,
          variant_title:      r.variant_title || null,
          price:              r.price ?? null,
          sku:                r.sku || null,
          stock:              stock[r.variant_id] ?? null,
          commission_percent: commissionMap[r.variant_id] ?? 0,
          nutrients:          r.nutrients || [],
        })
      }

      const products = [...productMap.values()].map(p => {
        const prices   = p.variants.map(v => v.price).filter(pr => pr != null && pr > 0)
        const allOOS   = p.variants.length > 0 && p.variants.every(v => v.stock !== null && v.stock <= 0)
        const maxComm  = Math.max(0, ...p.variants.map(v => v.commission_percent ?? 0))
        // Merge nutrients (max por nutriente entre variantes)
        const nutMap   = new Map()
        for (const v of p.variants) for (const n of v.nutrients || []) {
          if (!nutMap.has(n.name) || n.amount > nutMap.get(n.name).amount) nutMap.set(n.name, n)
        }
        return { ...p, min_price: prices.length ? Math.min(...prices) : null,
          all_out_of_stock: allOOS, commission_percent: maxComm, nutrients: [...nutMap.values()] }
      }).sort((a, b) => {
        if (a.all_out_of_stock !== b.all_out_of_stock) return a.all_out_of_stock ? 1 : -1
        return (b.min_price ?? 0) - (a.min_price ?? 0)
      })

      return NextResponse.json({ ok: true, items: products })
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

      const uniqueProductIds = [...new Set(rows.map(r => r.product_id))]
      const variantIds = rows.map(r => r.variant_id)

      const [imageMap, { data: commData }, { stock, productStatus }] = await Promise.all([
        fetchImages(uniqueProductIds),
        supabase
          .from('product_variant_commissions')
          .select('variant_id, commission_percent')
          .in('variant_id', variantIds)
          .eq('active', true),
        fetchVariantData(variantIds),
      ])

      const commissionMap = {}
      for (const c of commData || []) commissionMap[c.variant_id] = Number(c.commission_percent)

      // Agrupar por producto (un card por producto, variantes anidadas)
      const productMap = new Map()
      for (const r of rows) {
        const ps = productStatus[r.variant_id]
        if (ps && ps !== 'ACTIVE') continue
        if (!productMap.has(r.product_id)) {
          productMap.set(r.product_id, {
            product_id:         r.product_id,
            title:              r.title,
            image_url:          imageMap[r.product_id] || null,
            brand:              r.brand || null,
            primary_ingredient: r.primary_ingredient || null,
            primary_amount:     r.primary_amount || null,
            primary_unit:       r.primary_unit || null,
            is_professional:    r.is_professional || false,
            variants:           [],
          })
        }
        productMap.get(r.product_id).variants.push({
          variant_id:         r.variant_id,
          variant_title:      r.variant_title || null,
          price:              r.price ?? null,
          sku:                r.sku || null,
          stock:              stock[r.variant_id] ?? null,
          commission_percent: commissionMap[r.variant_id] ?? 0,
          nutrients:          r.nutrients || [],
        })
      }

      const products = [...productMap.values()].map(p => {
        const prices  = p.variants.map(v => v.price).filter(pr => pr != null && pr > 0)
        const allOOS  = p.variants.length > 0 && p.variants.every(v => v.stock !== null && v.stock <= 0)
        const maxComm = Math.max(0, ...p.variants.map(v => v.commission_percent ?? 0))
        const nutMap  = new Map()
        for (const v of p.variants) for (const n of v.nutrients || []) {
          if (!nutMap.has(n.name) || n.amount > nutMap.get(n.name).amount) nutMap.set(n.name, n)
        }
        return { ...p, min_price: prices.length ? Math.min(...prices) : null,
          all_out_of_stock: allOOS, commission_percent: maxComm, nutrients: [...nutMap.values()] }
      }).sort((a, b) => {
        if (a.all_out_of_stock !== b.all_out_of_stock) return a.all_out_of_stock ? 1 : -1
        return (b.min_price ?? 0) - (a.min_price ?? 0)
      })

      return NextResponse.json({ ok: true, items: products })
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
