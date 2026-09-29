import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";
import { construirPermalink, validarVariantes } from "@/lib/permalinkCarrito";

const STOREFRONT_URL = `https://${process.env.SHOPIFY_STORE}/api/2025-01/graphql.json`;

// Cómo se arma el link que recibe el paciente:
//   "permalink"  → /cart/<variante>:<cantidad>?attributes[...]  (por defecto)
//   "storefront" → carrito creado con la Storefront API, el método viejo
//
// El permalink no caduca y no depende de que Shopify responda al armar el
// protocolo. Se deja el método viejo detrás de esta variable para poder
// volver atrás sin tocar código si aparece algo raro en producción.
const MODO = process.env.CHECKOUT_MODE === "storefront" ? "storefront" : "permalink";

// ── Método viejo: carrito creado con la Storefront API ───────────────────────
async function crearCarritoStorefront({ items, attributes }) {
  const lines = items.map(i => ({
    merchandiseId: `gid://shopify/ProductVariant/${i.variant_id}`,
    quantity:      i.quantity || 1,
  }));

  const mutation = `
    mutation cartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
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
      attributes: Object.entries(attributes).map(([key, value]) => ({ key, value: String(value) })),
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

  const sfData     = await sfRes.json();
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

      return { ok: false, error };
    }

    return { ok: false, error: userErrors[0].message };
  }

  const cart = sfData?.data?.cartCreate?.cart;
  if (!cart?.checkoutUrl) {
    return { ok: false, error: "No se obtuvo checkoutUrl de Shopify" };
  }

  return { ok: true, checkoutUrl: cart.checkoutUrl, debug: { cartId: cart.id, attributes: cart.attributes } };
}

// ── Método nuevo: permalink ──────────────────────────────────────────────────
async function crearPermalink({ items, attributes }) {
  // El permalink no protesta: una variante agotada la descarta en silencio y
  // una inexistente deja el carrito vacío. Por eso se valida antes.
  const { problemas } = await validarVariantes(items.map(i => i.variant_id));

  if (problemas.length) {
    const nombrar = p => `"${p.title || p.variant_id}" (${p.motivo})`;
    const error = problemas.length === 1
      ? `${nombrar(problemas[0])}. Quítalo del protocolo o comunícate con atención al cliente.`
      : `Estos productos no se pueden comprar: ${problemas.map(nombrar).join(", ")}. Quítalos del protocolo o comunícate con atención al cliente.`;
    return { ok: false, error };
  }

  const checkoutUrl = construirPermalink({ items, attributes });
  if (!checkoutUrl) return { ok: false, error: "No se pudo armar el link del carrito" };

  return { ok: true, checkoutUrl, debug: { modo: "permalink", attributes } };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { owner_id, name, phone, items, extra } = body;

    if (!items?.length) {
      return NextResponse.json({ ok: false, error: "Sin items" }, { status: 400 });
    }

    // El token se genera en memoria y viaja como atributo del carrito; el
    // sharecart se guarda recién cuando sabemos que el link sirve.
    //
    // Antes se guardaba primero, y cada checkout rechazado (producto sin
    // publicar, sin stock) dejaba una fila huérfana que aparecía en Analytics y
    // en Protocolos compartidos como un protocolo enviado que nunca llegó.
    const token = nanoid(10);

    const attributes = {
      specialist_ref: String(owner_id || ""),
      share_cart:     token,
    };

    const r = MODO === "storefront"
      ? await crearCarritoStorefront({ items, attributes })
      : await crearPermalink({ items, attributes });

    if (!r.ok) {
      return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    }

    // Guardar el sharecart, ahora que el link sirve.
    //
    // Si esto falla devolvemos error aunque el link exista: sin la fila no hay
    // email de prescripción ni seguimiento en Analytics.
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

    console.log(`[sharecart/checkout] link creado (${MODO}):`, { token, ...r.debug });

    return NextResponse.json({ ok: true, token, checkoutUrl: r.checkoutUrl, modo: MODO, debug: r.debug });

  } catch (err) {
    console.error("Error en sharecart/checkout:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
