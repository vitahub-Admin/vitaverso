// POST /api/crons/sync-stock
// Sincroniza stock de Baselinker → product_stock_state.
// Disparado por n8n según schedule (diario ~6am México).
// Protegido con Authorization: Bearer CRON_SECRET

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — BL tiene 2 páginas + GQL

const BL_URL      = "https://api.baselinker.com/connector.php";
const BL_INV_ID   = 50176;
const BL_DELAY_MS = 700;

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
      "X-BLToken": process.env.BASELINKER_TOKEN,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const json = await res.json();
  if (json.status !== "SUCCESS") throw new Error(`BL ${method}: ${json.error_message}`);
  return json;
}

async function fetchAllStock() {
  const stockMap = {};
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
  return stockMap;
}

async function fetchSkuMap(productIds) {
  const skuMap = {};
  const BATCH = 1000;
  for (let i = 0; i < productIds.length; i += BATCH) {
    const res = await bl("getInventoryProductsData", {
      inventory_id: BL_INV_ID,
      products: productIds.slice(i, i + BATCH),
    });
    for (const [pid, p] of Object.entries(res.products || {})) {
      const variants = Object.values(p.variants || {});
      const sku = (variants.length > 0 ? variants[0].sku : null) || p.sku || null;
      if (sku) skuMap[Number(pid)] = sku;
    }
    if (i + BATCH < productIds.length) await sleep(BL_DELAY_MS);
  }
  return skuMap;
}

async function fetchVariantIds(skus) {
  const result = {};
  const BATCH = 200;
  for (let i = 0; i < skus.length; i += BATCH) {
    const { data, error } = await supabase
      .from("product_catalog").select("sku, variant_id").in("sku", skus.slice(i, i + BATCH));
    if (error) throw new Error(`product_catalog: ${error.message}`);
    for (const r of (data || [])) result[r.sku] = r.variant_id;
  }
  return result;
}

async function fetchCurrentStates(skus) {
  const result = {};
  const BATCH = 200;
  for (let i = 0; i < skus.length; i += BATCH) {
    const { data, error } = await supabase
      .from("product_stock_state")
      .select("sku, stock_quantity, in_stock, went_out_at, came_back_at")
      .in("sku", skus.slice(i, i + BATCH));
    if (error) throw new Error(`product_stock_state: ${error.message}`);
    for (const r of (data || [])) result[r.sku] = r;
  }
  return result;
}

export async function POST(req) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString();
  try {
    // 1. Stock de Baselinker
    const stockByPid = await fetchAllStock();

    // 2. SKUs de variantes
    const productIds = Object.keys(stockByPid).map(Number);
    const skuByPid   = await fetchSkuMap(productIds);

    const qtyBySku = {};
    for (const [pid, sku] of Object.entries(skuByPid)) {
      if (sku) qtyBySku[sku] = stockByPid[Number(pid)] ?? 0;
    }
    const allSkus = Object.keys(qtyBySku);

    // 3. variant_ids desde product_catalog
    const variantBySku = await fetchVariantIds(allSkus);

    // 4. Estado actual
    const currentStates = await fetchCurrentStates(allSkus);

    // 5. Calcular upserts
    const upserts = [];
    let turnedOn = 0, turnedOff = 0;

    for (const sku of allSkus) {
      const newQty     = qtyBySku[sku] ?? 0;
      const nowInStock = newQty > 0;
      const current    = currentStates[sku];
      const row = { sku, variant_id: variantBySku[sku] || null, stock_quantity: newQty, updated_at: now };

      if (current) {
        if (!current.in_stock && nowInStock)  { row.came_back_at = now; turnedOn++; }
        if (current.in_stock  && !nowInStock) { row.went_out_at  = now; turnedOff++; }
      }
      upserts.push(row);
    }

    // 6. Upsert en batches
    const BATCH = 500;
    let saved = 0, errors = 0;
    for (let i = 0; i < upserts.length; i += BATCH) {
      const { error } = await supabase
        .from("product_stock_state")
        .upsert(upserts.slice(i, i + BATCH), { onConflict: "sku" });
      if (error) { console.error("upsert error:", error.message); errors++; }
      else saved += Math.min(BATCH, upserts.length - i);
    }

    // 7. Pendientes de notificación
    const { count: pending } = await supabase
      .from("product_stock_state")
      .select("sku", { count: "exact", head: true })
      .not("came_back_at", "is", null)
      .or("notified_at.is.null,notified_at.lt.came_back_at");

    return NextResponse.json({
      success: true,
      skus_total:   allSkus.length,
      saved,
      errors,
      turned_on:    turnedOn,
      turned_off:   turnedOff,
      pending_notifications: pending ?? 0,
    });

  } catch (err) {
    console.error("[sync-stock]", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
