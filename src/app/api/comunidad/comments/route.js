import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET() {
  const cookieStore = await cookies();
  const customerId = cookieStore.get("customerId")?.value;
  if (!customerId) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("product_comments")
    .select("id, product_id, comment, status")
    .eq("customer_id", parseInt(customerId, 10));

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, comments: data });
}

export async function POST(req) {
  const cookieStore = await cookies();
  const customerId = cookieStore.get("customerId")?.value;
  if (!customerId) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  const { product_id, sku, collection_handle, comment } = await req.json();

  if (!product_id || !comment?.trim()) {
    return NextResponse.json(
      { success: false, error: "product_id y comment requeridos" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("product_comments")
    .upsert(
      {
        product_id: parseInt(product_id, 10),
        sku: sku || null,
        collection_handle: collection_handle || null,
        customer_id: parseInt(customerId, 10),
        comment: comment.trim(),
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_id,customer_id" }
    )
    .select("id, status")
    .single();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, comment: data });
}
