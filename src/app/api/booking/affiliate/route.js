// GET /api/booking/affiliate?slug=XXX  — perfil público (sin auth)
// PATCH /api/booking/affiliate          — actualizar perfil propio (con JWT)
// POST  /api/booking/affiliate          — crear perfil por primera vez (con JWT)
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveBookingAffiliate } from "@/lib/bookingAuth";

const CORS = {
  "Access-Control-Allow-Origin": "https://vitahub.mx",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");

  // Sin slug + con auth → devuelve el perfil del afiliado logueado (para el dashboard)
  if (!slug) {
    const { affiliate, error } = await resolveBookingAffiliate(req);
    if (error) return NextResponse.json({ error }, { status: 401 });
    if (!affiliate) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });
    return NextResponse.json(affiliate);
  }

  const { data, error } = await supabase
    .from("booking_affiliates")
    .select(`
      id, slug, display_name, bio, photo_url, specialty, timezone, is_active,
      booking_services (id, name, description, duration_minutes, price, currency)
    `)
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("booking_services.is_active", true)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  if (!data) return NextResponse.json({ error: "Afiliado no encontrado" }, { status: 404, headers: CORS });

  return NextResponse.json(data, { headers: CORS });
}

export async function POST(req) {
  const { payload, affiliate, error } = await resolveBookingAffiliate(req);
  if (error) return NextResponse.json({ error }, { status: 401 });
  if (affiliate) return NextResponse.json({ error: "Ya tiene perfil de booking" }, { status: 409 });

  const body = await req.json();
  const { bio, timezone } = body;

  // Traer datos del afiliado desde Supabase (nombre, profesión, collection_id)
  const { data: affiliateRow } = await supabase
    .from("affiliates")
    .select("first_name, last_name, profession, shopify_collection_id")
    .eq("shopify_customer_id", Number(payload.userId))
    .maybeSingle();

  if (!affiliateRow?.shopify_collection_id) {
    return NextResponse.json({ error: "El afiliado no tiene colección asignada en Shopify" }, { status: 400 });
  }

  // Traer handle e imagen de la colección via GraphQL (mismo patrón que el resto del app)
  const gqlRes = await fetch(
    `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
      },
      body: JSON.stringify({
        query: `{
          collection(id: "gid://shopify/Collection/${affiliateRow.shopify_collection_id}") {
            handle
            title
            image { src }
            presentacion: metafield(namespace: "custom", key: "presentacion") { value }
          }
        }`,
      }),
    }
  );
  const gqlData = await gqlRes.json();
  const collection = gqlData?.data?.collection;

  if (!collection) {
    return NextResponse.json({ error: "No se pudo obtener la colección de Shopify" }, { status: 500 });
  }

  const slug = collection.handle;
  const display_name = [affiliateRow.first_name, affiliateRow.last_name].filter(Boolean).join(" ");
  const specialty = affiliateRow.profession || null;
  const photo_url = collection.image?.src || null;

  const { data, error: insertError } = await supabase
    .from("booking_affiliates")
    .insert({
      shopify_customer_id: Number(payload.userId),
      slug,
      display_name,
      bio: bio || null,
      photo_url,
      specialty,
      timezone: timezone || "America/Mexico_City",
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Este afiliado ya tiene una página de booking" }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Activar el metafield en la colección de Shopify
  await syncBookingMetafield(affiliateRow.shopify_collection_id, true);

  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req) {
  const { payload, affiliate, error } = await resolveBookingAffiliate(req);
  if (error) return NextResponse.json({ error }, { status: 401 });
  if (!affiliate) return NextResponse.json({ error: "Perfil no encontrado" }, { status: 404 });

  const body = await req.json();
  const allowed = ["display_name", "bio", "photo_url", "specialty", "timezone", "is_active"];
  const updates = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  );

  const { data, error: updateError } = await supabase
    .from("booking_affiliates")
    .update(updates)
    .eq("id", affiliate.id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // Sincronizar metafield de Shopify cuando cambia is_active
  if ("is_active" in updates) {
    const { data: affiliateRow } = await supabase
      .from("affiliates")
      .select("shopify_collection_id")
      .eq("shopify_customer_id", Number(payload.userId))
      .maybeSingle();

    if (affiliateRow?.shopify_collection_id) {
      await syncBookingMetafield(affiliateRow.shopify_collection_id, updates.is_active);
    }
  }

  return NextResponse.json(data);
}

async function syncBookingMetafield(collectionId, isActive) {
  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key value }
        userErrors { field message }
      }
    }
  `;
  await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/2024-01/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({
      query: mutation,
      variables: {
        metafields: [{
          ownerId: `gid://shopify/Collection/${collectionId}`,
          namespace: "custom",
          key: "afiliado_booking",
          type: "boolean",
          value: isActive ? "true" : "false",
        }],
      },
    }),
  });
}
