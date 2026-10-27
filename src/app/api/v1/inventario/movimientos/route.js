import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exigirLlave, efectoConsultorio, codificarCursor, leerCursor } from "@/lib/inventarioApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const TIPOS = ["entrega", "venta", "devolucion", "ajuste"];

/**
 * GET /api/v1/inventario/movimientos
 * Movimientos de inventario de consignación, en orden cronológico, para leerlos por tandas.
 *
 *   cursor   opaco; el `siguiente_cursor` de la respuesta anterior. Sin cursor empieza desde `desde`.
 *   desde    ISO 8601; solo si no hay cursor (por defecto, desde el principio).
 *   tipo     entrega | venta | devolucion | ajuste (coma para varios)
 *   owner_id id Shopify del profesional
 *   limite   1–500 (por defecto 200)
 *
 * Seguir leyendo mientras `hay_mas` sea true; guardar `siguiente_cursor` para la próxima consulta.
 */
export async function GET(req) {
  const denegado = exigirLlave(req);
  if (denegado) return denegado;

  try {
    const q = new URL(req.url).searchParams;
    const limite = Math.min(Math.max(parseInt(q.get("limite") || "200", 10) || 200, 1), 500);

    let consulta = supabase
      .from("consignment_movements")
      .select("id, owner_id, variant_id, tipo, cantidad, motivo, local_order_id, created_at")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(limite + 1);

    if (q.get("cursor")) {
      const c = leerCursor(q.get("cursor"));
      if (!c) return NextResponse.json({ ok: false, error: "cursor inválido" }, { status: 400 });
      consulta = consulta.or(`created_at.gt.${c.creado},and(created_at.eq.${c.creado},id.gt.${c.id})`);
    } else if (q.get("desde")) {
      if (Number.isNaN(Date.parse(q.get("desde")))) {
        return NextResponse.json({ ok: false, error: "desde inválido (usa ISO 8601)" }, { status: 400 });
      }
      consulta = consulta.gte("created_at", new Date(q.get("desde")).toISOString());
    }

    const tipos = (q.get("tipo") || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (tipos.some((t) => !TIPOS.includes(t))) {
      return NextResponse.json({ ok: false, error: `tipo inválido (${TIPOS.join(", ")})` }, { status: 400 });
    }
    if (tipos.length) consulta = consulta.in("tipo", tipos);
    if (q.get("owner_id")) consulta = consulta.eq("owner_id", q.get("owner_id"));

    const { data, error } = await consulta;
    if (error) throw error;

    const hayMas = data.length > limite;
    const filas = hayMas ? data.slice(0, limite) : data;

    // Producto, profesional y venta de origen, en una consulta por tabla
    const variantes = [...new Set(filas.map((m) => m.variant_id))];
    const duenos = [...new Set(filas.map((m) => m.owner_id))];
    const ventas = [...new Set(filas.map((m) => m.local_order_id).filter(Boolean))];

    const [{ data: catalogo }, { data: afiliados }, { data: locales }] = await Promise.all([
      variantes.length
        ? supabase.from("product_catalog").select("variant_id, product_id, title, variant_title, sku").in("variant_id", variantes)
        : { data: [] },
      duenos.length
        ? supabase.from("affiliates").select("shopify_customer_id, first_name, last_name").in("shopify_customer_id", duenos)
        : { data: [] },
      ventas.length
        ? supabase.from("local_orders").select("id, items, estado, paid_at, payment_provider").in("id", ventas)
        : { data: [] },
    ]);

    const prod = Object.fromEntries((catalogo || []).map((p) => [String(p.variant_id), p]));
    const pro = Object.fromEntries((afiliados || []).map((a) => [String(a.shopify_customer_id), a]));
    const venta = Object.fromEntries((locales || []).map((v) => [v.id, v]));

    const movimientos = filas.map((m) => {
      const p = prod[String(m.variant_id)];
      const a = pro[String(m.owner_id)];
      const v = m.local_order_id ? venta[m.local_order_id] : null;
      const linea = v && (v.items || []).find((i) => String(i.variant_id) === String(m.variant_id));
      return {
        id: m.id,
        ocurrido_en: m.created_at,
        tipo: m.tipo,
        cantidad: m.cantidad,
        efecto_consultorio: efectoConsultorio(m.tipo, m.cantidad),
        motivo: m.motivo,
        producto: {
          variant_id: m.variant_id,
          product_id: p?.product_id ?? null,
          sku: p?.sku ?? null,
          titulo: p?.title ?? null,
          variante: p?.variant_title ?? null,
        },
        profesional: {
          id: m.owner_id,
          nombre: a ? `${a.first_name || ""} ${a.last_name || ""}`.trim() : null,
        },
        venta: v
          ? {
              id: v.id,
              estado: v.estado,
              pagada_en: v.paid_at,
              pasarela: v.payment_provider,
              precio_unitario: linea ? Number(linea.price) : null,
              importe: linea ? Number(linea.price) * Number(m.cantidad) : null,
            }
          : null,
      };
    });

    const ultimo = filas[filas.length - 1];
    return NextResponse.json({
      ok: true,
      movimientos,
      hay_mas: hayMas,
      siguiente_cursor: ultimo ? codificarCursor(ultimo) : q.get("cursor") || null,
    });
  } catch (err) {
    console.error("inventario/movimientos:", err);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
