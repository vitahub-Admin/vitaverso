import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// GET — lista completa ordenada
export async function GET() {
  const { data, error } = await supabase
    .from("news")
    .select("*")
    .order("orden", { ascending: true });

  if (error) return NextResponse.json({ news: [] }, { status: 500 });
  return NextResponse.json({ news: data });
}

// POST — agregar noticia
export async function POST(req) {
  const body = await req.json();

  // Obtener el máximo orden actual
  const { data: last } = await supabase
    .from("news")
    .select("orden")
    .order("orden", { ascending: false })
    .limit(1)
    .single();

  const orden = last ? (last.orden ?? 0) + 1 : 0;

  const { error } = await supabase.from("news").insert({
    titulo: body.titulo || "",
    imagen: body.imagen || "",
    contenido: body.contenido || "",
    fecha: body.fecha || "",
    orden,
  });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// PUT — guardar reordenamiento o edición (array completo con id + orden)
export async function PUT(req) {
  const body = await req.json();
  const rows = (body.news || []).map((n, i) => ({
    id: n.id,
    titulo: n.titulo,
    imagen: n.imagen,
    contenido: n.contenido,
    fecha: n.fecha,
    orden: i,
  }));

  const { error } = await supabase
    .from("news")
    .upsert(rows, { onConflict: "id" });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE — borrar por id
export async function DELETE(req) {
  const { id } = await req.json();

  const { error } = await supabase.from("news").delete().eq("id", id);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
