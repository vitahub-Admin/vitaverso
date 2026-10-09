// GET /api/customer-app/products?q=omega
// Busca productos en el catálogo de Shopify para agregar suplementos manualmente
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { variantMeta } from "@/lib/customerSupplements";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function GET(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json({ ok: true, products: [] });
  }

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
          query: `query searchProducts($query: String!) {
            products(first: 10, query: $query) {
              edges {
                node {
                  id
                  title
                  handle
                  variants(first: 5) {
                    edges {
                      node {
                        id
                        title
                        price
                        image { url }
                        product { handle featuredImage { url } }
                        duracion:       metafield(namespace: "custom", key: "duraci_n_del_producto") { value }
                        tipo_dosis:     metafield(namespace: "custom", key: "tipo_dosis") { value }
                        dosis:          metafield(namespace: "custom", key: "dosis") { value }
                        total_unidades: metafield(namespace: "custom", key: "total_unidades") { value }
                        total_dosis:    metafield(namespace: "custom", key: "total_dosis") { value }
                      }
                    }
                  }
                  images(first: 1) {
                    edges { node { url } }
                  }
                }
              }
            }
          }`,
          // Solo productos publicados (no borradores ni archivados)
          variables: { query: `${q} status:active` },
        }),
      }
    );

    const data = await res.json();
    const raw = data?.data?.products?.edges ?? [];

    const products = raw.map(({ node }) => ({
      id: node.id.split("/").pop(),
      title: node.title,
      handle: node.handle,
      image: node.images?.edges?.[0]?.node?.url ?? null,
      variants: node.variants.edges.map(({ node: v }) => {
        const meta = variantMeta(v);
        return {
          id: v.id.split("/").pop(),
          title: v.title,
          price: v.price,
          image: meta.image,
          durationDays: meta.metafieldDuration,
          unitsPerBottle: meta.unitsPerBottle,
          doseUnit: meta.tipoDosis?.toLowerCase() || null,
        };
      }),
    }));

    return NextResponse.json({ ok: true, products });
  } catch (err) {
    console.error("customer-app/products error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
