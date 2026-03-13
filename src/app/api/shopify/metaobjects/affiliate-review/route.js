// src/app/api/shopify/metaobjects/affiliate-review/route.js

import { NextResponse } from "next/server";

const SHOPIFY_STORE        = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function POST(req) {
  try {
    const { collection_handle, comment, affiliate_id } = await req.json();

    // Validaciones
    if (!collection_handle || !comment || !affiliate_id) {
      return NextResponse.json(
        { success: false, error: "Faltan campos obligatorios." },
        { status: 400 }
      );
    }

    if (comment.trim().length < 20) {
      return NextResponse.json(
        { success: false, error: "El comentario debe tener al menos 20 caracteres." },
        { status: 400 }
      );
    }

    const mutation = `
      mutation CreateAffiliateReview($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      metaobject: {
        type: "review_de_tienda_afiliado",
        fields: [
          { key: "handle_coll", value: collection_handle },
          { key: "comment",           value: comment.trim() },
          { key: "affiliate_id",      value: String(affiliate_id) },
        ],
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
    const userErrors = data?.data?.metaobjectCreate?.userErrors;

    if (userErrors?.length > 0) {
      console.error("Shopify userErrors:", userErrors);
      return NextResponse.json(
        { success: false, error: userErrors[0].message },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      metaobject: data?.data?.metaobjectCreate?.metaobject,
    });

  } catch (err) {
    console.error("❌ Error creando affiliate review:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}