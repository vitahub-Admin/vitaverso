// GET /api/customer-app/orders
// Últimas órdenes del cliente con productos e imágenes
import { NextResponse } from "next/server";
import { verifyCustomerToken, unauthorized } from "@/lib/customerAppAuth";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function GET(req) {
  const payload = verifyCustomerToken(req);
  if (!payload) return unauthorized();

  const { customerId } = payload;
  const gid = `gid://shopify/Customer/${customerId}`;

  try {
    const res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2024-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        },
        body: JSON.stringify({
          query: `query getCustomerOrders($id: ID!) {
            customer(id: $id) {
              orders(first: 10, sortKey: CREATED_AT, reverse: true) {
                edges {
                  node {
                    id
                    name
                    createdAt
                    financialStatus
                    totalPriceSet {
                      shopMoney { amount currencyCode }
                    }
                    noteAttributes {
                      name
                      value
                    }
                    lineItems(first: 20) {
                      edges {
                        node {
                          title
                          quantity
                          variant {
                            id
                            title
                            price { amount currencyCode }
                            image { url altText }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }`,
          variables: { id: gid },
        }),
      }
    );

    const data = await res.json();
    const rawOrders = data?.data?.customer?.orders?.edges ?? [];

    const orders = rawOrders.map(({ node }) => {
      const sharecartToken = node.noteAttributes
        ?.find((a) => a.name === "shared-cart-id")?.value ?? null;

      return {
        id: node.id.split("/").pop(),
        name: node.name,
        createdAt: node.createdAt,
        financialStatus: node.financialStatus,
        total: node.totalPriceSet?.shopMoney?.amount,
        currency: node.totalPriceSet?.shopMoney?.currencyCode,
        sharecartToken,
        lineItems: node.lineItems.edges.map(({ node: item }) => ({
          title: item.title,
          variantId: item.variant?.id?.split("/").pop() ?? null,
          variantTitle: item.variant?.title ?? "",
          quantity: item.quantity,
          price: item.variant?.price?.amount,
          image: item.variant?.image?.url ?? null,
        })),
      };
    });

    return NextResponse.json({ ok: true, orders });
  } catch (err) {
    console.error("customer-app/orders error:", err);
    return NextResponse.json(
      { ok: false, error: "Error del servidor" },
      { status: 500 }
    );
  }
}
