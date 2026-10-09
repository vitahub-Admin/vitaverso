// Stack de suplementos del cliente (app de clientes).
// Lo usan GET /api/customer-app/supplements y el cron de restock, así los dos
// calculan igual los días restantes.
//
// Modelo:
//   · supplement_tracking tiene UNA fila por (user_id, variante): el ciclo vigente.
//   · start_date + duration_days (días por frasco) × quantity (frascos) = end_date.
//   · Cada compra nueva de esa variante (posterior a last_order_at) suma frascos;
//     si llega después de que se terminó, arranca un ciclo nuevo desde esa compra.
//   · Las variantes compradas recientemente sin fila aparecen como "por configurar".
//
// Fechas: siempre días calendario de México (America/Mexico_City).

import { createClient } from "@supabase/supabase-js";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const STORE_URL = "https://vitahub.mx";
const PRO_URL = "https://pro.vitahub.mx";
const TZ = "America/Mexico_City";

// Variantes compradas hace más de esto y sin seguimiento no se sugieren
const SUGERIR_COMPRAS_DE_LOS_ULTIMOS_DIAS = 120;
const ORDENES_A_REVISAR = 10;

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Usuario de la app a partir del payload del JWT (null si ya no existe)
export async function getAppUser(userId) {
  const { data } = await supabase
    .from("customer_app_users")
    .select("id, email, first_name, last_name, phone, shopify_customer_id, specialist_shopify_id, push_token")
    .eq("id", userId)
    .maybeSingle();
  return data ?? null;
}

// ── Fechas (YYYY-MM-DD en hora de México) ─────────────────────────────────────

const fmtMx = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
});

export function mxDate(date = new Date()) {
  return fmtMx.format(new Date(date));
}

export function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diffDays(fromYmd, toYmd) {
  return Math.round((new Date(`${toYmd}T00:00:00Z`) - new Date(`${fromYmd}T00:00:00Z`)) / 86400000);
}

// ── Helpers de producto ───────────────────────────────────────────────────────

// Unidades contables en el título de la variante ("60 cápsulas"). ml/g no cuentan.
export function parseUnits(variantTitle) {
  const m = variantTitle?.match(
    /(\d+)\s*(cápsulas?|capsulas?|caps?\b|comprimidos?|gomitas?|gummies|softgels?|tabletas?|sobres?|unidades?|perlas?)/i
  );
  return m ? parseInt(m[1], 10) : null;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Momentos del armador → horario sugerido para el recordatorio
const MOMENTO_HORA = {
  "Mañana": "08:00",
  "Con desayuno": "08:30",
  "Mediodía": "13:00",
  "Con almuerzo": "14:00",
  "Tarde": "17:00",
  "Con cena": "20:00",
  "Noche": "21:00",
  "Antes de dormir": "22:30",
};

export function suggestedTimes(momentosList, dosesPerDay) {
  const fromMomentos = [...new Set(momentosList.map((m) => MOMENTO_HORA[m]).filter(Boolean))].sort();
  if (fromMomentos.length) return fromMomentos;
  const n = Math.min(Math.max(1, Math.round(dosesPerDay || 1)), 4);
  return {
    1: ["08:00"],
    2: ["08:00", "20:00"],
    3: ["08:00", "14:00", "20:00"],
    4: ["08:00", "13:00", "18:00", "22:00"],
  }[n];
}

export function buyUrl(handle) {
  return handle ? `${STORE_URL}/products/${handle}` : STORE_URL;
}

// ── Shopify ───────────────────────────────────────────────────────────────────

export async function shopifyAdmin(query, variables = {}) {
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    console.error("[customerSupplements] Shopify errors:", JSON.stringify(json.errors).slice(0, 500));
    throw new Error("Error consultando Shopify");
  }
  return json.data;
}

const VARIANT_FIELDS = `
  id title
  image { url }
  product { handle featuredImage { url } }
  duracion:       metafield(namespace: "custom", key: "duraci_n_del_producto") { value }
  tipo_dosis:     metafield(namespace: "custom", key: "tipo_dosis") { value }
  dosis:          metafield(namespace: "custom", key: "dosis") { value }
  total_unidades: metafield(namespace: "custom", key: "total_unidades") { value }
  total_dosis:    metafield(namespace: "custom", key: "total_dosis") { value }
`;

export function variantMeta(v) {
  if (!v) return {};
  const dosis = num(v.dosis?.value);
  const totalDosis = num(v.total_dosis?.value);
  return {
    handle: v.product?.handle ?? null,
    image: v.image?.url ?? v.product?.featuredImage?.url ?? null,
    tipoDosis: v.tipo_dosis?.value || null,
    dosis,
    // Unidades de toma por frasco (en tipo_dosis: cápsulas, gotas, medidas…).
    // total_dosis = porciones por frasco y dosis = unidades por porción.
    // OJO: total_unidades es el contenido físico (g, ml) y no sirve para esto.
    unitsPerBottle: totalDosis ? totalDosis * (dosis ?? 1) : parseUnits(v.title),
    metafieldDuration: num(v.duracion?.value),
  };
}

// Órdenes recientes (no canceladas) del cliente con lo necesario para el stack
async function fetchRecentOrders(shopifyCustomerId) {
  const data = await shopifyAdmin(
    `query stackOrders($id: ID!, $n: Int!) {
      customer(id: $id) {
        orders(first: $n, sortKey: CREATED_AT, reverse: true) {
          edges { node {
            id createdAt cancelledAt
            customAttributes { key value }
            lineItems(first: 30) { edges { node {
              title quantity
              variant { ${VARIANT_FIELDS} }
            } } }
          } }
        }
      }
    }`,
    { id: `gid://shopify/Customer/${shopifyCustomerId}`, n: ORDENES_A_REVISAR }
  );

  return (data?.customer?.orders?.edges ?? [])
    .map(({ node }) => node)
    .filter((o) => !o.cancelledAt)
    .map((o) => ({
      id: o.id.split("/").pop(),
      createdAt: o.createdAt,
      shareCart: o.customAttributes?.find((a) => a.key === "share_cart")?.value ?? null,
      items: o.lineItems.edges
        .map(({ node }) => node)
        .filter((li) => li.variant?.id)
        .map((li) => ({
          variantId: li.variant.id.split("/").pop(),
          title: li.title,
          variantTitle: li.variant.title ?? "",
          quantity: li.quantity ?? 1,
          meta: variantMeta(li.variant),
        })),
    }));
}

// ── Dosis desde la receta (sharecart) ─────────────────────────────────────────
// Dos formatos conviven:
//   · protocolos del armador: extra.dosis_map[variantId] = { dosis_amount, dosis_unit, momentos[], instruccion }
//   · carritos de la tienda:  extra.products_detail[].custom_fields = { dosis, momentos }
// Devuelve { [token]: { [variantId]: { amountPerToma, tomas, unit, momentosList, instruccion, unitsPerDay? } } }
async function loadPrescriptions(orders) {
  const tokens = [...new Set(orders.map((o) => o.shareCart).filter(Boolean))];

  // Respaldo: el webhook guarda share_cart en la tabla orders aunque el atributo no venga
  const sinToken = orders.filter((o) => !o.shareCart).map((o) => Number(o.id));
  if (sinToken.length) {
    const { data } = await supabase
      .from("orders")
      .select("order_id, share_cart")
      .in("order_id", sinToken)
      .not("share_cart", "is", null);
    for (const row of data ?? []) {
      const o = orders.find((x) => Number(x.id) === Number(row.order_id));
      if (o) {
        o.shareCart = row.share_cart;
        tokens.push(row.share_cart);
      }
    }
  }
  if (!tokens.length) return { byToken: {}, protocols: {} };

  const { data: carts } = await supabase
    .from("sharecarts")
    .select("token, extra")
    .in("token", [...new Set(tokens)]);

  const out = {};
  const protocols = {};
  for (const cart of carts ?? []) {
    if (cart.extra?.origen === "protocolo") {
      protocols[cart.token] = { name: cart.extra?.protocol_name || null };
    }
    const byVariant = {};
    const extra = cart.extra ?? {};

    for (const [vid, d] of Object.entries(extra.dosis_map ?? {})) {
      const momentosList = Array.isArray(d?.momentos) ? d.momentos : [];
      byVariant[String(vid)] = {
        amountPerToma: num(d?.dosis_amount) ?? 1,
        tomas: momentosList.length || 1,
        unit: d?.dosis_unit || null,
        momentosList,
        instruccion: d?.instruccion || null,
      };
    }

    for (const p of extra.products_detail ?? []) {
      const vid = String(p.variant_id);
      if (byVariant[vid]) continue;
      const dosis = num(parseFloat(p.custom_fields?.dosis));
      const momentosStr = p.custom_fields?.momentos || "";
      if (!dosis && !momentosStr) continue;
      byVariant[vid] = {
        unitsPerDay: dosis, // en carritos de tienda "dosis" ya es unidades al día
        unit: null,
        momentosList: momentosStr ? momentosStr.split(/\s*,\s*/).filter(Boolean) : [],
        instruccion: null,
      };
    }
    out[cart.token] = byVariant;
  }
  return { byToken: out, protocols };
}

// Unidades al día según la receta y el metafield de dosis de la variante
function unitsPerDayFromRx(rx, meta) {
  if (!rx) return null;
  if (rx.unitsPerDay) return rx.unitsPerDay;
  // En el armador "dosis_amount" son dosis; una dosis = meta.dosis unidades
  return rx.amountPerToma * (meta?.dosis ?? 1) * rx.tomas;
}

function perBottleDays(unitsPerDay, meta) {
  if (unitsPerDay && meta?.unitsPerBottle) {
    const d = Math.floor(meta.unitsPerBottle / unitsPerDay);
    if (d >= 1) return d;
  }
  return meta?.metafieldDuration ?? null;
}

// ── Ciclo: fecha de fin considerando recompras ────────────────────────────────

function computeCycle(row, purchases, perBottle) {
  let start = row.start_date;
  let quantity = row.quantity || 1;
  let end = perBottle ? addDays(start, perBottle * quantity) : row.end_date;
  let watermark = row.last_order_at ?? row.created_at;
  let orderId = row.order_id;

  if (perBottle) {
    for (const p of purchases) {
      if (watermark && new Date(p.createdAt) <= new Date(watermark)) continue;
      const pDate = mxDate(p.createdAt);
      if (pDate > end) {
        // Se le había terminado: ciclo nuevo desde la compra
        start = pDate;
        quantity = p.quantity;
        end = addDays(pDate, perBottle * p.quantity);
      } else {
        quantity += p.quantity;
        end = addDays(end, perBottle * p.quantity);
      }
      watermark = p.createdAt;
      orderId = p.orderId;
    }
  }
  return { start, quantity, end, watermark, orderId };
}

// ── Stack ─────────────────────────────────────────────────────────────────────

/**
 * @param {{ id: string, shopify_customer_id: number|null }} user  fila de customer_app_users
 * @param {{ persist?: boolean }} opts  persist: guarda end_date/quantity recalculados
 */
export async function buildStack(user, { persist = true } = {}) {
  const today = mxDate();

  const { data: rows, error } = await supabase
    .from("supplement_tracking")
    .select("*")
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);

  const trackingByVariant = Object.fromEntries((rows ?? []).map((r) => [String(r.shopify_variant_id), r]));

  // Compras por variante (ascendente) + la info más reciente de producto y receta
  const purchasesByVariant = {};
  const latestByVariant = {};
  const protocols = [];
  if (user.shopify_customer_id) {
    const orders = await fetchRecentOrders(user.shopify_customer_id);
    const { byToken: prescriptions, protocols: protocolCarts } = await loadPrescriptions(orders);

    // Recetas del armador que llegaron como pedido (más reciente primero): PDF descargable
    const seen = new Set();
    for (const order of orders) {
      const p = order.shareCart && protocolCarts[order.shareCart];
      if (!p || seen.has(order.shareCart)) continue;
      seen.add(order.shareCart);
      protocols.push({
        token: order.shareCart,
        name: p.name || "Protocolo de tu especialista",
        orderDate: order.createdAt,
        pdfUrl: `${PRO_URL}/api/protocolo-pdf?token=${encodeURIComponent(order.shareCart)}`,
      });
    }

    for (const order of [...orders].reverse()) {
      const rxByVariant = order.shareCart ? prescriptions[order.shareCart] ?? {} : {};
      for (const it of order.items) {
        (purchasesByVariant[it.variantId] ??= []).push({
          orderId: order.id, createdAt: order.createdAt, quantity: it.quantity,
        });
        const prev = latestByVariant[it.variantId];
        latestByVariant[it.variantId] = {
          ...it,
          orderId: order.id,
          orderDate: order.createdAt,
          // la receta más reciente que tenga dosis para esta variante
          rx: rxByVariant[it.variantId] ?? prev?.rx ?? null,
        };
      }
    }
  }

  const supplements = [];
  const updates = [];
  const variantIds = new Set([...Object.keys(trackingByVariant), ...Object.keys(latestByVariant)]);

  for (const vid of variantIds) {
    const row = trackingByVariant[vid] ?? null;
    const latest = latestByVariant[vid] ?? null;
    const purchases = purchasesByVariant[vid] ?? [];
    const lastPurchase = purchases[purchases.length - 1] ?? null;

    // Lo quitó del stack: solo vuelve si lo compró después de quitarlo
    const removed = row && !row.active;
    const reboughtAfterRemoval = removed && lastPurchase && new Date(lastPurchase.createdAt) > new Date(row.updated_at);
    if (removed && !reboughtAfterRemoval) continue;

    const tracked = row && row.active && row.start_date;

    // Sin seguimiento: solo sugerimos compras recientes
    if (!tracked && (!lastPurchase || diffDays(mxDate(lastPurchase.createdAt), today) > SUGERIR_COMPRAS_DE_LOS_ULTIMOS_DIAS)) {
      continue;
    }

    const meta = latest?.meta ?? {};
    const rx = latest?.rx ?? null;
    const rxUnitsPerDay = unitsPerDayFromRx(rx, meta);
    const dailyDose = (tracked ? num(row.daily_dose) : null) ?? rxUnitsPerDay ?? null;
    const doseUnit = meta.tipoDosis?.toLowerCase() || rx?.unit || null;
    const momentosList = rx?.momentosList ?? [];

    const base = {
      variantId: vid,
      productTitle: latest?.title ?? row?.product_title ?? "",
      variantTitle: latest?.variantTitle ?? row?.variant_title ?? "",
      productHandle: meta.handle ?? row?.product_handle ?? null,
      image: meta.image ?? null,
      buyUrl: buyUrl(meta.handle ?? row?.product_handle),
      orderId: latest?.orderId ?? row?.order_id ?? "manual",
      orderDate: latest?.orderDate ?? null,
      orderQuantity: lastPurchase?.quantity ?? 1,
      unitsPerBottle: meta.unitsPerBottle ?? null,
      dailyDose,
      doseUnit,
      instruccion: rx?.instruccion ?? null,
      momentos: momentosList.join(" · ") || null,
      momentosList,
      suggestedTimes: suggestedTimes(momentosList, rx ? rx.tomas : 1),
      source: latest ? "order" : "manual",
    };

    if (!tracked) {
      const perBottle = perBottleDays(dailyDose, meta);
      supplements.push({
        ...base,
        durationDays: perBottle ? perBottle * (lastPurchase?.quantity ?? 1) : null,
        perBottleDays: perBottle,
        quantity: lastPurchase?.quantity ?? 1,
        startDate: null, endDate: null, daysRemaining: null,
        reminderTimes: [], snoozedUntil: null,
        needsOnboarding: true,
      });
      continue;
    }

    // Con seguimiento: días por frasco = lo que dijo el cliente, o lo que da su dosis
    const perBottle = num(row.duration_days) ?? perBottleDays(dailyDose, meta);
    const cycle = computeCycle(row, purchases, perBottle);
    const daysRemaining = cycle.end ? Math.max(0, diffDays(today, cycle.end)) : null;

    const changed =
      cycle.end !== row.end_date ||
      cycle.quantity !== row.quantity ||
      cycle.start !== row.start_date ||
      (cycle.watermark && cycle.watermark !== row.last_order_at);
    if (changed) {
      const extended = cycle.end && row.end_date && cycle.end > row.end_date;
      updates.push({
        id: row.id,
        start_date: cycle.start,
        end_date: cycle.end,
        quantity: cycle.quantity,
        last_order_at: cycle.watermark,
        order_id: cycle.orderId,
        ...(extended ? { restock_notified_days: null, restock_notified_at: null, snoozed_until: null } : {}),
        updated_at: new Date().toISOString(),
      });
      Object.assign(row, updates[updates.length - 1]);
    }

    supplements.push({
      ...base,
      trackingId: row.id,
      productTitle: base.productTitle || row.product_title,
      perBottleDays: perBottle,
      quantity: cycle.quantity,
      durationDays: cycle.end ? diffDays(cycle.start, cycle.end) : null,
      startDate: cycle.start,
      endDate: cycle.end,
      daysRemaining,
      reminderTimes: row.reminder_times ?? [],
      snoozedUntil: row.snoozed_until,
      restockNotifiedDays: row.restock_notified_days,
      needsOnboarding: false,
    });
  }

  if (persist && updates.length) {
    await Promise.all(
      updates.map(({ id, ...fields }) => supabase.from("supplement_tracking").update(fields).eq("id", id))
    );
  }

  // Primero lo que se acaba antes; los por configurar al final
  supplements.sort((a, b) => {
    if (a.needsOnboarding !== b.needsOnboarding) return a.needsOnboarding ? 1 : -1;
    return (a.daysRemaining ?? 9999) - (b.daysRemaining ?? 9999);
  });

  return { supplements, protocols, today };
}
