// scripts/sync_stock_from_baselinker.js
// Sincroniza stock de Baselinker → product_stock_state en Supabase.
// Detecta transiciones OFF→ON (came_back_at) y ON→OFF (went_out_at).
// Corre diario (o antes del job de emails del martes/viernes).

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const BL_URL       = "https://api.baselinker.com/connector.php";
const BL_TOKEN     = process.env.BASELINKER_TOKEN;
const BL_INV_ID    = 50176; // "Por defecto 27022026" — cambiar si cambia
const BL_DELAY_MS  = 700;   // rate limit Baselinker

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function bl(method, params = {}) {
  const body = new URLSearchParams({ method, parameters: JSON.stringify(params) });
  const res = await fetch(BL_URL, {
    method: "POST",
    headers: {
      "X-BLToken": BL_TOKEN,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const json = await res.json();
  if (json.status !== "SUCCESS") {
    throw new Error(`Baselinker ${method}: ${json.error_message || JSON.stringify(json)}`);
  }
  return json;
}

// ── 1. Stock total por product_id (suma todos los almacenes) ──────────────────
async function fetchAllStock() {
  const stockMap = {}; // product_id → total_qty
  let page = 1;
  while (true) {
    const res = await bl("getInventoryProductsStock", { inventory_id: BL_INV_ID, page });
    const products = res.products || {};
    const count = Object.keys(products).length;
    if (count === 0) break;

    for (const [pid, data] of Object.entries(products)) {
      const total = Object.values(data.stock || {}).reduce((s, q) => s + (Number(q) || 0), 0);
      stockMap[Number(pid)] = total;
    }

    if (count < 1000) break;
    page++;
    await sleep(BL_DELAY_MS);
  }
  return stockMap; // { product_id: total_qty }
}

// ── 2. SKU VHMX por product_id (vía variantes) ───────────────────────────────
async function fetchSkuMap(productIds) {
  // { product_id → "VHMX..." }  (primera variante con SKU)
  const skuMap = {};
  const BATCH  = 1000;

  for (let i = 0; i < productIds.length; i += BATCH) {
    const batch = productIds.slice(i, i + BATCH);
    const res = await bl("getInventoryProductsData", {
      inventory_id: BL_INV_ID,
      products: batch,
    });

    for (const [pid, p] of Object.entries(res.products || {})) {
      // Intentar SKU de variante primero, luego SKU de producto
      let sku = null;
      const variants = Object.values(p.variants || {});
      if (variants.length > 0) {
        sku = variants[0].sku || null;
      }
      if (!sku) sku = p.sku || null;
      if (sku) skuMap[Number(pid)] = sku;
    }

    if (i + BATCH < productIds.length) await sleep(BL_DELAY_MS);
  }

  return skuMap;
}

// ── 3. variant_id desde product_catalog por SKU (batcheado) ──────────────────
async function fetchVariantIds(skus) {
  const BATCH = 200; // PostgREST GET URL tiene límite de tamaño
  const result = {};

  for (let i = 0; i < skus.length; i += BATCH) {
    const batch = skus.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("product_catalog")
      .select("sku, variant_id")
      .in("sku", batch);

    if (error) throw new Error(`product_catalog fetch (batch ${Math.floor(i/BATCH)+1}): ${error.message}`);
    for (const r of (data || [])) result[r.sku] = r.variant_id;
  }

  return result;
}

// ── 4. Estado actual en product_stock_state (batcheado) ──────────────────────
async function fetchCurrentStates(skus) {
  const BATCH = 200;
  const result = {};

  for (let i = 0; i < skus.length; i += BATCH) {
    const batch = skus.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("product_stock_state")
      .select("sku, stock_quantity, in_stock, went_out_at, came_back_at, notified_at")
      .in("sku", batch);

    if (error) throw new Error(`product_stock_state fetch (batch ${Math.floor(i/BATCH)+1}): ${error.message}`);
    for (const r of (data || [])) result[r.sku] = r;
  }

  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n🔄 SYNC STOCK BASELINKER → SUPABASE");
  console.log("═".repeat(60));
  console.time("⏱  Tiempo total");
  const now = new Date().toISOString();

  // Paso 1: stock total por product_id
  console.log("\n📦 Obteniendo stock de Baselinker...");
  const stockByPid = await fetchAllStock();
  console.log(`   ${Object.keys(stockByPid).length} productos con stock info`);

  // Paso 2: SKU VHMX por product_id
  console.log("\n🏷️  Obteniendo SKUs de variantes...");
  const productIds = Object.keys(stockByPid).map(Number);
  const skuByPid   = await fetchSkuMap(productIds);
  console.log(`   ${Object.keys(skuByPid).length} productos con SKU mapeado`);

  // Construir mapa SKU → qty
  const qtyBySku = {};
  for (const [pid, sku] of Object.entries(skuByPid)) {
    if (sku) qtyBySku[sku] = stockByPid[Number(pid)] ?? 0;
  }
  const allSkus = Object.keys(qtyBySku);
  console.log(`   ${allSkus.length} SKUs únicos`);

  // Paso 3: variant_ids desde product_catalog
  console.log("\n🔗 Cruzando con product_catalog...");
  const variantBySku = await fetchVariantIds(allSkus);
  console.log(`   ${Object.keys(variantBySku).length} SKUs encontrados en catálogo`);

  // Paso 4: estado actual en Supabase
  console.log("\n📊 Leyendo estado actual en product_stock_state...");
  const currentStates = await fetchCurrentStates(allSkus);
  console.log(`   ${Object.keys(currentStates).length} SKUs ya registrados`);

  // Paso 5: calcular upserts
  console.log("\n💾 Calculando actualizaciones...");
  const upserts = [];
  let newEntries = 0, turnedOn = 0, turnedOff = 0, unchanged = 0;

  for (const sku of allSkus) {
    const newQty      = qtyBySku[sku] ?? 0;
    const nowInStock  = newQty > 0;
    const current     = currentStates[sku];
    const variantId   = variantBySku[sku] || null;

    const row = {
      sku,
      variant_id:     variantId,
      stock_quantity: newQty,
      updated_at:     now,
    };

    if (!current) {
      // Primera vez que vemos este SKU — sin historiales
      newEntries++;
    } else {
      const wasInStock = current.in_stock;

      if (!wasInStock && nowInStock) {
        // OFF → ON 🎉
        row.came_back_at = now;
        // Preservar notified_at del estado anterior (no lo pisamos)
        turnedOn++;
        console.log(`   ✅ BACK IN STOCK: ${sku} (qty: ${newQty})`);
      } else if (wasInStock && !nowInStock) {
        // ON → OFF
        row.went_out_at = now;
        turnedOff++;
      } else {
        unchanged++;
      }
    }

    upserts.push(row);
  }

  console.log(`\n   🆕 Nuevos:         ${newEntries}`);
  console.log(`   🟢 Volvieron:      ${turnedOn}`);
  console.log(`   🔴 Se apagaron:    ${turnedOff}`);
  console.log(`   ⚪ Sin cambio:     ${unchanged}`);

  // Paso 6: upsert en batches de 500
  console.log("\n💾 Guardando en Supabase...");
  const BATCH = 500;
  let saved = 0, errors = 0;

  for (let i = 0; i < upserts.length; i += BATCH) {
    const batch = upserts.slice(i, i + BATCH);
    const { error } = await supabase
      .from("product_stock_state")
      .upsert(batch, {
        onConflict: "sku",
        ignoreDuplicates: false,
      });

    if (error) {
      console.error(`   ❌ Error batch ${i / BATCH + 1}: ${error.message}`);
      errors++;
    } else {
      saved += batch.length;
    }
  }

  console.log(`   ✅ Guardados: ${saved} | ❌ Errores: ${errors}`);

  // Paso 7: Resumen de pendientes de notificación
  const { count: pendingCount } = await supabase
    .from("product_stock_state")
    .select("sku", { count: "exact", head: true })
    .not("came_back_at", "is", null)
    .or("notified_at.is.null,notified_at.lt.came_back_at");

  console.log(`\n📬 Pendientes de notificación: ${pendingCount ?? "?"}`);
  console.log("\n" + "═".repeat(60));
  console.timeEnd("⏱  Tiempo total");
}

main()
  .then(() => { process.exitCode = 0; })
  .catch(err => {
    console.error("\n💥 Error fatal:", err.message);
    process.exitCode = 1;
  });
