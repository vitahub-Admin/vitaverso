import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";

const STOREFRONT_URL = `https://${process.env.SHOPIFY_STORE}/api/2025-01/graphql.json`;

export async function POST(req) {
  try {
    const body = await req.json();
    const { owner_id, name, phone, items, extra } = body;

    if (!items?.length) {
      return NextResponse.json({ ok: false, error: "Sin items" }, { status: 400 });
    }

    // 1. Guardar sharecart en Supabase para tracking
    const token = nanoid(10);
    const { error: dbError } = await supabase
      .from("sharecarts")
      .insert({
        token,
        items,
        name:     name     || null,
        phone:    phone    || null,
        extra:    { origen: "armador-checkout", ...(extra || {}) },
        location: {},
        owner_id,
      });

    if (dbError) {
      console.error("Supabase error:", dbError);
      return NextResponse.json({ ok: false, error: "Error guardando carrito" }, { status: 500 });
    }

    // 2. Crear cart en Shopify Storefront API
    const lines = items.map(i => ({
      merchandiseId: `gid://shopify/ProductVariant/${i.variant_id}`,
      quantity:      i.quantity || 1,
    }));

    const mutation = `
      mutation cartCreate($input: CartInput!) {
        cartCreate(input: $input) {
          cart {
            checkoutUrl
            id
            attributes { key value }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      input: {
        lines,
        attributes: [
          { key: "specialist_ref", value: String(owner_id || "") },
          { key: "share_cart",     value: token },
        ],
      },
    };

    const sfRes = await fetch(STOREFRONT_URL, {
      method:  "POST",
      headers: {
        "Content-Type":                      "application/json",
        "X-Shopify-Storefront-Access-Token": process.env.SHOPIFY_STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query: mutation, variables }),
    });

    const sfData = await sfRes.json();
    const userErrors = sfData?.data?.cartCreate?.userErrors || [];

    if (userErrors.length) {
      console.error("Shopify userErrors:", userErrors);
      return NextResponse.json({ ok: false, error: userErrors[0].message }, { status: 400 });
    }

    const cart = sfData?.data?.cartCreate?.cart;
    const checkoutUrl = cart?.checkoutUrl;
    if (!checkoutUrl) {
      return NextResponse.json({ ok: false, error: "No se obtuvo checkoutUrl de Shopify" }, { status: 500 });
    }

    console.log(`[sharecart/checkout] cart creado:`, {
      cartId:     cart.id,
      token,
      attributes: cart.attributes,
    });

    return NextResponse.json({ ok: true, token, checkoutUrl, debug: { cartId: cart.id, attributes: cart.attributes } });

  } catch (err) {
    console.error("Error en sharecart/checkout:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
