// GET /api/customer-app/discounts
// Descuentos vigentes del cliente ("Tus descuentos" y el selector del carrito)
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { getAppUser } from "@/lib/customerSupplements";
import { descuentosDelCliente } from "@/lib/descuentosClientes";

export async function GET(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const user = await getAppUser(payload.userId);
    if (!user) return unauthorized();
    // Por el correo verificado del login, nunca por uno sin verificar
    const descuentos = await descuentosDelCliente(user.email ?? payload.email);
    return NextResponse.json({ ok: true, descuentos });
  } catch (err) {
    console.error("customer-app/discounts:", err);
    return NextResponse.json({ ok: false, error: "No se pudieron cargar tus descuentos" }, { status: 500 });
  }
}
