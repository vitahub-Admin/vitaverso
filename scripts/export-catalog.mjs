/**
 * export-catalog.mjs
 * Exporta SKU, EAN, precio, marca y comisión de todas las variantes de Shopify.
 * Fuentes: Shopify Admin GraphQL (precios/SKU/EAN) + Supabase product_catalog (marca/comisión).
 *
 * Uso:
 *   node scripts/export-catalog.mjs
 *   node scripts/export-catalog.mjs > catalogo.csv
 *   node scripts/export-catalog.mjs --out catalogo_$(date +%F).csv
 */

import { readFileSync, writeFileSync } from "fs";
import { createClient }                from "@supabase/supabase-js";

// ── Leer .env del proyecto ────────────────────────────────────────────────────
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
    console.error("No se encontró .env — coloca el script dentro de vitaverse/");
    process.exit(1);
  }
}

const env = loadEnv();
const GQL_URL   = `https://${env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;
const GQL_TOKEN = env.SHOPIFY_ACCESS_TOKEN;

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY
);

// ── Shopify: traer TODOS los productos con variantes (paginado) ───────────────
const PRODUCT_QUERY = /* graphql */ `
  query Products($after: String) {
    products(first: 250, after: $after, query: "status:active") {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          vendor
          variants(first: 100) {
            edges {
              node {
                id
                title
                sku
                barcode
                price
                inventoryQuantity
              }
            }
          }
        }
      }
    }
  }
`;

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method:  "POST",
    headers: {
      "Content-Type":          "application/json",
      "X-Shopify-Access-Token": GQL_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join(", "));
  return json.data;
}

async function fetchAllProducts() {
  const products = [];
  let after = null;
  let page  = 0;

  while (true) {
    page++;
    process.stderr.write(`  📦 Página ${page} de Shopify…\n`);
    const data = await gql(PRODUCT_QUERY, { after });
    const { edges, pageInfo } = data.products;

    for (const { node: p } of edges) {
      const productId = p.id.replace("gid://shopify/Product/", "");
      for (const { node: v } of p.variants.edges) {
        const variantId = v.id.replace("gid://shopify/ProductVariant/", "");
        products.push({
          product_id:    productId,
          product_title: p.title,
          vendor:        p.vendor,
          variant_id:    variantId,
          variant_title: v.title === "Default Title" ? "" : v.title,
          sku:           v.sku || "",
          ean:           v.barcode || "",
          price:         parseFloat(v.price || 0),
        });
      }
    }

    if (!pageInfo.hasNextPage) break;
    after = pageInfo.endCursor;
  }

  return products;
}

// ── Supabase: enriquecer con marca y comisión ─────────────────────────────────
async function fetchSupabaseEnrichment() {
  process.stderr.write(`  🗄️  Consultando Supabase product_catalog…\n`);

  // Traer todo en páginas de 1000
  const enrichment = {}; // product_id → { brand, commission_percent }
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("product_catalog")
      .select("product_shopify_id, brand, commission_percent")
      .range(from, from + PAGE - 1);

    if (error) {
      process.stderr.write(`  ⚠️  Supabase error: ${error.message}\n`);
      break;
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      enrichment[String(row.product_shopify_id)] = {
        brand:              row.brand || "",
        commission_percent: row.commission_percent ?? 0,
      };
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return enrichment;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
function csvCell(val) {
  if (val == null) return "";
  const s = String(val);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

const HEADERS = [
  "product_id",
  "product_title",
  "variant_id",
  "variant_title",
  "sku",
  "ean",
  "price_mxn",
  "cost_mxn",
  "brand",
  "vendor_shopify",
  "commission_percent",
];

function toCSV(rows) {
  const lines = [HEADERS.join(",")];
  for (const r of rows) {
    lines.push([
      csvCell(r.product_id),
      csvCell(r.product_title),
      csvCell(r.variant_id),
      csvCell(r.variant_title),
      csvCell(r.sku),
      csvCell(r.ean),
      csvCell(r.price),
      csvCell(r.cost),
      csvCell(r.brand),
      csvCell(r.vendor),
      csvCell(r.commission_percent),
    ].join(","));
  }
  return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  process.stderr.write("\n🚀 Exportando catálogo…\n\n");

  const [variants, enrichment] = await Promise.all([
    fetchAllProducts(),
    fetchSupabaseEnrichment(),
  ]);

  process.stderr.write(`\n  ✅ ${variants.length} variantes desde Shopify\n`);
  process.stderr.write(`  ✅ ${Object.keys(enrichment).length} productos enriquecidos desde Supabase\n\n`);

  // Merge
  const rows = variants.map(v => {
    const e = enrichment[v.product_id] || {};
    return {
      ...v,
      brand:              e.brand || v.vendor || "",
      commission_percent: e.commission_percent ?? 0,
    };
  });

  // Ordenar por marca, luego producto, luego variante
  rows.sort((a, b) =>
    (a.brand || "").localeCompare(b.brand || "", "es") ||
    a.product_title.localeCompare(b.product_title, "es") ||
    (a.variant_title || "").localeCompare(b.variant_title || "", "es")
  );

  const csv = toCSV(rows);

  // Detectar si hay --out argumento
  const outIdx = process.argv.indexOf("--out");
  if (outIdx !== -1 && process.argv[outIdx + 1]) {
    const outFile = process.argv[outIdx + 1];
    writeFileSync(outFile, "﻿" + csv, "utf8"); // BOM para Excel
    process.stderr.write(`📄 CSV guardado en: ${outFile}\n`);
    process.stderr.write(`   ${rows.length} filas\n\n`);
  } else {
    // stdout — redirigir con >
    process.stdout.write("﻿" + csv + "\n");
    process.stderr.write(`📄 ${rows.length} filas listas (redirige con > archivo.csv)\n\n`);
  }
})().catch(e => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
