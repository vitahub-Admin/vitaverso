import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exigirLlave } from "@/lib/inventarioApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

/**
 * GET /api/v1/inventario/consultorios
 * Foto del stock que Vitahub tiene en consignación, por profesional y producto.
 * Sirve para cuadrar contra los movimientos y para saber cuánto producto está "afuera".
 *
 *   owner_id   solo ese profesional
 *   con_stock  1 = solo filas con unidades disponibles
 *
 * `disponible` = entregado − vendido − devuelto + ajuste. No descuenta el efectivo cobrado y aún por
 * liquidar (ver `reservado`): esas unidades siguen físicamente en el libro hasta que se pagan.
 */
export async function GET(req) {
  const denegado = exigirLlave(req);
  if (denegado) return denegado;

  try {
    const q = new URL(req.url).searchParams;
    let consulta = supabase
      .from("consignment_stock")
      .select("owner_id, variant_id, product_id, title, variant_title, entregado, vendido, devuelto, ajuste, disponible, updated_at")
      .order("owner_id").order("variant_id")
      .range(0, 9999);
    if (q.get("owner_id")) consulta = consulta.eq("owner_id", q.get("owner_id"));
    if (q.get("con_stock") === "1") consulta = consulta.gt("disponible", 0);

    const { data, error } = await consulta;
    if (error) throw error;

    const variantes = [...new Set((data || []).map((r) => r.variant_id))];
    const duenos = [...new Set((data || []).map((r) => r.owner_id))];
    const [{ data: catalogo }, { data: afiliados }, { data: reservas }] = await Promise.all([
      variantes.length ? supabase.from("product_catalog").select("variant_id, sku").in("variant_id", variantes) : { data: [] },
      duenos.length ? supabase.from("affiliates").select("shopify_customer_id, first_name, last_name").in("shopify_customer_id", duenos) : { data: [] },
      supabase.from("consignment_reservado").select("owner_id, variant_id, reservado"),
    ]);
    const sku = Object.fromEntries((catalogo || []).map((p) => [String(p.variant_id), p.sku]));
    const pro = Object.fromEntries((afiliados || []).map((a) => [String(a.shopify_customer_id), `${a.first_name || ""} ${a.last_name || ""}`.trim()]));
    const reservado = Object.fromEntries((reservas || []).map((r) => [`${r.owner_id}:${r.variant_id}`, Number(r.reservado)]));

    return NextResponse.json({
      ok: true,
      generado_en: new Date().toISOString(),
      stock: (data || []).map((r) => ({
        profesional: { id: r.owner_id, nombre: pro[String(r.owner_id)] || null },
        producto: {
          variant_id: r.variant_id, product_id: r.product_id, sku: sku[String(r.variant_id)] ?? null,
          titulo: r.title, variante: r.variant_title,
        },
        entregado: r.entregado, vendido: r.vendido, devuelto: r.devuelto, ajuste: r.ajuste,
        disponible: r.disponible,
        reservado: reservado[`${r.owner_id}:${r.variant_id}`] || 0,
        actualizado_en: r.updated_at,
      })),
    });
  } catch (err) {
    console.error("inventario/consultorios:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
