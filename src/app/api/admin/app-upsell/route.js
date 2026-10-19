// /api/admin/app-upsell  (protegida por src/proxy.js: solo ADMIN_IDS)
//   GET  ?buscar=texto     → buscar productos del catálogo para agregar
//   GET                    → lista de sugeridos del carrito de Mi Vitahub
//   POST { variant_id, product_id, title, note? } → agregar
//   PATCH { id, note?, active?, position? }      → editar
//   DELETE ?id=                                   → quitar
import { NextResponse } from "next/server";
import { supabase } from "@/lib/customerSupplements";

export async function GET(req) {
  const buscar = new URL(req.url).searchParams.get("buscar")?.trim().replace(/[,%()*]/g, " ");
  if (buscar) {
    const t = `%${buscar.slice(0, 60)}%`;
    const { data, error } = await supabase
      .from("product_catalog")
      .select("product_id, variant_id, title, variant_title, brand, price, is_professional")
      .eq("status", "ACTIVE")
      .or(`title.ilike.${t},brand.ilike.${t}`)
      .limit(25);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, resultados: data ?? [] });
  }

  const { data, error } = await supabase
    .from("customer_app_upsell")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, sugeridos: data ?? [] });
}

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  if (!b.variant_id || !b.title) return NextResponse.json({ ok: false, error: "Falta el producto" }, { status: 400 });
  const { data: ultimo } = await supabase
    .from("customer_app_upsell").select("position").order("position", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("customer_app_upsell").upsert(
    {
      variant_id: Number(b.variant_id),
      product_id: b.product_id ? Number(b.product_id) : null,
      title: String(b.title).slice(0, 300),
      note: b.note ? String(b.note).slice(0, 80) : null,
      position: (ultimo?.position ?? 0) + 10,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "variant_id" }
  );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req) {
  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ ok: false, error: "Falta el id" }, { status: 400 });
  const fields = { updated_at: new Date().toISOString() };
  if (b.note !== undefined) fields.note = b.note ? String(b.note).slice(0, 80) : null;
  if (b.active !== undefined) fields.active = !!b.active;
  if (b.position !== undefined) fields.position = Math.round(Number(b.position)) || 0;
  const { error } = await supabase.from("customer_app_upsell").update(fields).eq("id", b.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Falta el id" }, { status: 400 });
  const { error } = await supabase.from("customer_app_upsell").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
