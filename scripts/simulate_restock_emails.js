// scripts/simulate_restock_emails.js
// Simulacro de notificaciones de restock SIN enviar emails ni modificar la DB.
//
// Pregunta: "Si TODOS los productos que hoy tienen stock=0 volvieran a stock ahora,
//            ¿a qué especialistas les mandaríamos mail y por qué productos?"
//
// Criterio de elección: sharecarts de los ÚLTIMOS 90 DÍAS que contengan el variant_id.
//
// Uso:
//   node --env-file=.env scripts/simulate_restock_emails.js
//   node --env-file=.env scripts/simulate_restock_emails.js --json   (solo JSON, sin tabla)

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import "dotenv/config";

const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const ONLY_JSON  = process.argv.includes("--json");
const CUTOFF_DAYS = 90;

async function main() {
  if (!ONLY_JSON) {
    console.log("\n🧪 SIMULACRO DE RESTOCK EMAILS");
    console.log(`   Criterio: sharecarts de los últimos ${CUTOFF_DAYS} días`);
    console.log(`   Acción:   solo lectura — no se envía nada`);
    console.log("═".repeat(60));
  }

  const cutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 3600 * 1000).toISOString();

  // ── 1. Todos los productos actualmente en 0 que tienen variant_id ──────────
  if (!ONLY_JSON) console.log("\n📦 Leyendo productos con stock = 0...");

  const { data: outOfStock, error: errOOS } = await supabase
    .from("product_stock_state")
    .select("sku, variant_id")
    .eq("stock_quantity", 0)
    .not("variant_id", "is", null);

  if (errOOS) throw new Error(`product_stock_state: ${errOOS.message}`);
  if (!outOfStock?.length) {
    if (!ONLY_JSON) console.log("   ✅ No hay productos en stock=0 — nada que simular");
    console.log(JSON.stringify({ specialists: [], total_specialists: 0, total_products_oos: 0 }, null, 2));
    return;
  }

  if (!ONLY_JSON) console.log(`   ${outOfStock.length} productos en stock=0 con variant_id`);

  // ── 2. Traer TODOS los sharecarts de los últimos 90 días (una sola query) ──
  if (!ONLY_JSON) console.log("\n🔍 Leyendo sharecarts de los últimos 90 días...");

  const { data: allCarts, error: errCarts } = await supabase
    .from("sharecarts")
    .select("owner_id, items")
    .gte("created_at", cutoff)
    .not("owner_id", "is", null);

  if (errCarts) throw new Error(`sharecarts: ${errCarts.message}`);
  if (!ONLY_JSON) console.log(`   ${allCarts?.length || 0} sharecarts en los últimos ${CUTOFF_DAYS} días`);

  // Construir índice: variant_id → Set<owner_id>  (filtrando en JS)
  const variantOwners = {};
  for (const cart of (allCarts || [])) {
    const items = Array.isArray(cart.items) ? cart.items : [];
    for (const item of items) {
      const vid = item.variant_id != null ? String(item.variant_id) : null;
      if (!vid) continue;
      if (!variantOwners[vid]) variantOwners[vid] = new Set();
      variantOwners[vid].add(String(cart.owner_id));
    }
  }

  // owner_id → Map<sku, { sku, variant_id }>
  const ownerSkus = {};
  for (const item of outOfStock) {
    const owners = variantOwners[String(item.variant_id)];
    if (!owners?.size) continue;
    for (const oid of owners) {
      if (!ownerSkus[oid]) ownerSkus[oid] = {};
      ownerSkus[oid][item.sku] = { sku: item.sku, variant_id: item.variant_id };
    }
  }

  const ownerIds = Object.keys(ownerSkus);
  if (!ONLY_JSON) console.log(`   ${ownerIds.length} especialistas recibirían al menos un email`);

  if (ownerIds.length === 0) {
    const result = { specialists: [], total_specialists: 0, total_products_oos: outOfStock.length };
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // ── 3. Nombres de productos ────────────────────────────────────────────────
  const allSkus = [...new Set(outOfStock.map(p => p.sku))];
  const titleMap = {};
  const BATCH = 200;

  for (let i = 0; i < allSkus.length; i += BATCH) {
    const { data: rows } = await supabase
      .from("product_catalog")
      .select("sku, title, brand, price")
      .in("sku", allSkus.slice(i, i + BATCH));

    for (const r of (rows || [])) {
      titleMap[r.sku] = { title: r.title, brand: r.brand, price: r.price };
    }
  }

  // ── 4. Datos de especialistas ──────────────────────────────────────────────
  const numericIds = ownerIds.map(Number).filter(n => !isNaN(n));

  const { data: affiliates, error: errAff } = await supabase
    .from("affiliates")
    .select("shopify_customer_id, first_name, last_name, email")
    .in("shopify_customer_id", numericIds);

  if (errAff) throw new Error(`affiliates: ${errAff.message}`);

  const affMap = Object.fromEntries(
    (affiliates || []).map(a => [String(a.shopify_customer_id), a])
  );

  // ── 5. Construir resultado ─────────────────────────────────────────────────
  const specialists = ownerIds.map(oid => {
    const aff      = affMap[oid] || {};
    const products = Object.values(ownerSkus[oid]).map(p => ({
      sku:        p.sku,
      variant_id: p.variant_id,
      title:      titleMap[p.sku]?.title  || p.sku,
      brand:      titleMap[p.sku]?.brand  || null,
      price:      titleMap[p.sku]?.price  || null,
    }));

    return {
      owner_id:   oid,
      name:       `${aff.first_name || ""} ${aff.last_name || ""}`.trim() || `owner:${oid}`,
      email:      aff.email || null,
      product_count: products.length,
      products,
    };
  }).sort((a, b) => b.product_count - a.product_count); // más afectados primero

  const result = {
    simulated_at:       new Date().toISOString(),
    cutoff_days:        CUTOFF_DAYS,
    total_products_oos: outOfStock.length,
    total_specialists:  specialists.length,
    specialists,
  };

  // ── 6. Output ──────────────────────────────────────────────────────────────
  if (ONLY_JSON) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Tabla en consola
  console.log("\n📊 RESULTADO:\n");
  console.log(`  Productos en stock=0:      ${result.total_products_oos}`);
  console.log(`  Especialistas a notificar: ${result.total_specialists}`);
  console.log("");
  console.log("  Especialista".padEnd(35) + "Email".padEnd(35) + "Productos");
  console.log("  " + "─".repeat(85));

  for (const s of specialists) {
    const name  = s.name.slice(0, 33).padEnd(33);
    const email = (s.email || "(sin email)").slice(0, 33).padEnd(33);
    console.log(`  ${name}  ${email}  ${s.product_count}`);
    if (s.product_count <= 5) {
      for (const p of s.products) {
        console.log(`    └ ${p.title?.slice(0, 60) || p.sku}`);
      }
    } else {
      for (const p of s.products.slice(0, 3)) {
        console.log(`    └ ${p.title?.slice(0, 60) || p.sku}`);
      }
      console.log(`    └ … y ${s.product_count - 3} más`);
    }
  }

  // Guardar JSON
  const filename = `simulate_restock_${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(filename, JSON.stringify(result, null, 2), "utf8");
  console.log(`\n💾 JSON guardado → ${filename}`);
  console.log("═".repeat(60));
}

main()
  .then(() => { process.exitCode = 0; })
  .catch(err => {
    console.error(`\n💥 ${err.message}`);
    process.exitCode = 1;
  });
