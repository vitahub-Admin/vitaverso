// scripts/test_restock_email.js
// Envía un email de prueba de "productos volvieron al stock" a un especialista concreto.
//
// Uso:
//   node --env-file=.env scripts/test_restock_email.js \
//     --specialist=SHOPIFY_CUSTOMER_ID \
//     --variants=VARIANT_ID1,VARIANT_ID2,...
//
// Ejemplo:
//   node --env-file=.env scripts/test_restock_email.js \
//     --specialist=8827280490817 \
//     --variants=43123456789,43987654321

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import "dotenv/config";

// ── Config desde args ─────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith("--"))
    .map(a => { const [k, v] = a.slice(2).split("="); return [k, v]; })
);

const SPECIALIST_ID = Number(args.specialist);
const VARIANT_IDS   = (args.variants || "").split(",").map(Number).filter(Boolean);

if (!SPECIALIST_ID || !VARIANT_IDS.length) {
  console.error("❌  Falta --specialist=ID y --variants=ID1,ID2,...");
  console.error("   Ejemplo:");
  console.error("   node --env-file=.env scripts/test_restock_email.js --specialist=8827280490817 --variants=43123456789");
  process.exitCode = 1;
  process.exit();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);
const resend   = new Resend(process.env.RESEND_API_KEY);

const GQL_URL   = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;
const GQL_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// ── Shopify: imagen + handle por product_id ───────────────────────────────────
async function fetchProductData(productIds) {
  if (!productIds.length) return {};
  const aliases = productIds.map((pid, i) =>
    `p${i}: node(id: "gid://shopify/Product/${pid}") { ... on Product { id handle featuredImage { url } } }`
  ).join("\n");

  const res  = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": GQL_TOKEN },
    body: JSON.stringify({ query: `{ ${aliases} }` }),
  });
  const json = await res.json();
  if (!json.data) return {};

  // { product_id: { image_url, handle } }
  const map = {};
  productIds.forEach((pid, i) => {
    const node = json.data[`p${i}`];
    if (node) map[pid] = {
      image_url: node.featuredImage?.url || null,
      handle:    node.handle || null,
    };
  });
  return map;
}

// ── Email HTML ────────────────────────────────────────────────────────────────
function buildRestockEmail({ specialistName, products }) {
  const productRows = products.map(p => {
    const precio    = Number(p.price || 0);
    const comPct    = Number(p.commission_percent || 0);
    const comAmount = (precio * comPct / 100).toFixed(2);
    const precioFmt = precio.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
    const comFmt    = Number(comAmount).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
    const productUrl = p.handle ? `https://vitahub.mx/products/${p.handle}` : null;

    const imgHtml = p.image_url
      ? `<img src="${p.image_url}" width="80" height="80" alt="${p.title}"
              style="border-radius:10px;object-fit:cover;display:block;">`
      : `<div style="width:80px;height:80px;background:#f3f4f6;border-radius:10px;"></div>`;

    const imgCell = productUrl
      ? `<a href="${productUrl}" style="display:block;">${imgHtml}</a>`
      : imgHtml;

    const titleHtml = productUrl
      ? `<a href="${productUrl}" style="font-size:15px;font-weight:700;color:#1b3f7a;text-decoration:none;line-height:1.3;">${p.title}</a>`
      : `<span style="font-size:15px;font-weight:700;color:#1b3f7a;line-height:1.3;">${p.title}</span>`;

    return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid #f0f0f0;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="88" valign="top" style="padding-right:16px;">${imgCell}</td>
            <td valign="middle">
              <p style="margin:0 0 4px;">${titleHtml}</p>
              ${p.brand ? `<p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">${p.brand}</p>` : ""}
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:12px;">
                    <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Precio</span><br>
                    <span style="font-size:16px;font-weight:700;color:#111827;">${precioFmt}</span>
                  </td>
                  <td>
                    <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Tu comisión</span><br>
                    <span style="display:inline-block;background:#d1fae5;color:#065f46;font-size:15px;font-weight:800;padding:2px 10px;border-radius:20px;">${comFmt}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Productos de vuelta en stock</title>
</head>
<body style="margin:0;padding:0;background:#F7F9FB;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F9FB;">
<tr><td align="center" style="padding:40px 20px;">
<table cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#1b3f7a;border-radius:16px 16px 0 0;padding:28px 36px 24px;">
    <p style="margin:0 0 6px;color:#7eb8c9;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">Vitahub Pro</p>
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.3;">
      🎉 Productos de vuelta en la tienda
    </h1>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="background:#ffffff;padding:28px 36px 8px;">
    <p style="margin:0 0 6px;font-size:15px;color:#374151;line-height:1.7;">
      Hola <strong>${specialistName}</strong>,
    </p>
    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;">
      Los siguientes productos volvieron a estar disponibles en la tienda.
      Ya puedes volver a incluirlos en tus prescripciones para tus pacientes.
    </p>
  </td></tr>

  <!-- Productos -->
  <tr><td style="background:#ffffff;padding:4px 36px 8px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      ${productRows}
    </table>
  </td></tr>

  <!-- CTA -->
  <tr><td style="background:#f0f7ff;border-top:2px solid #dbeafe;padding:24px 36px;text-align:center;border-radius:0 0 16px 16px;">
    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1b3f7a;">
      ¿Ya probaste nuestro armador de prescripciones?
    </p>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">
      Arma el protocolo ideal para cada paciente y compártelo en segundos
    </p>
    <a href="https://pro.vitahub.mx/mis-protocolos"
       style="display:inline-block;background:#1b3f7a;color:#ffffff;font-size:14px;font-weight:700;padding:13px 32px;border-radius:8px;text-decoration:none;">
      Ir al armador de prescripciones →
    </a>
    <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">
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
  console.log(`\n📬 TEST EMAIL — Especialista: ${SPECIALIST_ID}`);
  console.log(`   Variantes: ${VARIANT_IDS.join(", ")}`);
  console.log("═".repeat(60));

  // 1. Datos del especialista
  const { data: affiliate, error: errAff } = await supabase
    .from("affiliates")
    .select("shopify_customer_id, first_name, last_name, email")
    .eq("shopify_customer_id", SPECIALIST_ID)
    .maybeSingle();

  if (errAff) throw new Error(`affiliates: ${errAff.message}`);
  if (!affiliate) throw new Error(`No se encontró el especialista con ID ${SPECIALIST_ID}`);

  const name  = `${affiliate.first_name || ""} ${affiliate.last_name || ""}`.trim() || "Especialista";
  const email = affiliate.email;

  console.log(`\n👤 Especialista: ${name} <${email}>`);

  // 2. Datos de productos desde product_catalog
  const { data: catalogRows, error: errCat } = await supabase
    .from("product_catalog")
    .select("variant_id, product_id, title, brand, price")
    .in("variant_id", VARIANT_IDS);

  if (errCat) throw new Error(`product_catalog: ${errCat.message}`);
  if (!catalogRows?.length) throw new Error("No se encontraron variantes en product_catalog");

  console.log(`\n📦 Productos encontrados en catálogo: ${catalogRows.length}/${VARIANT_IDS.length}`);

  const productIds = [...new Set(catalogRows.map(r => r.product_id))];

  // 3. Imágenes + handles desde Shopify
  console.log("🖼️  Obteniendo imágenes y handles de Shopify...");
  const shopifyData = await fetchProductData(productIds);
  console.log(`   ${Object.keys(shopifyData).length} productos con datos de Shopify`);

  // 4. Comisiones desde product_variant_commissions
  const { data: commRows } = await supabase
    .from("product_variant_commissions")
    .select("variant_id, commission_percent")
    .in("variant_id", VARIANT_IDS)
    .eq("active", true);

  const commMap = Object.fromEntries((commRows || []).map(r => [r.variant_id, r.commission_percent]));
  console.log(`   Comisiones encontradas: ${Object.keys(commMap).length}/${VARIANT_IDS.length}`);

  // 5. Armar lista de productos para el email
  const products = catalogRows.map(r => ({
    title:              r.title || `Variante ${r.variant_id}`,
    brand:              r.brand || null,
    price:              r.price,
    commission_percent: commMap[r.variant_id] ?? null,
    image_url:          shopifyData[r.product_id]?.image_url || null,
    handle:             shopifyData[r.product_id]?.handle    || null,
  }));

  // Log de lo que se va a enviar
  console.log("\n📋 Contenido del email:");
  products.forEach(p => {
    const com = p.commission_percent != null
      ? `${p.commission_percent}% = $${(p.price * p.commission_percent / 100).toFixed(2)}`
      : "(sin comisión en tabla)";
    console.log(`   • ${p.title} — $${p.price} — comisión: ${com}${p.image_url ? " 🖼️" : " (sin imagen)"}${p.handle ? ` 🔗 /products/${p.handle}` : ""}`);
  });

  // 6. Enviar
  console.log(`\n✉️  Enviando a ${email}...`);
  const html = buildRestockEmail({ specialistName: name, products });

  const { error: errResend } = await resend.emails.send({
    from:    "Vitahub Pro <noreply@pro.vitahub.mx>",
    to:      email,
    subject: `🎉 ${products.length === 1 ? `"${products[0].title}" volvió` : `${products.length} productos volvieron`} al stock`,
    html,
  });

  if (errResend) throw new Error(`Resend: ${errResend.message}`);

  console.log(`\n✅ Email enviado a ${email}`);
  console.log("═".repeat(60));
}

main()
  .then(() => { process.exitCode = 0; })
  .catch(err => {
    console.error(`\n💥 ${err.message}`);
    process.exitCode = 1;
  });
