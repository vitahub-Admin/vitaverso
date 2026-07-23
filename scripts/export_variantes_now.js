// scripts/export_variantes_now.js
// Exporta variantes de marcas NOW (Foods, Solutions, Kids, Sports)
// con SKU, EAN (barcode) y SKU Seller (custom.sku_seller)
// Uso: node --env-file=.env scripts/export_variantes_now.js

import 'dotenv/config'
import { writeFileSync } from 'fs'

const SHOPIFY_STORE = process.env.SHOPIFY_STORE
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN
const GQL_URL = `https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

const TEST_QUERY = `
  query {
    product(id: "gid://shopify/Product/9594357186881") {
      id
      title
      vendor
      marcaLista: metafield(namespace: "custom", key: "marca_lista") {
        value
        reference {
          ... on Metaobject {
            id
            handle
            type
            fields { key value }
          }
        }
      }
      variants(first: 10) {
        edges {
          node {
            id
            title
            sku
            barcode
            skuSeller: metafield(namespace: "custom", key: "sku_seller") { value }
          }
        }
      }
    }
  }
`

const PRODUCTS_QUERY = `
  query getProducts($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          vendor
          marcaLista: metafield(namespace: "custom", key: "marca_lista") {
            reference {
              ... on Metaobject {
                handle
                nombre: field(key: "nombre") { value }
              }
            }
          }
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                barcode
                skuSeller: metafield(namespace: "custom", key: "sku_seller") {
                  value
                }
              }
            }
          }
        }
      }
    }
  }
`

function escapeCsv(val) {
  if (val == null) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

async function main() {
  const rows = []
  let cursor = null
  let page = 0
  let totalProducts = 0

  console.log('Exportando todas las variantes...\n')

  while (true) {
    page++
    const data = await gql(PRODUCTS_QUERY, { cursor })
    const { edges, pageInfo } = data.products

    for (const { node: product } of edges) {
      totalProducts++

      const ref   = product.marcaLista?.reference
      const marca = ref?.nombre?.value || ref?.handle || ''

      for (const { node: variant } of product.variants.edges) {
        rows.push({
          vendor:     product.vendor || '',
          marca,
          producto:   product.title,
          variante:   variant.title === 'Default Title' ? '' : variant.title,
          sku:        variant.sku              || '',
          ean:        variant.barcode          || '',
          sku_seller: variant.skuSeller?.value || '',
        })
      }
    }

    console.log(`Página ${page}: ${totalProducts} productos, ${rows.length} variantes`)

    if (!pageInfo.hasNextPage) break
    cursor = pageInfo.endCursor
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\nTotal: ${totalProducts} productos | ${rows.length} variantes`)

  if (rows.length === 0) {
    console.log('Sin resultados.')
    return
  }

  // Generar CSV
  const headers = ['vendor', 'marca', 'producto', 'variante', 'sku', 'ean', 'sku_seller']
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escapeCsv(r[h])).join(',')),
  ].join('\n')

  const filename = `variantes_todas_${new Date().toISOString().slice(0, 10)}.csv`
  writeFileSync(filename, '﻿' + csv, 'utf8') // BOM para Excel
  console.log(`\n✅ Exportado: ${filename}`)
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
