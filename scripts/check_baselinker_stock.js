// scripts/check_baselinker_stock.js
// Diagnóstico: inventarios disponibles en Baselinker + stock actual
// + overlap de SKUs con product_catalog en Supabase.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const BL_URL   = "https://api.baselinker.com/connector.php";
const BL_TOKEN = process.env.BASELINKER_TOKEN;

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
  return res.json();
}

async function main() {
  console.log("\n🔌 DIAGNÓSTICO BASELINKER STOCK");
  console.log("═".repeat(60));

  // ── 1. Listar inventarios disponibles ─────────────────────────
  console.log("\n📋 Inventarios disponibles:");
  const invRes = await bl("getInventories");

  if (invRes.status !== "SUCCESS") {
    console.error("❌ Error:", invRes.error_message || JSON.stringify(invRes));
    process.exit(1);
  }

  const inventories = invRes.inventories || [];
  inventories.forEach(inv => {
    console.log(`   • [${inv.inventory_id}] ${inv.name}  (langs: ${inv.languages?.join(", ")})`);
  });

  if (!inventories.length) {
    console.log("   (sin inventarios)");
    process.exit(0);
  }

  // Usar el primer inventario (o el que tenga más sentido)
  const targetInv = inventories[0];
  console.log(`\n→ Usando inventario: [${targetInv.inventory_id}] ${targetInv.name}`);

  // ── 2. Obtener stock paginado ──────────────────────────────────
  console.log("\n📦 Leyendo stock (paginado)...");
  const allStock = {}; // product_id → { sku, quantity }
  let page = 1;

  while (true) {
    const res = await bl("getInventoryProductsStock", {
      inventory_id: targetInv.inventory_id,
      page,
    });

    if (res.status !== "SUCCESS") {
      console.error(`   ❌ Error página ${page}:`, res.error_message);
      break;
    }

    const products = res.products || {};
    const count = Object.keys(products).length;
    if (count === 0) break;

    Object.assign(allStock, products);
    console.log(`   Página ${page}: ${count} productos (total acumulado: ${Object.keys(allStock).length})`);

    if (count < 1000) break; // Baselinker devuelve máx 1000 por página
    page++;
    await sleep(650); // rate limit
  }

  const total = Object.keys(allStock).length;
  console.log(`\n   Total productos con stock info: ${total}`);

  // ── 3. Muestra de productos con/sin stock ─────────────────────
  const entries = Object.entries(allStock);
  // Baselinker stock: { product_id: { stock: { variant_id: qty } } }
  // O a veces: { product_id: qty_directa }
  // Mostramos la estructura cruda de los primeros 3
  console.log("\n🔍 Estructura de los primeros 3 productos (raw):");
  entries.slice(0, 3).forEach(([pid, data]) => {
    console.log(`   product_id ${pid}:`, JSON.stringify(data).slice(0, 120));
  });

  // ── 4. Obtener lista de productos para ver SKUs ────────────────
  console.log("\n🏷️  Leyendo lista de productos (para ver SKUs)...");
  const listRes = await bl("getInventoryProductsList", {
    inventory_id: targetInv.inventory_id,
    page: 1,
  });

  if (listRes.status !== "SUCCESS") {
    console.error("   ❌ Error obteniendo lista:", listRes.error_message);
  } else {
    const products = listRes.products || {};
    const sample = Object.entries(products).slice(0, 8);

    console.log(`\n   Muestra de productos (${Object.keys(products).length} en página 1):`);
    sample.forEach(([pid, p]) => {
      const qty = allStock[pid];
      const stock = typeof qty === "number" ? qty : JSON.stringify(qty)?.slice(0, 30);
      console.log(`   • [${pid}] SKU: ${(p.sku || "—").padEnd(20)} | "${(p.name || "").slice(0, 35)}" | stock: ${stock}`);
    });

    // ── 5. getInventoryProductsData: ver estructura completa con variantes ──
    const sampleIds = Object.keys(products).slice(0, 5).map(Number);
    console.log(`\n🔬 Detalle completo de los primeros 5 productos (getInventoryProductsData):`);
    const detailRes = await bl("getInventoryProductsData", {
      inventory_id: targetInv.inventory_id,
      products: sampleIds,
    });

    if (detailRes.status === "SUCCESS") {
      Object.entries(detailRes.products || {}).slice(0, 5).forEach(([pid, p]) => {
        console.log(`\n   product_id ${pid}:`);
        console.log(`     sku:       ${p.sku || "—"}`);
        console.log(`     ean:       ${p.ean || "—"}`);
        console.log(`     name:      ${(p.name || "—").slice(0, 50)}`);
        // Variantes
        const variants = p.variants || {};
        const varKeys = Object.keys(variants);
        if (varKeys.length > 0) {
          console.log(`     variantes: ${varKeys.length}`);
          varKeys.slice(0, 3).forEach(vid => {
            const v = variants[vid];
            console.log(`       variant_id ${vid}: sku="${v.sku}" ean="${v.ean}" name="${(v.name||"").slice(0,30)}"`);
          });
        } else {
          console.log(`     variantes: (ninguna / producto simple)`);
        }
      });
    } else {
      console.log("   ❌ Error:", detailRes.error_message);
    }

    // ── 7. Overlap: BL sku → product_catalog.variant_id ──────────
    // Los SKUs de BL son numéricos — probablemente son variant_ids de Shopify
    const blVariantIds = Object.values(products)
      .map(p => Number(p.sku))
      .filter(n => !isNaN(n) && n > 0);

    console.log(`\n🔗 Overlap BL (sku numérico) vs product_catalog.variant_id:`);

    if (blVariantIds.length > 0) {
      const { data: matches } = await supabase
        .from("product_catalog")
        .select("variant_id, sku, title")
        .in("variant_id", blVariantIds.slice(0, 500));

      const matchCount = (matches || []).length;
      console.log(`   BL productos (pág 1): ${blVariantIds.length}`);
      console.log(`   Match en product_catalog.variant_id: ${matchCount}`);

      if (matchCount > 0) {
        console.log(`\n   ✅ ¡Matchean! Ejemplos:`);
        (matches || []).slice(0, 5).forEach(r => {
          // Calcular stock total sumando todos los almacenes
          const blProd = Object.values(products).find(p => Number(p.sku) === r.variant_id);
          const stockMap = blProd ? allStock[
            Object.keys(allStock).find(pid => Object.values(products).find(p => p.product_id === Number(pid) && Number(p.sku) === r.variant_id))
          ]?.stock || {} : {};
          const totalStock = Object.values(stockMap).reduce((s, q) => s + q, 0);
          const icon = totalStock > 0 ? "🟢" : "🔴";
          console.log(`   ${icon} variant_id: ${r.variant_id}  stock total: ${totalStock}  (${r.title?.slice(0, 35)})`);
        });

        // Mostrar desglose de almacenes del primer match
        const firstMatch = matches[0];
        const firstProd = Object.values(products).find(p => Number(p.sku) === firstMatch.variant_id);
        if (firstProd) {
          const firstStock = Object.values(allStock).find(s => s?.product_id === firstProd.product_id);
          if (firstStock?.stock) {
            console.log(`\n   📦 Desglose de almacenes para variant ${firstMatch.variant_id}:`);
            Object.entries(firstStock.stock).forEach(([warehouse, qty]) => {
              console.log(`      ${warehouse}: ${qty}`);
            });
          }
        }
      } else {
        console.log(`   ⚠️  Sin match por variant_id tampoco`);
        const { data: catSample } = await supabase
          .from("product_catalog")
          .select("variant_id, sku")
          .limit(4);
        console.log(`   BL skus (muestra):          ${blVariantIds.slice(0, 3).join(" | ")}`);
        console.log(`   Catalog variant_ids:         ${(catSample || []).map(r => r.variant_id).join(" | ")}`);
        console.log(`   Catalog skus:                ${(catSample || []).map(r => r.sku).join(" | ")}`);
      }
    }
  }

  console.log("\n" + "═".repeat(60));
}

main()
  .then(() => { process.exitCode = 0; })
  .catch(err => {
    console.error("\n💥", err.message);
    process.exitCode = 1;
  });
