// scripts/check_especid_collections.js
// Verifica el supuesto: "todas las collections de afiliado tienen custom.especId marcado".
// Trae todas las collections vía GraphQL y reporta cuáles tienen (o no) el metafield.
//
// Uso: node scripts/check_especid_collections.js

import 'dotenv/config';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function fetchPage(cursor) {
  const query = `
    query($cursor: String) {
      collections(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          handle
          title
          metafield(namespace: "custom", key: "especId") { value }
        }
      }
    }`;

  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { cursor } }),
  });

  if (!res.ok) {
    throw new Error(`Shopify error ${res.status}: ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data.collections;
}

async function main() {
  console.log('🔍 Revisando collections y su metafield custom.especId...\n');

  const withEspecId = [];
  const withoutEspecId = [];

  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await fetchPage(cursor);

    for (const c of page.nodes) {
      if (c.metafield?.value) {
        withEspecId.push({ handle: c.handle, title: c.title, especId: c.metafield.value });
      } else {
        withoutEspecId.push({ handle: c.handle, title: c.title });
      }
    }

    hasNextPage = page.pageInfo.hasNextPage;
    cursor = page.pageInfo.endCursor;
  }

  console.log(`✅ Con especId (${withEspecId.length}):`);
  console.table(withEspecId);

  console.log(`\n⚠️  Sin especId (${withoutEspecId.length}):`);
  console.table(withoutEspecId);

  console.log('\n─────────────────────────────────────');
  console.log(`📊 Total collections: ${withEspecId.length + withoutEspecId.length}`);
  console.log(`   con especId:    ${withEspecId.length}`);
  console.log(`   sin especId:    ${withoutEspecId.length}`);
  console.log('─────────────────────────────────────');
}

main().catch(err => {
  console.error('❌', err.message);
  process.exit(1);
});
