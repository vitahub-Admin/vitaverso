// scripts/send_restock_emails.js
// Envía un email por especialista con los productos que volvieron a stock
// y que están en sus sharecarts. Corre martes y viernes después de sync.
//
// Flujo:
//   1. Leer product_stock_state donde came_back_at > notified_at (pendientes)
//   2. Por cada variant_id, buscar sharecarts que lo contengan (owner_id)
//   3. Agrupar por owner_id → lista de productos restockeados
//   4. Para cada especialista: obtener email, enviar un solo correo con todo
//   5. Actualizar notified_at en los SKUs notificados con éxito

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import "dotenv/config";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const resend = new Resend(process.env.RESEND_API_KEY);

// ── Email template ────────────────────────────────────────────────────────────
function buildRestockEmail({ specialistName, products }) {
  const rows = products.map((p, i) => `
    <tr>
      <td style="padding:16px 0;${i > 0 ? "border-top:1px solid #f3f4f6;" : ""}">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td>
              <span style="display:inline-block;background:#1e8fa8;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-right:10px;">Disponible</span>
              <span style="font-size:15px;font-weight:700;color:#1b3f7a;">${p.title}</span>
            </td>
            <td align="right" style="white-space:nowrap;">
              <span style="font-size:12px;color:#9ca3af;">${p.cartCount} protocolo${p.cartCount !== 1 ? "s" : ""}</span>
            </td>
          </tr>
          ${p.sku ? `<tr><td style="font-size:11px;color:#c4c9d4;padding-top:4px;">SKU: ${p.sku}</td></tr>` : ""}
        </table>
      </td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Productos con stock repuesto</title>
</head>
<body style="margin:0;padding:0;background:#F7F9FB;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F9FB;">
<tr><td align="center" style="padding:40px 20px;">
<table cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#1b3f7a;border-radius:16px 16px 0 0;padding:28px 36px 24px;">
    <p style="margin:0 0 6px;color:#7eb8c9;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">Vitahub Pro</p>
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.3;">🔔 Productos disponibles de nuevo</h1>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="background:#ffffff;padding:28px 36px 12px;">
    <p style="margin:0 0 12px;font-size:15px;color:#374151;line-height:1.7;">
      Hola <strong>${specialistName}</strong>,
    </p>
    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;">
      Los siguientes productos que están en tus protocolos volvieron a tener stock.<br>
      Tus clientes ya pueden ordenarlos.
    </p>
  </td></tr>

  <!-- Product list -->
  <tr><td style="background:#ffffff;padding:4px 36px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${rows}
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="background:#f0f7ff;border-top:1px solid #dbeafe;padding:24px 36px;text-align:center;">
    <p style="margin:0 0 16px;font-size:13px;color:#4b5563;">
      Comparte los protocolos actualizados con tus pacientes
    </p>
    <a href="https://pro.vitahub.mx/mis-protocolos"
       style="display:inline-block;background:#1b3f7a;color:#ffffff;font-size:14px;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none;">
      Ver mis protocolos →
    </a>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;border-radius:0 0 16px 16px;padding:20px 36px;">
    <p style="margin:0;font-size:11px;color:#9ca3af;line-height:1.8;text-align:center;">
      <strong style="color:#1b3f7a;">Vitahub Pro</strong> · Plataforma para especialistas<br>
      <a href="https://pro.vitahub.mx" style="color:#1E8FA8;text-decoration:none;">pro.vitahub.mx</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const DRY_RUN = process.argv.includes("--dry-run");

  console.log("\n📬 SEND RESTOCK EMAILS");
  if (DRY_RUN) console.log("   ⚠️  DRY RUN — no se envían emails ni se actualiza notified_at");
  console.log("═".repeat(60));
  console.time("⏱  Tiempo total");
  const now = new Date().toISOString();

  // ── 1. Pendientes de notificación ─────────────────────────────────────────
  console.log("\n📊 Leyendo SKUs pendientes...");
  const { data: pending, error: errPending } = await supabase
    .from("product_stock_state")
    .select("sku, variant_id, came_back_at, stock_quantity")
    .not("came_back_at", "is", null)
    .or("notified_at.is.null,notified_at.lt.came_back_at")
    .gt("stock_quantity", 0); // asegurarse que sigue en stock

  if (errPending) throw new Error(`product_stock_state: ${errPending.message}`);

  if (!pending || pending.length === 0) {
    console.log("   ✅ Sin pendientes — nada que enviar");
    console.timeEnd("⏱  Tiempo total");
    return;
  }

  const pendingWithVariant = pending.filter(p => p.variant_id);
  console.log(`   ${pending.length} SKUs pendientes (${pendingWithVariant.length} con variant_id)`);

  // ── 2. Para cada variant_id, buscar sharecarts que lo contengan ───────────
  console.log("\n🔍 Buscando sharecarts afectados...");

  // Corte: solo carts creados en los últimos 90 días
  const cutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();

  // Map: owner_id → [{ sku, variant_id, title, cartCount }]
  const ownerProducts = {}; // owner_id → Map<sku, { sku, variant_id, title, cartCount }>
  const notifiedSkus  = new Set(); // SKUs que al menos un especialista tiene en sus carts

  for (const item of pendingWithVariant) {
    // Buscar carts donde items @> [{ variant_id: N }]
    const { data: carts, error: errCarts } = await supabase
      .from("sharecarts")
      .select("owner_id, name")
      .contains("items", [{ variant_id: item.variant_id }])
      .gte("created_at", cutoff)
      .not("owner_id", "is", null);

    if (errCarts) {
      console.warn(`   ⚠️  Error buscando carts para variant ${item.variant_id}: ${errCarts.message}`);
      continue;
    }

    if (!carts || carts.length === 0) continue;

    // Contar cuántos carts distintos de cada owner tienen este producto
    const ownerCount = {};
    for (const cart of carts) {
      const oid = String(cart.owner_id);
      ownerCount[oid] = (ownerCount[oid] || 0) + 1;
    }

    for (const [oid, count] of Object.entries(ownerCount)) {
      if (!ownerProducts[oid]) ownerProducts[oid] = {};
      ownerProducts[oid][item.sku] = {
        sku:       item.sku,
        variant_id: item.variant_id,
        title:     null, // se llena abajo
        cartCount: count,
      };
      notifiedSkus.add(item.sku);
    }
  }

  const ownerIds = Object.keys(ownerProducts);
  console.log(`   ${ownerIds.length} especialistas afectados`);
  console.log(`   ${notifiedSkus.size} SKUs tienen al menos un especialista`);

  if (ownerIds.length === 0) {
    console.log("   ✅ Ningún especialista tiene estos productos en sus protocolos activos");
    // Aun así actualizar notified_at para no reintentar en la próxima ejecución
    if (!DRY_RUN) await markAsNotified([...notifiedSkus], now);
    console.timeEnd("⏱  Tiempo total");
    return;
  }

  // ── 3. Nombres de productos desde product_catalog ─────────────────────────
  console.log("\n🏷️  Obteniendo nombres de productos...");
  const allSkusToName = [...notifiedSkus];
  const titleBySku = {};
  const BATCH = 200;

  for (let i = 0; i < allSkusToName.length; i += BATCH) {
    const batch = allSkusToName.slice(i, i + BATCH);
    const { data: catalogRows } = await supabase
      .from("product_catalog")
      .select("sku, title")
      .in("sku", batch);

    for (const r of (catalogRows || [])) {
      titleBySku[r.sku] = r.title || r.sku;
    }
  }

  // Llenar titles en ownerProducts
  for (const products of Object.values(ownerProducts)) {
    for (const p of Object.values(products)) {
      p.title = titleBySku[p.sku] || p.sku;
    }
  }

  // ── 4. Datos de especialistas (email, nombre) ─────────────────────────────
  console.log("\n👤 Obteniendo datos de especialistas...");
  const numericOwnerIds = ownerIds.map(Number).filter(n => !isNaN(n));

  const { data: affiliates, error: errAffiliates } = await supabase
    .from("affiliates")
    .select("shopify_customer_id, display_name, first_name, last_name, email")
    .in("shopify_customer_id", numericOwnerIds);

  if (errAffiliates) throw new Error(`affiliates: ${errAffiliates.message}`);

  const affiliateMap = {};
  for (const a of (affiliates || [])) {
    affiliateMap[String(a.shopify_customer_id)] = {
      name: a.display_name || `${a.first_name || ""} ${a.last_name || ""}`.trim() || "Especialista",
      email: a.email,
    };
  }

  // ── 5. Enviar un email por especialista ───────────────────────────────────
  console.log("\n✉️  Enviando emails...");
  let sent = 0, skipped = 0, failed = 0;
  const successfulOwnerSkus = {}; // owner_id → Set<sku>

  for (const ownerId of ownerIds) {
    const affiliate = affiliateMap[ownerId];
    if (!affiliate?.email) {
      console.log(`   ⚠️  Sin email para owner ${ownerId} — omitido`);
      skipped++;
      continue;
    }

    const products = Object.values(ownerProducts[ownerId]);
    const count = products.length;

    const subject = count === 1
      ? `🔔 "${products[0].title}" volvió a tener stock`
      : `🔔 ${count} productos de tus protocolos están disponibles de nuevo`;

    const html = buildRestockEmail({
      specialistName: affiliate.name,
      products,
    });

    if (DRY_RUN) {
      console.log(`   🧪 [DRY] Para ${affiliate.email} (${affiliate.name}): ${count} productos`);
      products.forEach(p => console.log(`      • ${p.title} (${p.cartCount} carts)`));
      successfulOwnerSkus[ownerId] = new Set(products.map(p => p.sku));
      sent++;
      continue;
    }

    try {
      const { error: errResend } = await resend.emails.send({
        from: "Vitahub Pro <noreply@vitahub.mx>",
        to:   affiliate.email,
        subject,
        html,
      });

      if (errResend) throw new Error(errResend.message);

      console.log(`   ✅ ${affiliate.email} — ${count} producto${count !== 1 ? "s" : ""}`);
      successfulOwnerSkus[ownerId] = new Set(products.map(p => p.sku));
      sent++;
    } catch (err) {
      console.error(`   ❌ ${affiliate.email}: ${err.message}`);
      failed++;
    }
  }

  // ── 6. Actualizar notified_at para los SKUs enviados con éxito ────────────
  const skusToMark = new Set();
  for (const skuSet of Object.values(successfulOwnerSkus)) {
    for (const sku of skuSet) skusToMark.add(sku);
  }

  if (skusToMark.size > 0 && !DRY_RUN) {
    await markAsNotified([...skusToMark], now);
  }

  // Resumen
  console.log(`\n📊 Resumen:`);
  console.log(`   ✅ Enviados:  ${sent}`);
  console.log(`   ⚠️  Omitidos: ${skipped} (sin email en affiliates)`);
  console.log(`   ❌ Fallidos:  ${failed}`);
  console.log(`   📌 SKUs marcados como notificados: ${skusToMark.size}`);
  console.log("\n" + "═".repeat(60));
  console.timeEnd("⏱  Tiempo total");
}

async function markAsNotified(skus, notifiedAt) {
  const BATCH = 200;
  for (let i = 0; i < skus.length; i += BATCH) {
    const batch = skus.slice(i, i + BATCH);
    const { error } = await supabase
      .from("product_stock_state")
      .update({ notified_at: notifiedAt })
      .in("sku", batch);

    if (error) console.error(`   ❌ Error actualizando notified_at (batch ${i / BATCH + 1}): ${error.message}`);
  }
}

main()
  .then(() => { process.exitCode = 0; })
  .catch(err => {
    console.error("\n💥 Error fatal:", err.message);
    process.exitCode = 1;
  });
