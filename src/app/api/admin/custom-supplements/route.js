// GET /api/admin/custom-supplements  (protegida por src/proxy.js: solo ADMIN_IDS)
// Suplementos que los pacientes cargaron en Mi Vitahub y Vitahub no vende, agrupados
// por nombre, con cuántos pacientes los toman y una foto de muestra. Sirve para decidir
// qué conviene sumar al catálogo.
import { NextResponse } from "next/server";
import { supabase, CUSTOM_BUCKET } from "@/lib/customerSupplements";

const normalizar = (t) =>
  String(t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export async function GET() {
  const { data, error } = await supabase
    .from("supplement_tracking")
    .select("user_id, custom_name, photo_path, daily_dose, active, created_at")
    .eq("custom", true)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const grupos = new Map();
  for (const r of data ?? []) {
    const clave = normalizar(r.custom_name);
    if (!clave) continue;
    const g = grupos.get(clave) ?? {
      nombre: r.custom_name.trim(),
      pacientes: new Set(),
      activos: 0,
      foto: null,
      ultimo: r.created_at,
      nombres: new Set(),
    };
    g.pacientes.add(r.user_id);
    if (r.active) g.activos++;
    if (!g.foto && r.photo_path) g.foto = r.photo_path;
    g.nombres.add(r.custom_name.trim());
    grupos.set(clave, g);
  }

  const lista = [...grupos.values()].sort((a, b) => b.pacientes.size - a.pacientes.size || (a.ultimo < b.ultimo ? 1 : -1));
  const fotos = lista.map((g) => g.foto).filter(Boolean);
  const urls = {};
  if (fotos.length) {
    const { data: firmadas } = await supabase.storage.from(CUSTOM_BUCKET).createSignedUrls(fotos, 3600);
    for (const f of firmadas ?? []) if (f.signedUrl) urls[f.path] = f.signedUrl;
  }

  return NextResponse.json({
    ok: true,
    total: lista.length,
    productos: lista.map((g) => ({
      nombre: g.nombre,
      variantes: [...g.nombres].filter((n) => n !== g.nombre).slice(0, 5),
      pacientes: g.pacientes.size,
      activos: g.activos,
      foto: g.foto ? urls[g.foto] ?? null : null,
      ultimo: g.ultimo,
    })),
  });
}
