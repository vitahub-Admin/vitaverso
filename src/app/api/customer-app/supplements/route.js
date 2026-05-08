// GET /api/customer-app/supplements
// Stack de suplementos: cruza orden + sharecart + metafields + tracking manual
import { NextResponse } from "next/server";
import { verifyCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { createClient } from "@supabase/supabase-js";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function parseCapsuleCount(variantTitle) {
  const match = variantTitle?.match(/(\d+)\s*(cápsulas?|caps?|ml|comprimidos?|gummies?|softgels?|tabletas?)/i);
  return match ? parseInt(match[1]) : null;
}

async function shopifyAdmin(query, variables = {}) {
  const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2024-04/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

function buildSupplementEntry({ variantId, title, variantTitle, orderId, orderDate, sharecartDose, tracking, metafieldDuration }) {
  const dailyDose = tracking?.daily_dose
    ?? (sharecartDose?.dosis ? parseFloat(sharecartDose.dosis) : null);

  const capsuleCount = parseCapsuleCount(variantTitle);
  const calculatedDuration = dailyDose && capsuleCount ? Math.floor(capsuleCount / dailyDose) : null;
  const durationDays = tracking?.duration_days ?? metafieldDuration ?? calculatedDuration ?? null;

  const startDate = tracking?.start_date ?? null;
  let daysRemaining = null;
  if (startDate && durationDays) {
    const elapsed = Math.floor((Date.now() - new Date(startDate)) / (1000 * 60 * 60 * 24));
    daysRemaining = Math.max(0, durationDays - elapsed);
  }

  return {
    variantId,
    productTitle: title,
    variantTitle,
    orderId,
    orderDate,
    dailyDose,
    momentos: sharecartDose?.momentos ?? null,
    durationDays,
    startDate,
    daysRemaining,
    needsOnboarding: !startDate,
    takenToday: false,
  };
}

export async function GET(req) {
  const payload = verifyCustomerToken(req);
  if (!payload) return unauthorized();

  const { shopifyCustomerId, userId } = payload;
  const numericCustomerId = Number(shopifyCustomerId);

  try {
    // Siempre traemos el tracking guardado de este cliente
    const { data: trackingRows } = await supabase
      .from("supplement_tracking")
      .select("*")
      .eq("shopify_customer_id", numericCustomerId);

    const trackingByVariant = {};
    for (const row of trackingRows ?? []) {
      const key = String(row.shopify_variant_id);
      // Quedarse con el tracking más reciente por variante
      if (!trackingByVariant[key] || row.updated_at > trackingByVariant[key].updated_at) {
        trackingByVariant[key] = row;
      }
    }

    const supplements = [];
    const variantIdsSeen = new Set();

    // 1. Suplementos desde órdenes de Shopify (solo si tiene shopifyCustomerId)
    if (shopifyCustomerId) {
      const gid = `gid://shopify/Customer/${shopifyCustomerId}`;
      const ordersData = await shopifyAdmin(
        `query getOrders($id: ID!) {
          customer(id: $id) {
            orders(first: 5, sortKey: CREATED_AT, reverse: true) {
              edges {
                node {
                  id createdAt
                  noteAttributes { name value }
                  lineItems(first: 20) {
                    edges {
                      node {
                        title
                        variant {
                          id title
                          duracion: metafield(namespace: "custom", key: "duraci_n_del_producto") { value }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
        { id: gid }
      );

      const orders = ordersData?.data?.customer?.orders?.edges ?? [];

      if (orders.length > 0) {
        const latestOrder = orders[0].node;
        const orderId = latestOrder.id.split("/").pop();
        const sharecartToken = latestOrder.noteAttributes?.find((a) => a.name === "shared-cart-id")?.value ?? null;

        let doseByVariantId = {};
        if (sharecartToken) {
          const { data: cart } = await supabase
            .from("sharecarts")
            .select("extra")
            .eq("token", sharecartToken)
            .maybeSingle();

          if (cart?.extra?.products_detail) {
            for (const p of cart.extra.products_detail) {
              doseByVariantId[String(p.variant_id)] = {
                dosis: p.custom_fields?.dosis ?? null,
                momentos: p.custom_fields?.momentos ?? null,
              };
            }
          }
        }

        for (const { node: item } of latestOrder.lineItems.edges) {
          const variantId = item.variant?.id?.split("/").pop() ?? null;
          if (!variantId) continue;
          variantIdsSeen.add(variantId);

          supplements.push(buildSupplementEntry({
            variantId,
            title: item.title,
            variantTitle: item.variant?.title ?? "",
            orderId,
            orderDate: latestOrder.createdAt,
            sharecartDose: doseByVariantId[variantId] ?? null,
            tracking: trackingByVariant[variantId] ?? null,
            metafieldDuration: item.variant?.duracion?.value ? parseInt(item.variant.duracion.value) : null,
          }));
        }
      }
    }

    // 2. Suplementos agregados manualmente (order_id = 'manual') no presentes en órdenes
    for (const row of trackingRows ?? []) {
      const vid = String(row.shopify_variant_id);
      if (variantIdsSeen.has(vid)) continue; // ya está incluido desde la orden
      if (row.order_id !== "manual") continue;

      supplements.push(buildSupplementEntry({
        variantId: vid,
        title: row.product_title,
        variantTitle: row.variant_title,
        orderId: "manual",
        orderDate: null,
        sharecartDose: null,
        tracking: row,
        metafieldDuration: null,
      }));
    }

    return NextResponse.json({ ok: true, supplements });
  } catch (err) {
    console.error("customer-app/supplements error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}

// PATCH /api/customer-app/supplements
export async function PATCH(req) {
  const payload = verifyCustomerToken(req);
  if (!payload) return unauthorized();

  const { shopifyCustomerId } = payload;

  try {
    const { variantId, productTitle, variantTitle, orderId, startDate, dailyDose, durationDays } =
      await req.json();

    if (!variantId || !startDate) {
      return NextResponse.json({ ok: false, error: "variantId y startDate requeridos" }, { status: 400 });
    }

    const resolvedOrderId = orderId ?? "manual";

    const { error } = await supabase.from("supplement_tracking").upsert(
      {
        shopify_customer_id: Number(shopifyCustomerId),
        shopify_variant_id: Number(variantId),
        product_title: productTitle,
        variant_title: variantTitle,
        order_id: resolvedOrderId,
        start_date: startDate,
        daily_dose: dailyDose ? Number(dailyDose) : null,
        duration_days: durationDays ? Number(durationDays) : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shopify_customer_id,shopify_variant_id,order_id" }
    );

    if (error) {
      console.error("supplement upsert error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("customer-app/supplements PATCH error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
