// scripts/check_pulse_inventario.js
// Diagnóstico: conecta al Supabase de analytics (Pulse) y verifica
// qué trae inventario_diario + overlap de SKUs con product_catalog.

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const pulse = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_PULSE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_PULSE_KEY
);

const main = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function main_fn() {
  console.log("\n🔌 DIAGNÓSTICO PULSE SUPABASE");
  console.log("═".repeat(60));

  // ── 1. Últimas fechas disponibles ─────────────────────────────
  console.log("\n📅 Últimas fechas en inventario_diario:");
  const { data: fechas, error: errFechas } = await pulse
    .from("inventario_diario")
    .select("fecha")
    .order("fecha", { ascending: false })
    .limit(5);

  if (errFechas) {
    console.error("❌ Error conectando a Pulse:", errFechas.message);
    process.exit(1);
  }

  const uniqueFechas = [...new Set((fechas || []).map(r => r.fecha))];
  uniqueFechas.forEach(f => console.log(`   • ${f}`));

  if (!uniqueFechas.length) {
    console.log("   (sin datos)");
    process.exit(0);
  }

  const latestDate = uniqueFechas[0];

  // ── 2. Muestra de filas del día más reciente ──────────────────
  console.log(`\n📦 Muestra de inventario_diario (${latestDate}):`);
  const { data: sample } = await pulse
    .from("inventario_diario")
    .select("sku, inventory_quantity, encendido")
    .eq("fecha", latestDate)
    .order("inventory_quantity", { ascending: false })
    .limit(10);

  (sample || []).forEach(r => {
    const icon = r.encendido ? "🟢" : "🔴";
    console.log(`   ${icon} ${r.sku.padEnd(20)} qty: ${r.inventory_quantity}`);
  });

  // ── 3. Totales del día más reciente ──────────────────────────
  const { data: totals } = await pulse
    .from("inventario_diario")
    .select("encendido")
    .eq("fecha", latestDate);

  const total     = (totals || []).length;
  const encendidos = (totals || []).filter(r => r.encendido).length;
  console.log(`\n   Total SKUs en ${latestDate}: ${total}`);
  console.log(`   🟢 Con stock: ${encendidos}  |  🔴 Sin stock: ${total - encendidos}`);

  // ── 4. Detección OFF→ON (si hay al menos 2 días) ─────────────
  if (uniqueFechas.length >= 2) {
    const prevDate = uniqueFechas[1];
    console.log(`\n🔄 SKUs OFF→ON entre ${prevDate} → ${latestDate}:`);

    const { data: restocked } = await pulse
      .from("inventario_diario")
      .select("sku, inventory_quantity")
      .eq("fecha", latestDate)
      .eq("encendido", true);

    const { data: wasOut } = await pulse
      .from("inventario_diario")
      .select("sku")
      .eq("fecha", prevDate)
      .eq("encendido", false);

    const wasOutSet = new Set((wasOut || []).map(r => r.sku));
    const backInStock = (restocked || []).filter(r => wasOutSet.has(r.sku));

    if (backInStock.length === 0) {
      console.log("   (ninguno entre esos dos días)");
    } else {
      backInStock.slice(0, 10).forEach(r => {
        console.log(`   ✅ ${r.sku}  qty: ${r.inventory_quantity}`);
      });
      if (backInStock.length > 10) {
        console.log(`   ... y ${backInStock.length - 10} más`);
      }
    }

    // ── 5. Overlap SKUs con product_catalog ──────────────────────
    console.log("\n🔗 Overlap SKUs Pulse vs product_catalog (main Supabase):");

    const pulseSKUs = [...new Set((restocked || []).map(r => r.sku))];
    if (pulseSKUs.length > 0) {
      const { data: catalogMatches } = await main
        .from("product_catalog")
        .select("sku, variant_id, title")
        .in("sku", pulseSKUs.slice(0, 500));   // máx 500 para la query

      const matchCount = (catalogMatches || []).length;
      console.log(`   SKUs con stock en Pulse:        ${pulseSKUs.length}`);
      console.log(`   Encontrados en product_catalog: ${matchCount}`);

      if (matchCount > 0) {
        console.log(`\n   Ejemplos matcheados:`);
        (catalogMatches || []).slice(0, 5).forEach(r => {
          console.log(`   • ${r.sku}  →  variant_id: ${r.variant_id}  (${r.title?.slice(0, 40)})`);
        });
      } else {
        console.log("   ⚠️  Ningún match — probablemente los SKUs tienen formato diferente");
        console.log(`\n   SKU de Pulse (muestra): ${pulseSKUs.slice(0, 5).join(", ")}`);
        const { data: catSample } = await main
          .from("product_catalog")
          .select("sku")
          .limit(5);
        console.log(`   SKU de product_catalog: ${(catSample || []).map(r => r.sku).join(", ")}`);
      }
    }
  } else {
    console.log("\n⚠️  Solo hay 1 día de datos — necesitas al menos 2 para detectar OFF→ON");
  }

  console.log("\n" + "═".repeat(60));
}

main_fn()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("\n💥 Error:", err.message);
    process.exit(1);
  });
