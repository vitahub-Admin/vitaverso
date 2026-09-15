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

    // El token se genera en memoria y viaja como atributo del carrito; el
    // sharecart se guarda recién cuando Shopify confirmó que el carrito existe.
    //
    // Antes se guardaba primero, y cada checkout rechazado (producto sin
    // publicar, sin stock) dejaba una fila huérfana que aparecía en Analytics y
    // en Protocolos compartidos como un protocolo enviado que nunca llegó.
    const token = nanoid(10);

    // 1. Crear cart en Shopify Storefront API
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

      // Shopify nombra la variante que falla por su gid, que al especialista no
      // le dice nada. Lo traducimos al nombre del producto: la causa típica es
      // un producto sin publicar en el canal Headless, y eso lo resuelve soporte
      // publicándolo — no el especialista quitándolo del protocolo.
      const variantIds = [...new Set(
        userErrors.flatMap(e => [...(e.message || "").matchAll(/ProductVariant\/(\d+)/g)].map(m => Number(m[1])))
      )];

      if (variantIds.length) {
        const { data: prods } = await supabase
          .from("product_catalog")
          .select("title")
          .in("variant_id", variantIds);

        const nombres = [...new Set((prods || []).map(p => p.title).filter(Boolean))];
        const error = nombres.length === 1
          ? `"${nombres[0]}" no está disponible por el momento. Comunícate con atención al cliente para resolverlo.`
          : nombres.length > 1
            ? `Estos productos no están disponibles por el momento: ${nombres.map(n => `"${n}"`).join(", ")}. Comunícate con atención al cliente para resolverlo.`
            : "Uno de los productos no está disponible por el momento. Comunícate con atención al cliente para resolverlo.";

        return NextResponse.json({ ok: false, error }, { status: 400 });
      }

      return NextResponse.json({ ok: false, error: userErrors[0].message }, { status: 400 });
    }

    const cart = sfData?.data?.cartCreate?.cart;
    const checkoutUrl = cart?.checkoutUrl;
    if (!checkoutUrl) {
      return NextResponse.json({ ok: false, error: "No se obtuvo checkoutUrl de Shopify" }, { status: 500 });
    }

    // 2. Guardar sharecart, ahora que el carrito existe.
    //
    // Si esto falla devolvemos error aunque el carrito ya esté creado: sin la
    // fila no hay email de prescripción ni seguimiento en Analytics. El carrito
    // de Shopify que queda sin usar no se ve en ningún lado y caduca solo.
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
