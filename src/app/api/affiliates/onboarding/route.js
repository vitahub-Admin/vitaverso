/**
 * GET /api/affiliates/onboarding
 *
 * Ruta de primeros pasos del afiliado. Devuelve los 5 hitos con su estado.
 *
 * Se calcula en vivo contra las señales reales en vez de guardarse en una
 * columna: un nivel persistido queda viejo apenas alguien completa un paso, y
 * una ruta que dice "completá tu perfil" a quien ya lo hizo pierde toda
 * credibilidad. Son cuatro consultas y una llamada a Shopify.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveCustomerId, unauthorized } from "@/lib/customerAppAuth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const GQL_URL   = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;
const GQL_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const MIN_PRODUCTOS_TIENDA = 5;

/** ¿La colección del afiliado tiene imagen y al menos N productos? */
async function tiendaLista(collectionId) {
  if (!collectionId) return false;
  try {
    const res = await fetch(GQL_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": GQL_TOKEN },
      body: JSON.stringify({
        query: `{
          node(id: "gid://shopify/Collection/${collectionId}") {
            ... on Collection { image { url } productsCount { count } }
          }
        }`,
      }),
    });
    const json = await res.json();
    const node = json?.data?.node;
    if (!node) return false;
    const productos = node.productsCount?.count ?? 0;
    return !!node.image?.url && productos >= MIN_PRODUCTOS_TIENDA;
  } catch {
    return false; // sin datos preferimos no marcarlo como hecho
  }
}

export async function GET(req) {
  try {
    const customerId = await resolveCustomerId(req);
    if (!customerId) return unauthorized();

    const { data: aff } = await supabase
      .from("affiliates")
      .select("clabe_interbancaria, shopify_collection_id, push_token, email_verified")
      .eq("shopify_customer_id", Number(customerId))
      .maybeSingle();

    const [tienda, { count: protocolos }, { count: comisiones }] = await Promise.all([
      tiendaLista(aff?.shopify_collection_id),

      // Un sharecart nacido del armador de protocolos
      supabase
        .from("sharecarts")
        .select("token", { count: "exact", head: true })
        .eq("owner_id", String(customerId))
        .filter("extra->>origen", "eq", "protocolo"),

      // Al menos un ingreso de puntos confirmado
      supabase
        .from("point_transactions_live")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", Number(customerId))
        .eq("direction", "IN")
        .eq("status", "confirmed"),
    ]);

    const pasos = [
      {
        id:    "perfil",
        label: "Completa tu perfil",
        hint:  "Necesitamos tu CLABE para poder depositarte",
        href:  "/mis-datos",
        done:  /^\d{18}$/.test(aff?.clabe_interbancaria || ""),
      },
      {
        id:    "tienda",
        label: "Personaliza tu tienda",
        hint:  `Una foto y al menos ${MIN_PRODUCTOS_TIENDA} productos`,
        href:  "/mi-tienda",
        done:  tienda,
      },
      {
        id:    "protocolo",
        label: "Comparte tu primer protocolo",
        hint:  "Arma una prescripción y envíala por WhatsApp",
        href:  "/armador-carritos",
        done:  (protocolos ?? 0) > 0,
      },
      {
        id:    "comision",
        label: "Gana tu primera comisión",
        hint:  "Cuando tu paciente compre, se acredita sola",
        href:  "/wallet",
        done:  (comisiones ?? 0) > 0,
      },
      {
        id:    "app",
        label: "Descarga la app",
        hint:  "Los retiros y las notificaciones van a ir por ahí",
        href:  "/wallet",
        done:  !!aff?.push_token || !!aff?.email_verified,
      },
    ];

    return NextResponse.json({
      ok:    true,
      nivel: pasos.filter(p => p.done).length,   // 0 a 5
      total: pasos.length,
      pasos,
    });

  } catch (err) {
    console.error("[onboarding]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
