/**
 * GET /api/sharecart/restore?token=XXX
 *
 * Dado un token de sharecart, devuelve los items enriquecidos con data de Shopify
 * y la info del paciente — listos para pre-cargar el armador de carritos.
 */
import { NextResponse } from "next/server";
import { createClient }  from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const GQL_URL   = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;
const GQL_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function shopifyGql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": GQL_TOKEN },
    body:    JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join(" | "));
  return json.data;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ ok: false, error: "Token requerido" }, { status: 400 });
    }

    // 1. Obtener el sharecart de Supabase
    const { data: cart, error } = await supabase
      .from("sharecarts")
      .select("*")
      .eq("token", token)
      .single();

    if (error || !cart) {
      return NextResponse.json({ ok: false, error: "Carrito no encontrado" }, { status: 404 });
    }

    const items     = cart.items || [];
    const dosisMap  = cart.extra?.dosis_map  || {};
    const patInfo   = cart.extra?.patient_info || {};

    if (items.length === 0) {
      return NextResponse.json({
        ok: true, items: [],
        patientData: { nombre: cart.name || "", telefono: "" },
      });
    }

    // 2. Enriquecer desde Shopify — fetch por variant GIDs
    const gids = items.map(i => `gid://shopify/ProductVariant/${i.variant_id}`);

    let shopifyMap = {};
    try {
      const data = await shopifyGql(`
        query($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on ProductVariant {
              id
              title
              price
              product {
                id
                title
                featuredImage { url }
              }
            }
          }
        }
      `, { ids: gids });

      for (const node of data?.nodes ?? []) {
        if (!node?.id) continue;
        const vid = Number(node.id.replace("gid://shopify/ProductVariant/", ""));
        shopifyMap[vid] = {
          variant_title: node.title === "Default Title" ? null : node.title,
          price:         parseFloat(node.price || 0),
          product_id:    node.product?.id?.replace("gid://shopify/Product/", "") || null,
          title:         node.product?.title || "Producto",
          image:         node.product?.featuredImage?.url || null,
        };
      }
    } catch (shopifyErr) {
      console.warn("[sharecart/restore] Shopify fetch error:", shopifyErr.message);
      // Continuamos sin data de Shopify (items se devuelven con title genérico)
    }

    // 3. Armar items en el formato del armador de carritos
    const enrichedItems = items.map(item => {
      const vid      = Number(item.variant_id);
      const sh       = shopifyMap[vid] || {};
      // dosis_map puede estar guardado con string o number como clave
      const raw = dosisMap[String(vid)] || dosisMap[vid] || null;

      // Normalizar la dosage:
      // En Supabase se guarda como { dosis_amount, dosis_unit, momentos, acompanamiento, nota }
      // El armador espera        { amount, unit, momentos, acompanamiento, nota }
      // La `meta` (metafields de Shopify) nunca se persistió — el armador la re-fetcha al abrir
      // el detalle del producto; aquí dejamos meta: null para que lo haga en runtime.
      let dosage;
      if (raw) {
        dosage = {
          amount:         raw.dosis_amount    ?? raw.amount    ?? 1,
          unit:           raw.dosis_unit      ?? raw.unit      ?? "cápsula",
          momentos:       raw.momentos        ?? [],
          acompanamiento: raw.acompanamiento  ?? "",
          nota:           raw.nota            ?? "",
          // meta se fetcha en runtime desde variantMeta cuando el producto se abre
          meta:           null,
        };
      } else {
        dosage = { amount: 1, unit: "cápsula", momentos: [], acompanamiento: "", nota: "", meta: null };
      }

      return {
        variant_id:    vid,
        product_id:    sh.product_id   || null,
        title:         sh.title        || item.title || "Producto",
        variant_title: sh.variant_title || null,
        image:         sh.image         || null,
        price:         sh.price         || item.price || 0,
        quantity:      item.quantity    || 1,
        dosage,
      };
    });

    // 4. Extraer datos del paciente (quitar prefijo +521 si viene en el phone)
    const rawPhone = cart.phone || patInfo.telefono || "";
    const phone = rawPhone.replace(/^\+521/, "").replace(/\D/g, "").slice(0, 10);

    return NextResponse.json({
      ok: true,
      items: enrichedItems,
      patientData: {
        nombre:   patInfo.nombre || cart.name || "",
        telefono: phone,
      },
    });

  } catch (err) {
    console.error("[sharecart/restore]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
