import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET() {
  const { data, error } = await supabase
    .from("platform_settings")
    .select("key, value, label, updated_at")
    .order("key");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(req) {
  const { key, value } = await req.json();
  if (!key || value === undefined) {
    return NextResponse.json({ error: "key y value requeridos" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .update({ value: Number(value), updated_at: new Date().toISOString() })
    .eq("key", key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
