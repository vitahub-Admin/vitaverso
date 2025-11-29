import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";

// =============================
//  POST → Save sharecart
// =============================
export async function POST(req) {
  try {
    const body = await req.json();
    const { items, name, telefono, extra } = body;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 }
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
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      token: data.token,
      url: `https://vitahub.mx/cart?shared-cart-id=${data.token}`,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

// =============================
//  GET → Retrieve one or all
// =============================
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("id");

    // -------------------------------------------
    // A: GET a single cart using the short token
    // -------------------------------------------
    if (token) {
      const { data, error } = await supabase
        .from("sharecarts")
        .select("*")
        .eq("token", token)
        .single();

      if (error || !data)
        return NextResponse.json(
          { ok: false, error: "Not found" },
          { status: 404 }
        );

      return NextResponse.json({ ok: true, data });
    }

    // -------------------------------------------
    // B: GET all carts
    // -------------------------------------------
    const { data, error } = await supabase
      .from("sharecarts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error)
      return NextResponse.json(
        { ok: false, error: "DB error" },
        { status: 500 }
      );

    return NextResponse.json({ ok: true, list: data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
