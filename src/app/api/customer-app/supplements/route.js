// GET /api/customer-app/supplements
// Stack de suplementos del cliente: cruza orden + sharecart + metafields + tracking
import { NextResponse } from "next/server";
import { verifyCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { createClient } from "@supabase/supabase-js";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Extrae cantidad de cápsulas/ml del título de variante: "60 cápsulas" → 60
function parseCapsuleCount(variantTitle) {
  const match = variantTitle?.match(/(\d+)\s*(cápsulas?|caps?|ml|comprimidos?|gummies?|softgels?|tabletas?)/i);
  return match ? parseInt(match[1]) : null;
}

async function shopifyAdmin(query, variables = {}) {
  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-04/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  return res.json();
}

export async function GET(req) {
  const payload = verifyCustomerToken(req);
  if (!payload) return unauthorized();

  const { customerId } = payload;
  const numericCustomerId = Number(customerId);
  const gid = `gid://shopify/Customer/${customerId}`;

  try {
    // 1. Obtener órdenes del cliente con sharecart token y variant IDs
    const ordersData = await shopifyAdmin(
      `query getOrders($id: ID!) {
        customer(id: $id) {
          orders(first: 5, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                createdAt
                noteAttributes { name value }
                lineItems(first: 20) {
                  edges {
                    node {
                      title
                      quantity
                      variant {
                        id
                        title
                        duracion: metafield(namespace: "custom", key: "duraci_n_del_producto") {
                          value
                        }
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
    if (orders.length === 0) {
      return NextResponse.json({ ok: true, supplements: [] });
    }

    // Tomamos la orden más reciente con líneas de producto
    const latestOrder = orders[0].node;
    const orderId = latestOrder.id.split("/").pop();
    const sharecartToken = latestOrder.noteAttributes
      ?.find((a) => a.name === "shared-cart-id")?.value ?? null;

    // 2. Buscar sharecart en Supabase para obtener dosis
    let doseByVariantId = {};
    if (sharecartToken) {
      const { data: cart } = await supabase
        .from("sharecarts")
        .select("extra")
        .eq("token", sharecartToken)
        .maybeSingle();

      if (cart?.extra?.products_detail) {
        for (const p of cart.extra.products_detail) {
          const vid = String(p.variant_id);
          doseByVariantId[vid] = {
            dosis: p.custom_fields?.dosis ?? null,
            momentos: p.custom_fields?.momentos ?? null,
          };
        }
      }
    }

    // 3. Obtener tracking guardado de este cliente
    const { data: trackingRows } = await supabase
      .from("supplement_tracking")
      .select("*")
      .eq("shopify_customer_id", numericCustomerId);

    const trackingByVariant = {};
    for (const row of trackingRows ?? []) {
      trackingByVariant[String(row.shopify_variant_id)] = row;
    }

    // 4. Armar el stack de suplementos
    const supplements = latestOrder.lineItems.edges.map(({ node: item }) => {
      const variantId = item.variant?.id?.split("/").pop() ?? null;
      const variantTitle = item.variant?.title ?? "";
      const sharecartDose = variantId ? doseByVariantId[variantId] : null;
      const tracking = variantId ? trackingByVariant[variantId] : null;

      // Duración: metafield → tracking guardado → calcular desde variante + dosis
      const metafieldDuration = item.variant?.duracion?.value
        ? parseInt(item.variant.duracion.value)
        : null;

      const dailyDose = tracking?.daily_dose
        ?? (sharecartDose?.dosis ? parseFloat(sharecartDose.dosis) : null);

      const capsuleCount = parseCapsuleCount(variantTitle);
      const calculatedDuration =
        dailyDose && capsuleCount ? Math.floor(capsuleCount / dailyDose) : null;

      const durationDays =
        tracking?.duration_days ?? metafieldDuration ?? calculatedDuration ?? null;

      // Días restantes desde start_date
      let daysRemaining = null;
      const startDate = tracking?.start_date ?? null;
      if (startDate && durationDays) {
        const start = new Date(startDate);
        const today = new Date();
        const elapsed = Math.floor((today - start) / (1000 * 60 * 60 * 24));
        daysRemaining = Math.max(0, durationDays - elapsed);
      }

      return {
        variantId,
        productTitle: item.title,
        variantTitle,
        orderId,
        orderDate: latestOrder.createdAt,
        dailyDose,
        momentos: sharecartDose?.momentos ?? null,
        durationDays,
        startDate,
        daysRemaining,
        needsOnboarding: !startDate,
      };
    });

    return NextResponse.json({ ok: true, supplements });
  } catch (err) {
    console.error("customer-app/supplements error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}

// PATCH /api/customer-app/supplements
// El cliente confirma fecha de inicio (y opcionalmente dosis) de un suplemento
export async function PATCH(req) {
  const payload = verifyCustomerToken(req);
  if (!payload) return unauthorized();

  const { customerId } = payload;

  try {
    const { variantId, productTitle, variantTitle, orderId, startDate, dailyDose, durationDays } =
      await req.json();

    if (!variantId || !startDate) {
      return NextResponse.json({ ok: false, error: "variantId y startDate requeridos" }, { status: 400 });
    }

    await supabase.from("supplement_tracking").upsert(
      {
        shopify_customer_id: Number(customerId),
        shopify_variant_id: Number(variantId),
        product_title: productTitle,
        variant_title: variantTitle,
        order_id: orderId,
        start_date: startDate,
        daily_dose: dailyDose ?? null,
        duration_days: durationDays ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "shopify_customer_id,shopify_variant_id" }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("customer-app/supplements PATCH error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
