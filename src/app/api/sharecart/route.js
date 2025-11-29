import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";

// =============================
//  CORS CONFIG
// =============================
function withCors(response) {
  response.headers.set("Access-Control-Allow-Origin", "https://vitahub.mx");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// =============================
//  POST → Save sharecart
// =============================
export async function POST(req) {
  try {
    const body = await req.json();
    const { items, name, telefono, extra } = body;

    if (!items || !Array.isArray(items)) {
      return withCors(
        NextResponse.json(
          { ok: false, error: "Invalid payload" },
          { status: 400 }
        )
      );
    }

    // Token corto tipo "aJ38ksP2"
    const token = nanoid(10);

    const { data, error } = await supabase
      .from("sharecarts")
      .insert({
        token,
        items,
        name: name || null,
        telefono: telefono || null,
        extra: extra || {}
      })
      .select("token")
      .single();

    if (error) {
      console.error(error);
      return withCors(NextResponse.json({ ok: false }, { status: 500 }));
    }

    return withCors(
      NextResponse.json({
        ok: true,
        token: data.token,
        url: `https://vitahub.mx/cart?shared-cart-id=${data.token}`,
      })
    );

  } catch (err) {
    console.error(err);
    return withCors(NextResponse.json({ ok: false }, { status: 500 }));
  }
}

// =============================
//  GET → Retrieve one or all
// =============================
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("id");

// A: GET un carrito
if (token) {
  const { data, error } = await supabase
    .from("sharecarts")
    .select("*")
    .eq("token", token)
    .single();

  if (error || !data) {
    return withCors(
      NextResponse.json(
        { ok: false, error: "Not found" },
        { status: 404 }
      )
    );
  }

  // Transformar variant_id → id (Shopify lo necesita así)
  const transformedItems = (data.items || []).map(item => ({
    id: item.variant_id,        // Shopify lo consume como "id"
    quantity: item.quantity
  }));

  return withCors(
    NextResponse.json({
      ok: true,
      cart: {
        items: transformedItems,
        name: data.name,
        telefono: data.telefono,
        extra: data.extra,
        created_at: data.created_at,
        token: data.token
      }
    })
  );
}
    // B: GET todos
    const { data, error } = await supabase
      .from("sharecarts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return withCors(
        NextResponse.json(
          { ok: false, error: "DB error" },
          { status: 500 }
        )
      );
    }

    return withCors(NextResponse.json({ ok: true, list: data }));

  } catch (err) {
    console.error(err);
    return withCors(NextResponse.json({ ok: false }, { status: 500 }));
  }
}
