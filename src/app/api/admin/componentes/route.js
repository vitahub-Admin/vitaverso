import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET() {
  const { data, error } = await supabase
    .from("componentes")
    .select("slug, descripcion, updated_at")
    .order("slug");

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data || [] });
}

export async function PATCH(req) {
  const { slug, descripcion } = await req.json();
  if (!slug) return NextResponse.json({ ok: false, error: "Slug requerido" }, { status: 400 });

  const { error } = await supabase
    .from("componentes")
    .update({ descripcion, updated_at: new Date().toISOString() })
    .eq("slug", slug);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
