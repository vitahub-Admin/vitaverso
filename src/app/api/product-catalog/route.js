import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

const GQL_URL        = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`
const GQL_TOKEN      = process.env.SHOPIFY_ACCESS_TOKEN
const SF_URL         = `https://${process.env.SHOPIFY_STORE}/api/2025-01/graphql.json`
const SF_TOKEN       = process.env.SHOPIFY_STOREFRONT_TOKEN

// ── Helpers ──────────────────────────────────────────────────────────────────

// Trae featured images de Shopify para una lista de product_ids
async function fetchImages(productIds) {
  if (!productIds.length) return {}
  const ids = productIds.map(id => `gid://shopify/Product/${id}`)

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

// Trae price + inventoryQuantity + product.status de Shopify en tiempo real
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
    return { prices: {}, stock: {}, productStatus: {} }
  }
}

/**
 * Dado rows de Supabase + mapas de imágenes/comisiones/stock/status,
 * agrupa por producto y devuelve la lista ordenada lista para respuesta.
 */
function groupProducts({ rows, imageMap, commissionMap, stock, productStatus }) {
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

  return [...productMap.values()].map(p => {
    const prices  = p.variants.map(v => v.price).filter(pr => pr != null && pr > 0)
    const allOOS  = p.variants.length > 0 && p.variants.every(v => v.stock !== null && v.stock <= 0)
    const maxComm = Math.max(0, ...p.variants.map(v => v.commission_percent ?? 0))
    const nutMap  = new Map()
    for (const v of p.variants) for (const n of v.nutrients || []) {
      if (!nutMap.has(n.name) || n.amount > nutMap.get(n.name).amount) nutMap.set(n.name, n)
    }
    return {
      ...p,
      min_price:        prices.length ? Math.min(...prices) : null,
      all_out_of_stock: allOOS,
      commission_percent: maxComm,
      nutrients:        [...nutMap.values()],
    }
  }).sort((a, b) => {
    if (a.all_out_of_stock !== b.all_out_of_stock) return a.all_out_of_stock ? 1 : -1
    return (b.min_price ?? 0) - (a.min_price ?? 0)
  })
}

/**
 * Dado rows de Supabase, resuelve imágenes/stock/comisiones y retorna products[].
 */
async function resolveProducts(rows) {
  if (!rows.length) return []
  const uniqueProductIds = [...new Set(rows.map(r => r.product_id))]
  const variantIds       = rows.map(r => r.variant_id)

  const [imageMap, { data: commData }, { stock, productStatus }] = await Promise.all([
    fetchImages(uniqueProductIds),
    variantIds.length
      ? supabase.from('product_variant_commissions').select('variant_id, commission_percent').in('variant_id', variantIds).eq('active', true)
      : Promise.resolve({ data: [] }),
    variantIds.length ? fetchVariantData(variantIds) : Promise.resolve({ prices: {}, stock: {}, productStatus: {} }),
  ])

  const commissionMap = {}
  for (const c of commData || []) commissionMap[c.variant_id] = Number(c.commission_percent)

  return groupProducts({ rows, imageMap, commissionMap, stock, productStatus })
}

const CATALOG_SELECT = 'variant_id, product_id, title, variant_title, sku, price, brand, primary_ingredient, primary_amount, primary_unit, nutrients, is_professional, componente'

// ── Handler principal ─────────────────────────────────────────────────────────

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const componente       = searchParams.get('componente')
    const variantIdsRaw    = searchParams.get('variant_ids')
    const productIdsRaw    = searchParams.get('product_ids')
    const descriptionId    = searchParams.get('description')
    const searchQuery      = searchParams.get('search')
    const collectionHandle = searchParams.get('collection')
    const collectionId     = searchParams.get('collectionId')  // ID numérico de Shopify (más confiable)
    const collectionsMeta  = searchParams.get('collectionsMeta') // IDs separados por coma → batch title+image
    const titlesFor        = searchParams.get('titles_for')

    // ── ?collectionsMeta=id1,id2,... ────────────────────────────────────────
    // Batch: title + image de varias colecciones en una sola query GraphQL
    if (collectionsMeta) {
      const ids = collectionsMeta.split(',').map(s => s.trim()).filter(Boolean)
      if (!ids.length) return NextResponse.json({ ok: true, collections: {} })
      const aliases = ids.map((id, i) =>
        `c${i}: node(id: "gid://shopify/Collection/${id}") { ... on Collection { id title image { url } } }`
      ).join('\n')
      const res  = await fetch(GQL_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
        body:    JSON.stringify({ query: `{ ${aliases} }` }),
      })
      const json = await res.json()
      const collections = {}
      ids.forEach((id, i) => {
        const node = json.data?.[`c${i}`]
        if (node) collections[id] = { title: node.title, imageUrl: node.image?.url || null }
      })
      return NextResponse.json({ ok: true, collections })
    }

    // ── ?collectionsMetaHandles=handle1,handle2,... ──────────────────────────
    // Igual que collectionsMeta pero usando handles (para FEATURED cards)
    const collectionsMetaHandles = searchParams.get('collectionsMetaHandles')
    if (collectionsMetaHandles) {
      const handles = collectionsMetaHandles.split(',').map(s => s.trim()).filter(Boolean)
      if (!handles.length) return NextResponse.json({ ok: true, collections: {} })
      const aliases = handles.map((h, i) =>
        `c${i}: collectionByHandle(handle: "${h}") { id title image { url } }`
      ).join('\n')
      const res  = await fetch(GQL_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
        body:    JSON.stringify({ query: `{ ${aliases} }` }),
      })
      const json = await res.json()
      const collections = {}
      handles.forEach((handle, i) => {
        const node = json.data?.[`c${i}`]
        if (node) collections[handle] = { title: node.title, imageUrl: node.image?.url || null }
      })
      return NextResponse.json({ ok: true, collections })
    }

    // ── ?titles_for ──────────────────────────────────────────────────────────
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

    // ── ?description — descripción, imágenes y metafields de variante ─────────
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
                images(first: 15) { edges { node { url } } }
                variants(first: 20) {
                  edges {
                    node {
                      id
                      tipo_dosis:     metafield(namespace: "custom", key: "tipo_dosis")     { value }
                      dosis:          metafield(namespace: "custom", key: "dosis")           { value }
                      total_unidades: metafield(namespace: "custom", key: "total_unidades") { value }
                      total_dosis:    metafield(namespace: "custom", key: "total_dosis")    { value }
                    }
                  }
                }
              }
            }
          }`,
        }),
      })
      const json   = await res.json()
      const node   = json?.data?.node
      const images = (node?.images?.edges || []).map(e => e.node.url)

      // Metafields indexados por variant_id numérico
      const variantMeta = {}
      for (const { node: v } of node?.variants?.edges || []) {
        const vid = v.id.replace('gid://shopify/ProductVariant/', '')
        variantMeta[vid] = {
          tipo_dosis:     v.tipo_dosis?.value     || null,
          dosis:          v.dosis?.value          != null ? Number(v.dosis.value) : null,
          total_unidades: v.total_unidades?.value != null ? Number(v.total_unidades.value) : null,
          total_dosis:    v.total_dosis?.value    != null ? Number(v.total_dosis.value) : null,
        }
      }

      return NextResponse.json({
        ok:              true,
        title:           node?.title           ?? '',
        descriptionHtml: node?.descriptionHtml ?? '',
        images,
        variantMeta,  // { variant_id: { tipo_dosis, dosis, total_unidades, total_dosis } }
      })
    }

    // ── ?collectionId=123 o ?collection=handle ──────────────────────────────
    // Shopify es la fuente de verdad para existencia + variantes/precio/stock.
    // Supabase enriquece con datos clínicos (componente, nutrients, brand)
    // para los productos que ya estén sincronizados, pero NO es requisito:
    // los productos no-sincronizados aparecen igual con datos básicos de Shopify.
    if (collectionId || collectionHandle) {
      // Query que incluye variantes directamente — elimina round-trip de fetchVariantData
      const collSelector = collectionId
        ? `node(id: "gid://shopify/Collection/${collectionId}")`
        : `collectionByHandle(handle: "${collectionHandle}")`

      const gqlQuery = `{
        ${collSelector} {
          ... on Collection {
            title
            products(first: 250) {
              edges {
                node {
                  id title status vendor
                  featuredImage { url }
                  variants(first: 20) {
                    edges {
                      node {
                        id title price
                        inventoryQuantity
                        inventoryPolicy
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`

      const gqlRes  = await fetch(GQL_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
        body:    JSON.stringify({ query: gqlQuery }),
      })
      const gqlJson = await gqlRes.json()
      const coll    = collectionId
        ? gqlJson?.data?.node
        : gqlJson?.data?.collectionByHandle

      if (!coll) {
        return NextResponse.json({ ok: true, collectionTitle: null, items: [] })
      }

      const shopifyProducts = (coll.products?.edges || [])
        .map(e => e.node)
        .filter(n => n.status === 'ACTIVE' || !n.status)

      const shopifyProductIds = shopifyProducts
        .map(n => Number(n.id.replace('gid://shopify/Product/', '')))
        .filter(Boolean)

      if (!shopifyProductIds.length) {
        return NextResponse.json({ ok: true, collectionTitle: coll.title, items: [] })
      }

      // ── Enriquecimiento desde Supabase (opcional, best-effort) ──────────────
      const { data: supaRows } = await supabase
        .from('product_catalog')
        .select(CATALOG_SELECT)
        .in('product_id', shopifyProductIds)
        .limit(2000)

      // Mapa: product_id → datos clínicos de Supabase
      const supaProductMap = {}
      // Mapa: variant_id → sku de Supabase
      const supaVariantIds = []
      for (const r of supaRows || []) {
        if (!supaProductMap[r.product_id]) {
          supaProductMap[r.product_id] = {
            brand:              r.brand,
            is_professional:    r.is_professional || false,
            componente:         r.componente || null,
            primary_ingredient: r.primary_ingredient || null,
            primary_amount:     r.primary_amount || null,
            primary_unit:       r.primary_unit || null,
            nutrients:          r.nutrients || [],
            skuByVariant:       {},
          }
        }
        supaProductMap[r.product_id].skuByVariant[r.variant_id] = r.sku || null
        supaVariantIds.push(r.variant_id)
      }

      // Comisiones para variantes conocidas en Supabase
      const { data: commData } = supaVariantIds.length
        ? await supabase.from('product_variant_commissions').select('variant_id, commission_percent').in('variant_id', supaVariantIds).eq('active', true)
        : { data: [] }
      const commissionMap = {}
      for (const c of commData || []) commissionMap[c.variant_id] = Number(c.commission_percent)

      // ── Construir lista de productos con datos de Shopify + enrichment ───────
      const products = shopifyProducts.map(sp => {
        const pid     = Number(sp.id.replace('gid://shopify/Product/', ''))
        const enrich  = supaProductMap[pid] || null

        const variants = (sp.variants?.edges || []).map(ve => {
          const v   = ve.node
          const vid = Number(v.id.replace('gid://shopify/ProductVariant/', ''))
          // inventoryQuantity null = Shopify no trackea stock → tratar como disponible
          const stockVal = v.inventoryPolicy === 'CONTINUE'
            ? null  // "never out of stock" → disponible siempre
            : v.inventoryQuantity ?? null
          return {
            variant_id:         vid,
            variant_title:      v.title === 'Default Title' ? null : v.title,
            price:              parseFloat(v.price) || null,
            sku:                enrich?.skuByVariant?.[vid] || null,
            stock:              stockVal,
            commission_percent: commissionMap[vid] ?? 0,
            nutrients:          [],
          }
        })

        const prices  = variants.map(v => v.price).filter(p => p != null && p > 0)
        const allOOS  = variants.length > 0 && variants.every(v => v.stock !== null && v.stock <= 0)
        const maxComm = Math.max(0, ...variants.map(v => v.commission_percent))

        return {
          product_id:         pid,
          title:              sp.title,
          image_url:          sp.featuredImage?.url || null,
          brand:              enrich?.brand || sp.vendor || null,
          is_professional:    enrich?.is_professional || false,
          componente:         enrich?.componente || null,
          primary_ingredient: enrich?.primary_ingredient || null,
          primary_amount:     enrich?.primary_amount || null,
          primary_unit:       enrich?.primary_unit || null,
          nutrients:          enrich?.nutrients || [],
          variants,
          min_price:          prices.length ? Math.min(...prices) : null,
          all_out_of_stock:   allOOS,
          commission_percent: maxComm,
        }
      })

      // Ordenar: posición en colección de Shopify, sin stock al final
      const posMap = {}
      shopifyProductIds.forEach((pid, idx) => { posMap[pid] = idx })
      products.sort((a, b) => {
        if (a.all_out_of_stock !== b.all_out_of_stock) return a.all_out_of_stock ? 1 : -1
        return (posMap[a.product_id] ?? 999) - (posMap[b.product_id] ?? 999)
      })

      return NextResponse.json({ ok: true, collectionTitle: coll.title, items: products })
    }

    // ── ?search=query ────────────────────────────────────────────────────────
    // Usa el motor de búsqueda de Shopify (Admin GraphQL) — maneja typos,
    // descripciones, tags, SKU, vendor. Luego enriquece con Supabase.
    if (searchQuery) {
      const q = searchQuery.trim()

      // 1. Buscar con Storefront API (mejor spell correction y typos)
      //    Fallback a Admin API si el token no está configurado.
      let edges = []

      // Intento 1: Storefront API (spell correction, búsqueda semántica)
      if (SF_TOKEN) {
        try {
          const sfRes  = await fetch(SF_URL, {
            method:  'POST',
            headers: {
              'Content-Type':                      'application/json',
              'X-Shopify-Storefront-Access-Token': SF_TOKEN,
            },
            body: JSON.stringify({
              query: `
                query($q: String!) {
                  search(query: $q, types: PRODUCT, first: 100) {
                    edges {
                      node {
                        ... on Product {
                          id title vendor availableForSale
                          featuredImage { url }
                          variants(first: 20) {
                            edges {
                              node {
                                id title sku availableForSale quantityAvailable
                                price { amount }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              `,
              variables: { q },
            }),
          })
          const sfJson = await sfRes.json()
          if (sfJson.errors) console.warn('[search] Storefront errors:', sfJson.errors)
          edges = (sfJson.data?.search?.edges ?? []).map(({ node: p }) => ({
            node: {
              id:            p.id,
              title:         p.title,
              vendor:        p.vendor,
              status:        'ACTIVE', // Storefront solo expone productos activos y publicados
              featuredImage: p.featuredImage,
              variants: {
                edges: (p.variants?.edges ?? []).map(({ node: v }) => ({
                  node: {
                    id:                v.id,
                    title:             v.title,
                    price:             v.price?.amount ?? '0',
                    sku:               v.sku,
                    inventoryQuantity: v.quantityAvailable ?? null,
                    inventoryPolicy:   v.availableForSale === false ? 'DENY' : 'CONTINUE',
                  },
                })),
              },
            },
          }))
        } catch (e) {
          console.warn('[search] Storefront API error:', e.message)
        }
      }

      // Intento 2: Admin API (si Storefront no dio resultados o no hay token)
      if (!edges.length) {
        try {
          const adminRes  = await fetch(GQL_URL, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': GQL_TOKEN },
            body: JSON.stringify({
              query: `
                query($q: String!) {
                  products(first: 100, query: $q, sortKey: RELEVANCE) {
                    edges {
                      node {
                        id title vendor status
                        featuredImage { url }
                        variants(first: 20) {
                          edges { node { id title price sku inventoryQuantity inventoryPolicy } }
                        }
                      }
                    }
                  }
                }
              `,
              variables: { q },
            }),
          })
          const adminJson = await adminRes.json()
          edges = adminJson.data?.products?.edges ?? []
        } catch (e) {
          console.warn('[search] Admin API error:', e.message)
        }
      }

      // Intento 3: Supabase pg_trgm — captura typos que Shopify no corrige
      // (ej: "porteina" → "proteína" vía similitud de trigramas)
      if (!edges.length) {
        console.log('[search] 0 resultados en Shopify, intentando Supabase trgm para:', q)
        const { data: rpcData, error: rpcError } = await supabase.rpc('search_product_catalog', { q })
        if (!rpcError && rpcData?.length) {
          const products = await resolveProducts(rpcData)
          return NextResponse.json({ ok: true, items: products, source: 'supabase_trgm' })
        }
        // Si tampoco hay RPC, devolver vacío limpio
        if (rpcError && rpcError.code !== 'PGRST202') console.warn('[search] Supabase trgm error:', rpcError.message)
        return NextResponse.json({ ok: true, items: [] })
      }

      // 2. Construir lista provisional y acumular IDs para enriquecer
      const shopifyProducts = []
      const allProductIds   = []
      const allVariantIds   = []

      for (const { node: p } of edges) {
        if (p.status && p.status !== 'ACTIVE') continue
        const productId = p.id.replace('gid://shopify/Product/', '')
        allProductIds.push(Number(productId))

        const variants = p.variants.edges.map(({ node: v }) => {
          const variantId = Number(v.id.replace('gid://shopify/ProductVariant/', ''))
          allVariantIds.push(variantId)
          return {
            variant_id:         variantId,
            variant_title:      v.title === 'Default Title' ? null : v.title,
            price:              parseFloat(v.price || 0),
            sku:                v.sku || null,
            stock:              v.inventoryPolicy === 'CONTINUE' ? null : v.inventoryQuantity,
            commission_percent: 0,
          }
        })

        shopifyProducts.push({
          product_id:  productId,
          title:       p.title,
          image_url:   p.featuredImage?.url || null,
          vendor:      p.vendor || null,
          variants,
        })
      }

      // 3. Enriquecer con Supabase en paralelo (brand, componente, comisiones)
      const [{ data: catalogData }, { data: commData }] = await Promise.all([
        allProductIds.length
          ? supabase.from('product_catalog')
              .select('product_id, brand, componente, is_professional, primary_ingredient, primary_amount, primary_unit')
              .in('product_id', allProductIds)
          : Promise.resolve({ data: [] }),
        allVariantIds.length
          ? supabase.from('product_variant_commissions')
              .select('variant_id, commission_percent')
              .in('variant_id', allVariantIds)
              .eq('active', true)
          : Promise.resolve({ data: [] }),
      ])

      // Mapas de enriquecimiento
      const catalogMap = {}
      for (const row of catalogData || []) {
        if (!catalogMap[row.product_id]) catalogMap[row.product_id] = row
      }
      const commMap = {}
      for (const row of commData || []) commMap[row.variant_id] = Number(row.commission_percent)

      // 4. Merge y calcular agregados
      const products = shopifyProducts.map(p => {
        const enrich   = catalogMap[p.product_id] || {}
        const variants = p.variants.map(v => ({ ...v, commission_percent: commMap[v.variant_id] ?? 0 }))
        const prices   = variants.map(v => v.price).filter(pr => pr > 0)
        const allOOS   = variants.length > 0 && variants.every(v => v.stock !== null && v.stock <= 0)
        const maxComm  = Math.max(0, ...variants.map(v => v.commission_percent))

        return {
          product_id:         p.product_id,
          title:              p.title,
          image_url:          p.image_url,
          brand:              enrich.brand || p.vendor || null,
          componente:         enrich.componente || null,
          is_professional:    enrich.is_professional || false,
          primary_ingredient: enrich.primary_ingredient || null,
          primary_amount:     enrich.primary_amount || null,
          primary_unit:       enrich.primary_unit || null,
          nutrients:          [],
          variants,
          min_price:          prices.length ? Math.min(...prices) : null,
          all_out_of_stock:   allOOS,
          commission_percent: maxComm,
        }
      }).sort((a, b) => {
        // Mantener orden de relevancia de Shopify; productos sin stock al final
        if (a.all_out_of_stock !== b.all_out_of_stock) return a.all_out_of_stock ? 1 : -1
        return 0
      })

      return NextResponse.json({ ok: true, items: products })
    }

    // ── ?product_ids ─────────────────────────────────────────────────────────
    if (productIdsRaw) {
      const ids = productIdsRaw.split(',').map(Number).filter(Boolean)
      const images = await fetchImages(ids)
      return NextResponse.json({ ok: true, images })
    }

    // ── ?variant_ids ─────────────────────────────────────────────────────────
    if (variantIdsRaw) {
      const ids = variantIdsRaw.split(',').map(Number).filter(Boolean)

      const [{ prices, stock }, { data: commData }] = await Promise.all([
        fetchVariantData(ids),
        supabase
          .from('product_variant_commissions')
          .select('variant_id, commission_percent')
          .in('variant_id', ids)
          .eq('active', true),
      ])

      // Fallback a Supabase si Shopify falló
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

    // ── ?componente ──────────────────────────────────────────────────────────
    if (componente) {
      const { data, error } = await supabase
        .from('product_catalog')
        .select(CATALOG_SELECT)
        .eq('componente', componente)
        .limit(2000)

      if (error) throw error
      const products = await resolveProducts(data || [])
      return NextResponse.json({ ok: true, items: products })
    }

    // ── Lista de componentes únicos (paginado) ───────────────────────────────
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
