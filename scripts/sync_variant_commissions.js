import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY
const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractNumericId(gid) {
  if (!gid) return null
  return Number(gid.split('/').pop())
}

async function fetchProducts(cursor = null) {
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `query ($cursor: String) {
          products(first: 50, after: $cursor) {
            edges {
              cursor
              node {
                id
                title
                variants(first: 100) {
                  edges {
                    node {
                      id
                      metafield(namespace: "custom", key: "comision_afiliado") { value }
                    }
                  }
                }
              }
            }
            pageInfo { hasNextPage }
          }
        }`,
        variables: { cursor },
      }),
    }
  )
  return res.json()
}

async function main() {
  console.log('Iniciando sync de comisiones...\n')

  // Cargar comisiones actuales desde Supabase para comparar
  const { data: existing, error: fetchError } = await supabase
    .from('product_variant_commissions')
    .select('variant_id, commission_percent')
  if (fetchError) throw fetchError

  const currentMap = {}
  for (const row of existing) {
    currentMap[String(row.variant_id)] = Number(row.commission_percent)
  }

  let hasNextPage = true
  let cursor = null
  let totalVariants = 0
  let changed = 0
  let added = 0
  const changes = []

  while (hasNextPage) {
    const data = await fetchProducts(cursor)
    const products = data?.data?.products?.edges || []

    for (const { node: product, cursor: c } of products) {
      const productId = extractNumericId(product.id)

      for (const { node: variant } of product.variants.edges) {
        const variantId        = extractNumericId(variant.id)
        const commissionPercent = Number(variant.metafield?.value ?? 0) || 0
        const key              = String(variantId)
        const previous         = currentMap[key]

        const isNew     = previous === undefined
        const isChanged = !isNew && previous !== commissionPercent

        if (isNew)     added++
        if (isChanged) {
          changed++
          changes.push(`  variant ${variantId} (producto: ${product.title}): ${previous}% → ${commissionPercent}%`)
        }

        const { error } = await supabase
          .from('product_variant_commissions')
          .upsert({
            variant_id:         variantId,
            product_id:         productId,
            commission_percent: commissionPercent,
            active:             true,
            source:             'shopify',
            updated_at:         new Date().toISOString(),
          }, { onConflict: 'variant_id' })

        if (error) console.error(`❌ Error variant ${variantId}:`, error.message)

        totalVariants++
      }

      cursor = c
    }

    hasNextPage = data?.data?.products?.pageInfo?.hasNextPage ?? false
    if (hasNextPage) await sleep(400)
  }

  console.log(`Total variantes procesadas: ${totalVariants}`)
  console.log(`Nuevas:    ${added}`)
  console.log(`Cambios:   ${changed}`)
  console.log(`Sin cambio: ${totalVariants - added - changed}\n`)

  if (changes.length > 0) {
    console.log('Comisiones modificadas:')
    changes.forEach(l => console.log(l))
  } else {
    console.log('Sin cambios en comisiones.')
  }
}

main().catch(err => {
  console.error('❌ Error:', err)
})
