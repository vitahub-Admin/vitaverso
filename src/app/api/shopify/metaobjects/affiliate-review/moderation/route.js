// src/app/api/shopify/metaobjects/affiliate-review/moderation/route.js

import { NextResponse } from "next/server";

const SHOPIFY_STORE        = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// ── GET: listar todos los draft ──────────────────────────────
export async function GET() {
  try {
    const query = `
      {
        metaobjects(type: "review_de_tienda_afiliado", first: 100) {
          edges {
            node {
              id
              handle
              updatedAt
              capabilities {
                publishable {
                  status
                }
              }
              fields {
                key
                value
              }
            }
          }
        }
      }
    `;

    const res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      }
    );

    const data = await res.json();
    const edges = data?.data?.metaobjects?.edges || [];

    // Parseamos los fields en un objeto clave:valor
    const reviews = edges.map(({ node }) => {
      const fields = {};
      node.fields.forEach(f => { fields[f.key] = f.value; });
      return {
        id:         node.id,
        handle:     node.handle,
        updatedAt:  node.updatedAt,
        status:     node.capabilities?.publishable?.status || "DRAFT",
        ...fields,
      };
    });

    return NextResponse.json({ success: true, reviews });
  } catch (err) {
    console.error("❌ Error listando reviews:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ── POST: cambiar status de un metaobject ────────────────────
export async function POST(req) {
  try {
    const { id, status } = await req.json();

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Faltan id o status." },
        { status: 400 }
      );
    }

    if (!["ACTIVE", "DRAFT"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "Status debe ser ACTIVE o DRAFT." },
        { status: 400 }
      );
    }

    const mutation = `
      mutation UpdateReviewStatus($id: ID!, $metaobject: MetaobjectUpdateInput!) {
        metaobjectUpdate(id: $id, metaobject: $metaobject) {
          metaobject {
            id
            capabilities {
              publishable {
                status
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      id,
      metaobject: {
        capabilities: {
          publishable: { status },
        },
      },
    };

    const res = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: mutation, variables }),
      }
    );

    const data = await res.json();
    const userErrors = data?.data?.metaobjectUpdate?.userErrors;

    if (userErrors?.length > 0) {
      return NextResponse.json(
        { success: false, error: userErrors[0].message },
        { status: 422 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("❌ Error actualizando review:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
