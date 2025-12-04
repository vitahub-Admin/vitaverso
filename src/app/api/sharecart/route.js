import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";

// =============================
//  CORS CONFIG
// =============================
function withCors(response) {
  response.headers.set("Access-Control-Allow-Origin", "https://vitahub.mx");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, x-api-key"
  );
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// =============================
//  SECURITY → API KEY REQUIRED ONLY FOR "GET ALL"
// =============================
function checkApiKey(req) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== process.env.SHARECART_API_KEY) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  return null;
}

// =============================
//  POST → Save sharecart
// =============================
export async function POST(req) {
  try {
    const body = await req.json();
    const { owner_id, name, phone, items, location, extra } = body;

    if (!items || !Array.isArray(items)) {
      return withCors(
        NextResponse.json(
          { ok: false, error: "Invalid payload" },
          { status: 400 }
        )
      );
    }

    const token = nanoid(10);

    const { data, error } = await supabase
      .from("sharecarts")
      .insert({
        token,
        items,
        name: name || null,
        phone: phone || null,
        extra: extra || {},
        location: location || {},
        owner_id
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
        url: `https://vitahub.mx/cart?shared-cart-id=${data.token}`
      })
    );
  } catch (err) {
    console.error(err);
    return withCors(NextResponse.json({ ok: false }, { status: 500 }));
  }
}

// =============================
//  GET → Retrieve one or all sharecarts
// =============================
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("id");
    const createdAfter = searchParams.get("created_after");
    const updatedAfter = searchParams.get("updated_after"); // <--- added

    // A: GET un carrito (SIN protección)
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

      const transformedItems = (data.items || []).map((item) => ({
        id: item.variant_id,
        quantity: item.quantity,
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
            updated_at: data.updated_at,
            token: data.token,
          },
        })
      );
    }

    // B: GET todos (CON protección)
    const auth = checkApiKey(req);
    if (auth) return withCors(auth);

    // Build query
    let query = supabase.from("sharecarts").select("*");

    if (createdAfter) {
      query = query.gte("created_at", createdAfter);
    }

    if (updatedAfter) {
      query = query.gte("updated_at", updatedAfter); // 👈 esto hace el filtro
    }

    query = query.order("updated_at", { ascending: false });

    const { data, error } = await query;

    if (error) {
      return withCors(
        NextResponse.json({ ok: false, error: "DB error" }, { status: 500 })
      );
    }

    return withCors(NextResponse.json({ ok: true, list: data }));
  } catch (err) {
    console.error(err);
    return withCors(NextResponse.json({ ok: false }, { status: 500 }));
  }
}
