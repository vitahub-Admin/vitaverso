/**
 * sync-favoritos.mjs
 * Sincroniza vh_pro_favoritos desde las colecciones de Shopify de cada afiliado.
 *
 * Flujo:
 *   1. Lee todos los afiliados con shopify_collection_id desde Supabase
 *   2. Por cada afiliado: pagina toda su colección de Shopify (250 por página)
 *   3. Enriquece con brand + commission_percent desde product_catalog
 *   4. Upsert a vh_pro_favoritos
 *
 * Uso:
 *   node scripts/sync-favoritos.mjs               ← todos los afiliados
 *   node scripts/sync-favoritos.mjs --dry-run      ← solo muestra counts
 *   node scripts/sync-favoritos.mjs --limit 5      ← solo los primeros 5 afiliados
 *   node scripts/sync-favoritos.mjs --customer 8203251581249  ← uno específico
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// ── .env ──────────────────────────────────────────────────────────────────────
function loadEnv(path = ".env") {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split("\n")
        .filter(l => l.includes("=") && !l.startsWith("#"))
        .map(l => {
          const eq  = l.indexOf("=");
          const key = l.slice(0, eq).trim();
          const val = l.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
          return [key, val];
        })
    );
  } catch {
    console.error("❌  No se encontró .env — ejecuta desde vitaverse/");
    process.exit(1);
  }
}

const env     = loadEnv();
const GQL_URL = `https://${env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;
const TOKEN   = env.SHOPIFY_ACCESS_TOKEN;

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY
);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Shopify GraphQL ───────────────────────────────────────────────────────────
async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body:    JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join(" | "));
  return json.data;
}

// ── Traer todos los productos de una colección (paginado) ─────────────────────
async function fetchAllCollectionProducts(collectionId) {
  const products = [];
  let after      = null;
  let page       = 0;

  while (true) {
    page++;
    const data = await gql(`
      query($id: ID!, $after: String) {
        collection(id: $id) {
          products(first: 250, after: $after) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                title
                vendor
                featuredImage { url }
                variants(first: 20) {
                  edges {
                    node {
                      id
                      title
                      price
                      sku
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
    `, { id: `gid://shopify/Collection/${collectionId}`, after });

    const productsPage = data?.collection?.products;
    if (!productsPage) break;

    for (const { node: p } of productsPage.edges) {
      const productId = p.id.replace("gid://shopify/Product/", "");
      const variants  = p.variants.edges.map(({ node: v }) => ({
        variant_id:    Number(v.id.replace("gid://shopify/ProductVariant/", "")),
        variant_title: v.title === "Default Title" ? null : v.title,
        price:         parseFloat(v.price || 0),
        sku:           v.sku || null,
        stock:         v.inventoryPolicy === "CONTINUE" ? null : v.inventoryQuantity,
      }));

      const inStock   = variants.filter(v => v.stock === null || v.stock > 0);
      const min_price = Math.min(...variants.map(v => v.price).filter(Boolean));

      products.push({
        product_id:      productId,
        title:           p.title,
        image_url:       p.featuredImage?.url || null,
        vendor:          p.vendor || null,
        min_price:       isFinite(min_price) ? min_price : null,
        all_out_of_stock: inStock.length === 0,
        variants,
      });
    }

    if (!productsPage.pageInfo.hasNextPage) break;
    after = productsPage.pageInfo.endCursor;
    await sleep(150); // respetar rate limit entre páginas
  }

  return products;
}

// ── Enriquecer con brand + comisión desde Supabase ───────────────────────────
async function fetchCommissions(productIds) {
  if (!productIds.length) return {};
  const { data } = await supabase
    .from("product_catalog")
    .select("product_shopify_id, brand, commission_percent, is_professional, componente")
    .in("product_shopify_id", productIds.map(Number));

  const map = {};
  for (const row of data || []) {
    map[String(row.product_shopify_id)] = {
      brand:              row.brand || null,
      commission_percent: row.commission_percent ?? 0,
      is_professional:    row.is_professional || false,
      componente:         row.componente || null,
    };
  }
  return map;
}

// ── Upsert en vh_pro_favoritos ────────────────────────────────────────────────
async function upsertFavoritos(customerId, products, commissionMap) {
  const rows = products.map(p => {
    const e = commissionMap[p.product_id] || {};
    return {
      customer_id:  Number(customerId),
      product_id:   String(p.product_id),
      product_data: {
        ...p,
        brand:              e.brand || p.vendor || null,
        commission_percent: e.commission_percent ?? 0,
        is_professional:    e.is_professional || false,
        componente:         e.componente || null,
      },
      updated_at: new Date().toISOString(),
    };
  });

  // Upsert en chunks de 500 para no reventar el payload
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("vh_pro_favoritos")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "customer_id,product_id" });
    if (error) throw new Error(`Supabase upsert: ${error.message}`);
  }

  return rows.length;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const args       = process.argv.slice(2);
  const flag       = (n) => { const i = args.indexOf(n); return i !== -1 && args[i+1] ? args[i+1] : null; };
  const has        = (n) => args.includes(n);
  const dryRun     = has("--dry-run");
  const limitAff   = flag("--limit") ? Number(flag("--limit")) : null;
  const onlyCustomer = flag("--customer");

  process.stderr.write(`\n🚀  sync-favoritos${dryRun ? " (DRY RUN)" : ""}\n\n`);

  // — Traer afiliados con colección asignada —
  let query = supabase
    .from("affiliates")
    .select("shopify_customer_id, shopify_collection_id")
    .not("shopify_collection_id", "is", null);

  if (onlyCustomer) query = query.eq("shopify_customer_id", Number(onlyCustomer));
  if (limitAff)     query = query.limit(limitAff);

  const { data: affiliates, error: affError } = await query;
  if (affError) { console.error("❌  Supabase affiliates:", affError.message); process.exit(1); }
  if (!affiliates?.length) { process.stderr.write("⚠️  Sin afiliados con colección asignada.\n\n"); process.exit(0); }

  process.stderr.write(`👥  ${affiliates.length} afiliado(s) a sincronizar\n\n`);

  // — Procesar cada afiliado —
  let totalProducts = 0, totalRows = 0, errors = 0;

  for (let i = 0; i < affiliates.length; i++) {
    const { shopify_customer_id: cid, shopify_collection_id: colId } = affiliates[i];
    process.stderr.write(`   [${i + 1}/${affiliates.length}] Customer ${cid} (col ${colId})… `);

    try {
      const products = await fetchAllCollectionProducts(colId);

      if (!products.length) {
        process.stderr.write(`sin productos\n`);
        continue;
      }

      const productIds    = products.map(p => p.product_id);
      const commissionMap = await fetchCommissions(productIds);

      if (dryRun) {
        process.stderr.write(`${products.length} productos (dry-run, no se escribe)\n`);
        totalProducts += products.length;
        continue;
      }

      const written = await upsertFavoritos(cid, products, commissionMap);
      process.stderr.write(`✅  ${products.length} productos → ${written} filas\n`);
      totalProducts += products.length;
      totalRows     += written;

    } catch (e) {
      process.stderr.write(`❌  ${e.message}\n`);
      errors++;
    }

    // Pausa entre afiliados para no saturar Shopify
    if (i < affiliates.length - 1) await sleep(300);
  }

  // — Resumen —
  process.stderr.write(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
  process.stderr.write(`👥  Afiliados:  ${affiliates.length}\n`);
  process.stderr.write(`📦  Productos:  ${totalProducts}\n`);
  if (!dryRun) process.stderr.write(`💾  Filas:      ${totalRows} (upsert en vh_pro_favoritos)\n`);
  if (errors)  process.stderr.write(`❌  Errores:    ${errors} afiliados fallidos\n`);
  process.stderr.write(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`);
})().catch(e => { console.error("❌  Error:", e.message); process.exit(1); });
