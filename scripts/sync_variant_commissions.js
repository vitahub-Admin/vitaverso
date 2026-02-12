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
  const query = `
    query ($cursor: String) {
      products(first: 50, after: $cursor) {
        edges {
          cursor
          node {
            id
            variants(first: 100) {
              edges {
                node {
                  id
                  metafield(namespace: "custom", key: "comision_afiliado") {
                    value
                  }
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
        }
      }
    }
  `

  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { cursor },
      }),
    }
  )

  return res.json()
}

async function main() {
  console.log("🔹 Iniciando sync de comisiones")

  let hasNextPage = true
  let cursor = null
  let totalVariants = 0

  while (hasNextPage) {
    const data = await fetchProducts(cursor)

    const products = data?.data?.products?.edges || []

    for (const productEdge of products) {
      const product = productEdge.node
      const productId = extractNumericId(product.id)

      for (const variantEdge of product.variants.edges) {
        const variant = variantEdge.node

        const variantId = extractNumericId(variant.id)

        let commissionRaw = variant.metafield?.value

        // Si viene vacío → 0
      const commissionPercent = Number(commissionRaw ?? 0) || 0

        const { error } = await supabase
          .from('product_variant_commissions')
          .upsert({
            variant_id: variantId,
            product_id: productId,
            commission_percent: commissionPercent,
            active: true,
            source: 'shopify',
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'variant_id'
          })

        if (error) {
          console.error(`❌ Error guardando variant ${variantId}`, error)
        } else {
          console.log(`✅ Variant ${variantId} → ${commissionPercent}%`)
        }

        totalVariants++
      }

      cursor = productEdge.cursor
    }

    hasNextPage = data?.data?.products?.pageInfo?.hasNextPage

    // Delay pequeño entre páginas
    await sleep(400)
  }

  console.log(`🎯 Sync completo. Variants procesadas: ${totalVariants}`)
}

main().catch(err => {
  console.error("❌ Error en script:", err)
})
