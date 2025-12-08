import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";

// =============================
//  CORS CONFIG
// =============================
function withCors(response) {
  // Permitir localhost en desarrollo, vitahub.mx en producción
  const allowedOrigin = process.env.NODE_ENV === 'development' 
    ? "http://localhost:3000"
    : "https://vitahub.mx";
  
  response.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, x-api-key, Cookie"
  );
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

// =============================
//  OPTIONS handler para preflight requests
// =============================
export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// =============================
//  SECURITY → API KEY REQUIRED ONLY FOR "GET ALL"
// =============================
function checkApiKey(req) {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey !== process.env.SHARECART_API_KEY) {
    return withCors(new NextResponse("Unauthorized", { status: 401 }));
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
    const updatedAfter = searchParams.get("updated_after");

    const customerId = req.cookies.get("customerId")?.value;

    // ============================================================
    // 1️⃣ GET por token (público)
    // ============================================================
    if (token) {
      const { data, error } = await supabase
        .from("sharecarts")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !data) {
        return withCors(
          NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
        );
      }

      return withCors(
        NextResponse.json({
          ok: true,
          cart: {
            items: (data.items || []).map((item) => ({
              id: item.variant_id,
              quantity: item.quantity,
            })),
            name: data.name,
            phone: data.phone,
            extra: data.extra,
            created_at: data.created_at,
            updated_at: data.updated_at,
            token: data.token,
          },
        })
      );
    }

    // ============================================================
    // 2️⃣ GET solo carritos del usuario (customerId presente)
    // ============================================================
    if (customerId) {
      const { data, error } = await supabase
        .from("sharecarts")
        .select("*")
        .eq("owner_id", customerId)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error(error);
        return withCors(
          NextResponse.json({ ok: false, error: "DB error" }, { status: 500 })
        );
      }

      return withCors(
        NextResponse.json({
          ok: true,
          carts: data,
        })
      );
    }

    // ============================================================
    // 3️⃣ GET todos (requiere x-api-key)
    // ============================================================
    const auth = checkApiKey(req);
    if (auth) return withCors(auth);

    let query = supabase.from("sharecarts").select("*");

    if (createdAfter) query = query.gte("created_at", createdAfter);
    if (updatedAfter) query = query.gte("updated_at", updatedAfter);

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