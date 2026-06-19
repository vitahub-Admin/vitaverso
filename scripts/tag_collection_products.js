// scripts/tag_collection_products.js
// Agrega una etiqueta a todos los productos de una colección sin borrar las existentes
// Uso: node scripts/tag_collection_products.js <collection_id> <tag>
// Ejemplo: node scripts/tag_collection_products.js 123456789 "promo-mayo"

import 'dotenv/config'

const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const BASE = `https://${SHOPIFY_STORE}/admin/api/2024-01`
const HEADERS = { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function getCollectionProducts(collectionId) {
  const all = []
  let url = `${BASE}/collections/${collectionId}/products.json?limit=250&fields=id,title,tags`

  while (url) {
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) throw new Error(`Error obteniendo productos: ${res.status} ${await res.text()}`)
    const data = await res.json()
    all.push(...(data.products || []))
    const link = res.headers.get('Link') || ''
    const match = link.match(/<([^>]+)>;\s*rel="next"/)
    url = match ? match[1] : null
  }

  return all
}

async function main() {
  const collectionId = process.argv[2]
  const newTag       = process.argv[3]

  if (!collectionId || !newTag) {
    console.error('Uso: node scripts/tag_collection_products.js <collection_id> <tag>')
    process.exit(1)
  }

  console.log(`=== Tageando colección ${collectionId} con "${newTag}" ===\n`)

  const products = await getCollectionProducts(collectionId)
  console.log(`Productos en la colección: ${products.length}\n`)

  let updated = 0, skipped = 0, errors = 0

  for (const product of products) {
    const currentTags = product.tags ? product.tags.split(',').map(t => t.trim()).filter(Boolean) : []

    if (currentTags.includes(newTag)) {
      console.log(`  ⏭️  ${product.title} — ya tiene la etiqueta`)
      skipped++
      continue
    }

    const mergedTags = [...currentTags, newTag].join(', ')

    const res = await fetch(`${BASE}/products/${product.id}.json`, {
      method: 'PUT',
      headers: HEADERS,
      body: JSON.stringify({ product: { id: product.id, tags: mergedTags } }),
    })

    if (res.ok) {
      console.log(`  ✅ ${product.title}`)
      updated++
    } else {
      console.log(`  ❌ ${product.title} — ${res.status} ${await res.text()}`)
      errors++
    }

    await sleep(300) // respetar rate limit de Shopify
  }

  console.log(`\n=== Listo ===`)
  console.log(`  Actualizados: ${updated}`)
  console.log(`  Ya tenían la etiqueta: ${skipped}`)
  console.log(`  Errores: ${errors}`)
}

main().catch(err => {
  console.error('❌', err.message)
  process.exit(1)
})
