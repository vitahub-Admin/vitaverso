// GET /api/affiliates/collection-id?customerId=xxx
// Devuelve el shopify_collection_id del afiliado. Usado por N8N para agregar productos a la colección.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId");

  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "customerId requerido" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("affiliates")
    .select("shopify_collection_id")
    .eq("shopify_customer_id", parseInt(customerId, 10))
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: "Afiliado no encontrado" },
      { status: 404 }
    );
  }

  if (!data.shopify_collection_id) {
    return NextResponse.json(
      { ok: false, error: "El afiliado no tiene colección asignada" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    collection_id: data.shopify_collection_id,
  });
}
