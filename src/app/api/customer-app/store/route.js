// GET /api/customer-app/store
//   sin parámetros  → portada: categorías, recomendados del profesional, sugeridos del carrito y ofertas (VitaDeals)
//   ?q=magnesio      → búsqueda por nombre, marca o ingrediente
//   ?categoria=Sueño → productos de una categoría
//   ?producto=handle → ficha del producto: fotos, descripción y variantes
//   ?sugeridos=1     → solo los sugeridos del carrito ("Completa tu pedido")
//   ?variantes=1,2   → precio, foto y stock vivos de esas variantes (para el carrito)
// Siempre devuelve specialistRef: la app lo pone en el carrito para acreditar la venta.
//
// Se puede usar sin sesión (invitado, lo pide Apple: el catálogo no puede exigir cuenta).
// Sin sesión no hay profesional, así que no hay recomendados ni specialistRef.
import { NextResponse } from "next/server";
import { verifyAppCustomerToken } from "@/lib/customerAppAuth";
import { getAppUser } from "@/lib/customerSupplements";
import {
  buscar, categorias, recomendadosDelProfesional, sugeridosDelCarrito, vitaDeals, enriquecer, detalleProducto,
} from "@/lib/customerStore";

export async function GET(req) {
  try {
    const payload = verifyAppCustomerToken(req);
    const user = payload ? await getAppUser(payload.userId) : null;
    const specialistRef = user?.specialist_shopify_id ? String(user.specialist_shopify_id) : null;

    const p = new URL(req.url).searchParams;
    const q = p.get("q");
    const categoria = p.get("categoria");

    if (p.get("producto")) {
      const handle = p.get("producto").trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(handle)) {
        return NextResponse.json({ ok: false, error: "Producto no encontrado" }, { status: 404 });
      }
      const producto = await detalleProducto(handle);
      if (!producto) return NextResponse.json({ ok: false, error: "Este producto ya no está disponible" }, { status: 404 });
      return NextResponse.json({ ok: true, specialistRef, producto });
    }
    if (p.get("variantes")) {
      const ids = p.get("variantes").split(",").map((v) => v.trim()).filter((v) => /^\d+$/.test(v)).slice(0, 50);
      return NextResponse.json({ ok: true, specialistRef, variantes: await enriquecer(ids) });
    }
    if (p.get("sugeridos")) {
      return NextResponse.json({ ok: true, specialistRef, sugeridos: await sugeridosDelCarrito() });
    }
    if (q || categoria) {
      return NextResponse.json({ ok: true, specialistRef, productos: await buscar({ q: q ?? "", categoria }) });
    }

    const [cats, recomendados, sugeridos, ofertas] = await Promise.all([
      categorias().catch(() => []),
      recomendadosDelProfesional(user?.specialist_shopify_id).catch((e) => {
        console.error("[store] recomendados:", e.message);
        return [];
      }),
      sugeridosDelCarrito(),
      vitaDeals().catch((e) => {
        console.error("[store] vitadeals:", e.message);
        return [];
      }),
    ]);
    return NextResponse.json({ ok: true, specialistRef, categorias: cats, recomendados, sugeridos, ofertas });
  } catch (err) {
    console.error("customer-app/store:", err);
    return NextResponse.json({ ok: false, error: "No se pudo cargar la tienda" }, { status: 500 });
  }
}
