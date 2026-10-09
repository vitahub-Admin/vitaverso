// GET /api/customer-app/orders
// Últimas órdenes del cliente con productos, estado de pago y de envío (guías de paquetería)
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { shopifyAdmin, buyUrl } from "@/lib/customerSupplements";

// Estado de envío que ve el cliente, del más avanzado al menos
function shippingStatus(order) {
  if (order.cancelledAt) return "cancelled";
  const states = (order.fulfillments ?? [])
    .map((f) => f.displayStatus)
    .filter((s) => s && s !== "CANCELED");
  if (!states.length) return order.displayFinancialStatus === "PENDING" ? "pending_payment" : "preparing";
  if (states.every((s) => s === "DELIVERED")) return "delivered";
  if (states.includes("OUT_FOR_DELIVERY")) return "out_for_delivery";
  if (states.includes("FAILURE")) return "problem";
  return "shipped";
}

export async function GET(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  const { shopifyCustomerId } = payload;
  // Cuenta sin Shopify vinculado: no tiene órdenes
  if (!shopifyCustomerId) return NextResponse.json({ ok: true, orders: [] });

  try {
    const data = await shopifyAdmin(
      `query customerOrders($id: ID!) {
        customer(id: $id) {
          orders(first: 15, sortKey: CREATED_AT, reverse: true) {
            edges { node {
              id name createdAt cancelledAt
              displayFinancialStatus displayFulfillmentStatus
              totalPriceSet { shopMoney { amount currencyCode } }
              fulfillments(first: 5) {
                displayStatus createdAt inTransitAt deliveredAt estimatedDeliveryAt
                trackingInfo(first: 3) { company number url }
              }
              lineItems(first: 30) { edges { node {
                title quantity
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

      return {
        id: node.id.split("/").pop(),
        name: node.name,
        createdAt: node.createdAt,
        financialStatus: (node.displayFinancialStatus ?? "").toLowerCase(),
        fulfillmentStatus: (node.displayFulfillmentStatus ?? "").toLowerCase(),
        shippingStatus: shippingStatus(node),
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
          };
        }),
      };
    });

    return NextResponse.json({ ok: true, orders });
  } catch (err) {
    console.error("customer-app/orders error:", err);
    return NextResponse.json({ ok: false, error: "No se pudieron cargar tus pedidos" }, { status: 500 });
  }
}
