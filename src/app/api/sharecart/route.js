import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import crypto from "crypto";

// Utilidad: generar token cortito (6–8 chars)
function shortId() {
  return crypto.randomBytes(4).toString("hex"); 
}

// =============================
//  POST  → Save sharecart
// =============================
export async function POST(req) {
  try {
    const body = await req.json();

    const { items, patient_name, phone, extras } = body;

    if (!items || !Array.isArray(items)) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 }
      );
    }

    // Generar ID corto tipo "a12f90c3"
    const id = shortId();

    // Guardar comprimido dentro de la DB
    const encoded_cart = Buffer.from(JSON.stringify({ items })).toString("base64");

    const { error } = await supabase
      .from("sharecarts")
      .insert({
        id,
        encoded_cart,
        patient_name: patient_name || null,
        phone: phone || null,
        extras: extras || {}
      });

    if (error) {
      console.error(error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    // Devolver el link final para WhatsApp
    return NextResponse.json({
      ok: true,
      id,
      url: `https://vitahub.mx/cart?shared-cart-id=${id}`
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}


// =============================
//  GET  → Retrieve sharecart
// =============================
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id)
      return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

    const { data, error } = await supabase
      .from("sharecarts")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data)
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    // Decodificar carrito
    const decoded = JSON.parse(Buffer.from(data.encoded_cart, "base64").toString());

    return NextResponse.json({ ok: true, cart: decoded });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
