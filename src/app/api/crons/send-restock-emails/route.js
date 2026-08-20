// POST /api/crons/send-restock-emails
// Envía emails de restock a especialistas cuyos protocolos tienen productos vueltos a stock.
// Disparado por n8n (martes y viernes ~8am México).
// Protegido con Authorization: Bearer CRON_SECRET

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const runtime = "nodejs";
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const CUTOFF_DAYS = 90;

// ── Email template ────────────────────────────────────────────────────────────
function buildRestockEmail({ specialistName, products }) {
  const productRows = products.map(p => {
    const precio    = Number(p.price || 0);
    const comPct    = Number(p.commission_percent || 0);
    const comAmount = (precio * comPct / 100).toFixed(2);
    const precioFmt = precio.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
    const comFmt    = Number(comAmount).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
    const productUrl = p.handle ? `https://vitahub.mx/products/${p.handle}` : null;

    const imgHtml = p.image_url
      ? `<img src="${p.image_url}" width="80" height="80" alt="${p.title}" style="border-radius:10px;object-fit:cover;display:block;">`
      : `<div style="width:80px;height:80px;background:#f3f4f6;border-radius:10px;"></div>`;

    const imgCell    = productUrl ? `<a href="${productUrl}" style="display:block;">${imgHtml}</a>` : imgHtml;
    const titleHtml  = productUrl
      ? `<a href="${productUrl}" style="font-size:15px;font-weight:700;color:#1b3f7a;text-decoration:none;line-height:1.3;">${p.title}</a>`
      : `<span style="font-size:15px;font-weight:700;color:#1b3f7a;line-height:1.3;">${p.title}</span>`;

    return `
    <tr><td style="padding:16px 0;border-bottom:1px solid #f0f0f0;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="88" valign="top" style="padding-right:16px;">${imgCell}</td>
        <td valign="middle">
          <p style="margin:0 0 4px;">${titleHtml}</p>
          ${p.brand ? `<p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">${p.brand}</p>` : ""}
          <table cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="padding-right:12px;">
              <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Precio</span><br>
              <span style="font-size:16px;font-weight:700;color:#111827;">${precioFmt}</span>
            </td>
            <td>
              <span style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Tu comisión</span><br>
              <span style="display:inline-block;background:#d1fae5;color:#065f46;font-size:15px;font-weight:800;padding:2px 10px;border-radius:20px;">${comFmt}</span>
            </td>
          </tr></table>
        </td>
      </tr></table>
    </td></tr>`;
  }).join("");

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Productos de vuelta en stock</title></head>
<body style="margin:0;padding:0;background:#F7F9FB;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F7F9FB;">
<tr><td align="center" style="padding:40px 20px;">
<table cellpadding="0" cellspacing="0" border="0" style="max-width:580px;width:100%;">
  <tr><td style="background:#1b3f7a;border-radius:16px 16px 0 0;padding:28px 36px 24px;">
    <p style="margin:0 0 6px;color:#7eb8c9;font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;">Vitahub Pro</p>
    <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;line-height:1.3;">🎉 Productos de vuelta en la tienda</h1>
  </td></tr>
  <tr><td style="background:#ffffff;padding:28px 36px 8px;">
    <p style="margin:0 0 6px;font-size:15px;color:#374151;">Hola <strong>${specialistName}</strong>,</p>
    <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;">
      Los siguientes productos volvieron a estar disponibles en la tienda.
      Ya puedes volver a incluirlos en tus prescripciones para tus pacientes.
    </p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:4px 36px 8px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">${productRows}</table>
  </td></tr>
  <tr><td style="background:#f0f7ff;border-top:2px solid #dbeafe;padding:24px 36px;text-align:center;border-radius:0 0 16px 16px;">
    <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#1b3f7a;">¿Ya probaste nuestro armador de prescripciones?</p>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Arma el protocolo ideal para cada paciente y compártelo en segundos</p>
    <a href="https://pro.vitahub.mx/mis-protocolos"
       style="display:inline-block;background:#1b3f7a;color:#ffffff;font-size:14px;font-weight:700;padding:13px 32px;border-radius:8px;text-decoration:none;">
      Ir al armador de prescripciones →
    </a>
    <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">
      <a href="https://pro.vitahub.mx" style="color:#1E8FA8;text-decoration:none;">pro.vitahub.mx</a>
    </p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

// ── Shopify: imagen + handle por product_id ───────────────────────────────────
async function fetchProductData(productIds) {
  if (!productIds.length) return {};
  const aliases = productIds.map((pid, i) =>
    `p${i}: node(id: "gid://shopify/Product/${pid}") { ... on Product { id handle featuredImage { url } } }`
  ).join("\n");
  const res  = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN },
    body: JSON.stringify({ query: `{ ${aliases} }` }),
  });
  const json = await res.json();
  if (!json.data) return {};
  const map = {};
  productIds.forEach((pid, i) => {
    const node = json.data[`p${i}`];
    if (node) map[pid] = { image_url: node.featuredImage?.url || null, handle: node.handle || null };
  });
  return map;
}

export async function POST(req) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now    = new Date().toISOString();
  const cutoff = new Date(Date.now() - CUTOFF_DAYS * 24 * 3600 * 1000).toISOString();

  try {
    // 1. SKUs pendientes de notificación
    const { data: pending } = await supabase
      .from("product_stock_state")
      .select("sku, variant_id, stock_quantity")
      .not("came_back_at", "is", null)
      .or("notified_at.is.null,notified_at.lt.came_back_at")
      .gt("stock_quantity", 0);

    if (!pending?.length) return NextResponse.json({ success: true, sent: 0, message: "Sin pendientes" });

    const pendingWithVariant = pending.filter(p => p.variant_id);

    // 2. Sharecarts de los últimos 90 días (una sola query, filtrado en JS)
    const { data: allCarts } = await supabase
      .from("sharecarts").select("owner_id, items")
      .gte("created_at", cutoff).not("owner_id", "is", null);

    const variantOwnerCount = {};
    for (const cart of (allCarts || [])) {
      const items = Array.isArray(cart.items) ? cart.items : [];
      const oid   = String(cart.owner_id);
      for (const item of items) {
        const vid = item.variant_id != null ? String(item.variant_id) : null;
        if (!vid) continue;
        if (!variantOwnerCount[vid]) variantOwnerCount[vid] = {};
        variantOwnerCount[vid][oid] = (variantOwnerCount[vid][oid] || 0) + 1;
      }
    }

    const ownerProducts = {};
    const notifiedSkus  = new Set();
    for (const item of pendingWithVariant) {
      const ownerCount = variantOwnerCount[String(item.variant_id)] || {};
      for (const [oid, count] of Object.entries(ownerCount)) {
        if (!ownerProducts[oid]) ownerProducts[oid] = {};
        ownerProducts[oid][item.sku] = { sku: item.sku, variant_id: item.variant_id, title: null, cartCount: count };
        notifiedSkus.add(item.sku);
      }
    }

    const ownerIds = Object.keys(ownerProducts);
    if (!ownerIds.length) {
      // Marcar igual como notificados para no reintentar
      await markAsNotified([...notifiedSkus], now);
      return NextResponse.json({ success: true, sent: 0, message: "Sin especialistas afectados" });
    }

    // 3. Nombres de productos + imágenes + comisiones
    const allSkus = [...notifiedSkus];
    const BATCH = 200;
    const titleMap = {}, productIdMap = {};

    for (let i = 0; i < allSkus.length; i += BATCH) {
      const { data: rows } = await supabase
        .from("product_catalog").select("sku, title, brand, price, product_id").in("sku", allSkus.slice(i, i + BATCH));
      for (const r of (rows || [])) { titleMap[r.sku] = r; productIdMap[r.sku] = r.product_id; }
    }

    const allVariantIds = pendingWithVariant.map(p => p.variant_id);
    const { data: commRows } = await supabase
      .from("product_variant_commissions").select("variant_id, commission_percent")
      .in("variant_id", allVariantIds).eq("active", true);
    const commMap = Object.fromEntries((commRows || []).map(r => [r.variant_id, r.commission_percent]));

    const uniqueProductIds = [...new Set(Object.values(productIdMap).filter(Boolean))];
    const shopifyData = await fetchProductData(uniqueProductIds);

    // Enriquecer ownerProducts con títulos/imágenes
    for (const products of Object.values(ownerProducts)) {
      for (const p of Object.values(products)) {
        const cat = titleMap[p.sku] || {};
        const pid = productIdMap[p.sku];
        p.title             = cat.title  || p.sku;
        p.brand             = cat.brand  || null;
        p.price             = cat.price  || null;
        p.commission_percent = commMap[p.variant_id] ?? null;
        p.image_url         = shopifyData[pid]?.image_url || null;
        p.handle            = shopifyData[pid]?.handle    || null;
      }
    }

    // 4. Datos de especialistas
    const { data: affiliates } = await supabase
      .from("affiliates").select("shopify_customer_id, first_name, last_name, email")
      .in("shopify_customer_id", ownerIds.map(Number).filter(n => !isNaN(n)));

    const affMap = Object.fromEntries(
      (affiliates || []).map(a => [String(a.shopify_customer_id), a])
    );

    // 5. Enviar emails
    let sent = 0, skipped = 0, failed = 0;
    const successOwnerSkus = {};

    for (const ownerId of ownerIds) {
      const aff = affMap[ownerId];
      if (!aff?.email) { skipped++; continue; }

      const products = Object.values(ownerProducts[ownerId]);
      const name     = `${aff.first_name || ""} ${aff.last_name || ""}`.trim() || "Especialista";
      const subject  = products.length === 1
        ? `🎉 "${products[0].title}" volvió al stock`
        : `🎉 ${products.length} productos volvieron al stock`;

      try {
        const { error } = await resend.emails.send({
          from:    "Vitahub Pro <noreply@pro.vitahub.mx>",
          to:      aff.email,
          subject,
          html:    buildRestockEmail({ specialistName: name, products }),
        });
        if (error) throw new Error(error.message);
        successOwnerSkus[ownerId] = new Set(products.map(p => p.sku));
        sent++;
      } catch (err) {
        console.error(`[send-restock] ${aff.email}: ${err.message}`);
        failed++;
      }
    }

    // 6. Marcar notified_at
    const skusToMark = new Set();
    for (const s of Object.values(successOwnerSkus)) for (const sku of s) skusToMark.add(sku);
    if (skusToMark.size) await markAsNotified([...skusToMark], now);

    return NextResponse.json({ success: true, sent, skipped, failed, notified_skus: skusToMark.size });

  } catch (err) {
    console.error("[send-restock-emails]", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

async function markAsNotified(skus, notifiedAt) {
  const BATCH = 200;
  for (let i = 0; i < skus.length; i += BATCH) {
    await supabase.from("product_stock_state")
      .update({ notified_at: notifiedAt }).in("sku", skus.slice(i, i + BATCH));
  }
}
