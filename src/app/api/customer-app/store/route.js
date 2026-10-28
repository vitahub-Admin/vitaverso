// GET /api/customer-app/store
//   sin parámetros  → portada: categorías, recomendados del profesional, sugeridos del carrito y ofertas (VitaDeals)
//   ?q=magnesio      → búsqueda por nombre, marca o ingrediente
//   ?categoria=Sueño → productos de una categoría
//   ?sugeridos=1     → solo los sugeridos del carrito ("Completa tu pedido")
//   ?variantes=1,2   → precio, foto y stock vivos de esas variantes (para el carrito)
// Siempre devuelve specialistRef: la app lo pone en el carrito para acreditar la venta.
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { getAppUser } from "@/lib/customerSupplements";
import { buscar, categorias, recomendadosDelProfesional, sugeridosDelCarrito, vitaDeals, enriquecer } from "@/lib/customerStore";

export async function GET(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const user = await getAppUser(payload.userId);
    if (!user) return unauthorized();
    const specialistRef = user.specialist_shopify_id ? String(user.specialist_shopify_id) : null;

    const p = new URL(req.url).searchParams;
    const q = p.get("q");
    const categoria = p.get("categoria");

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
      recomendadosDelProfesional(user.specialist_shopify_id).catch((e) => {
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
