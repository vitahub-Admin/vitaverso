// GET /api/customer-app/orders
// Últimas órdenes del cliente con productos, estado de pago y de envío (guías de paquetería)
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { shopifyAdmin, buyUrl, getAppUser, fetchVentasEfectivo } from "@/lib/customerSupplements";
import { enriquecer } from "@/lib/customerStore";

// Estado de envío que ve el cliente, del más avanzado al menos
function shippingStatus(order, entrega) {
  if (order.cancelledAt) return "cancelled";
  // Venta de consultorio 100% entregada en mano: nunca tiene envío, ya la tiene el paciente
  if (entrega === "mano") return order.displayFinancialStatus === "PENDING" ? "pending_payment" : "consultorio";
  const states = (order.fulfillments ?? [])
    .map((f) => f.displayStatus)
    .filter((s) => s && s !== "CANCELED");
  if (!states.length) return order.displayFinancialStatus === "PENDING" ? "pending_payment" : "preparing";
  if (states.every((s) => s === "DELIVERED")) return "delivered";
  if (states.includes("OUT_FOR_DELIVERY")) return "out_for_delivery";
  if (states.includes("FAILURE")) return "problem";
  return "shipped";
}

// Compras pagadas en efectivo en el consultorio: no existen en Shopify (el profesional
// las paga después, todas juntas). Para el paciente son pedidos ya entregados en mano.
async function comprasEnEfectivo(email) {
  const ventas = await fetchVentasEfectivo(email);
  if (!ventas.length) return [];
  // Handle del producto para "Volver a pedir" (si Shopify falla, sin ese botón)
  const vivos = await enriquecer(ventas.flatMap((v) => (v.items ?? []).map((i) => String(i.variant_id)))).catch(() => ({}));
  return ventas.map((v) => ({
    id: `efectivo_${v.id}`,
    name: "en consultorio",
    createdAt: v.created_at,
    financialStatus: "paid",
    fulfillmentStatus: "fulfilled",
    shippingStatus: "consultorio",
    consultorio: true,
    shippedAt: null,
    deliveredAt: v.created_at,
    estimatedDeliveryAt: null,
    tracking: [],
    // Sin montos: el profesional puede cobrarle otro precio en su consultorio, así que
    // el total y los precios de Vitahub no son lo que pagó el paciente
    total: null,
    currency: "MXN",
    lineItems: (v.items ?? []).map((i) => {
      const handle = vivos[String(i.variant_id)]?.handle ?? null;
      return {
        title: i.title,
        variantId: i.variant_id != null ? String(i.variant_id) : null,
        variantTitle: i.variant_title ?? "",
        quantity: i.quantity,
        price: null,
        image: i.image ?? vivos[String(i.variant_id)]?.image ?? null,
        productHandle: handle,
        buyUrl: handle ? buyUrl(handle) : null,
        enConsultorio: true,
      };
    }),
  }));
}

export async function GET(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    // Del usuario en la base, no del JWT: la cuenta puede vincularse después del login
    const user = await getAppUser(payload.userId);
    if (!user) return unauthorized();
    const shopifyCustomerId = user.shopify_customer_id;
    const efectivo = await comprasEnEfectivo(user.email);
    // Cuenta sin compras en Shopify: solo lo que pagó en efectivo en un consultorio
    if (!shopifyCustomerId) return NextResponse.json({ ok: true, orders: efectivo });

    const data = await shopifyAdmin(
      `query customerOrders($id: ID!) {
        customer(id: $id) {
          orders(first: 15, sortKey: CREATED_AT, reverse: true) {
            edges { node {
              id name createdAt cancelledAt
              displayFinancialStatus displayFulfillmentStatus
              customAttributes { key value }
              totalPriceSet { shopMoney { amount currencyCode } }
              fulfillments(first: 5) {
                displayStatus createdAt inTransitAt deliveredAt estimatedDeliveryAt
                trackingInfo(first: 3) { company number url }
              }
              lineItems(first: 30) { edges { node {
                title quantity requiresShipping
                customAttributes { key value }
                image { url }
                originalUnitPriceSet { shopMoney { amount } }
                variant { id title product { handle } }
              } } }
            } }
          }
        }
      }`,
      { id: `gid://shopify/Customer/${shopifyCustomerId}` }
    );

    const orders = (data?.customer?.orders?.edges ?? []).map(({ node }) => {
      const tracking = (node.fulfillments ?? []).flatMap((f) =>
        (f.trackingInfo ?? [])
          .filter((t) => t.number || t.url)
          .map((t) => ({ company: t.company ?? null, number: t.number ?? null, url: t.url ?? null }))
      );
      const lastFulfillment = (node.fulfillments ?? [])[0] ?? null;
      // Ventas de consultorio (cobradas por borrador de Shopify): entrega mano | mixta | envio
      const attr = (k) => node.customAttributes?.find((a) => a.key === k)?.value ?? null;
      const entrega = attr("local_order_id") ? attr("entrega") : null;

      return {
        id: node.id.split("/").pop(),
        name: node.name,
        createdAt: node.createdAt,
        financialStatus: (node.displayFinancialStatus ?? "").toLowerCase(),
        fulfillmentStatus: (node.displayFulfillmentStatus ?? "").toLowerCase(),
        shippingStatus: shippingStatus(node, entrega),
        consultorio: entrega === "mano" || entrega === "mixta",
        shippedAt: lastFulfillment?.inTransitAt ?? lastFulfillment?.createdAt ?? null,
        deliveredAt: lastFulfillment?.deliveredAt ?? null,
        estimatedDeliveryAt: lastFulfillment?.estimatedDeliveryAt ?? null,
        tracking,
        total: node.totalPriceSet?.shopMoney?.amount ?? null,
        currency: node.totalPriceSet?.shopMoney?.currencyCode ?? "MXN",
        lineItems: node.lineItems.edges.map(({ node: item }) => {
          const handle = item.variant?.product?.handle ?? null;
          return {
            title: item.title,
            variantId: item.variant?.id?.split("/").pop() ?? null,
            variantTitle: item.variant?.title ?? "",
            quantity: item.quantity,
            price: item.originalUnitPriceSet?.shopMoney?.amount ?? null,
            image: item.image?.url ?? null,
            productHandle: handle,
            buyUrl: handle ? buyUrl(handle) : null,
            // Línea libre de una venta de consultorio: el paciente ya se la llevó
            enConsultorio:
              item.requiresShipping === false &&
              (item.customAttributes ?? []).some((a) => a.key === "ENTREGA"),
          };
        }),
      };
    });

    const todas = [...orders, ...efectivo].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return NextResponse.json({ ok: true, orders: todas });
  } catch (err) {
    console.error("customer-app/orders error:", err);
    return NextResponse.json({ ok: false, error: "No se pudieron cargar tus pedidos" }, { status: 500 });
  }
}
