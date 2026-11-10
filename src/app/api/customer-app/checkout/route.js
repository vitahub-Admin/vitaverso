// POST /api/customer-app/checkout  { items: [{ variantId, quantity }], discountCode? }
//   → { ok, url, tipo: "borrador" | "carrito" }
// Lo usa "Pagar" del carrito desde la app 1.1.3. Con precio de app vigente arma un pedido
// borrador con esos precios; si no, el carrito normal de vitahub.mx. Ver src/lib/customerCheckout.js.
// Si esto falla, la app arma el carrito normal por su cuenta.
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { getAppUser } from "@/lib/customerSupplements";
import { puedeVerPrecioApp } from "@/lib/customerPrecioApp";
import { linkDePago } from "@/lib/customerCheckout";

export async function POST(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const user = await getAppUser(payload.userId);
    if (!user) return unauthorized();
    const body = await req.json().catch(() => ({}));

    const r = await linkDePago({
      items: Array.isArray(body.items) ? body.items.slice(0, 50) : [],
      codigo: body.discountCode ?? null,
      user,
      specialistRef: user.specialist_shopify_id ? String(user.specialist_shopify_id) : null,
      conPrecioApp: puedeVerPrecioApp(req, user),
    });
    if (!r) {
      return NextResponse.json({ ok: false, error: "Los productos de tu carrito ya no están disponibles" }, { status: 400 });
    }
    if (r.tipo === "borrador") console.log(`[checkout] ${user.email} → ${r.borrador}`);
    return NextResponse.json({ ok: true, url: r.url, tipo: r.tipo });
  } catch (err) {
    console.error("customer-app/checkout:", err);
    return NextResponse.json({ ok: false, error: "No se pudo preparar el pago" }, { status: 500 });
  }
}
