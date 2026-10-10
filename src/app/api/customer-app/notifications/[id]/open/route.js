// POST /api/customer-app/notifications/:id/open — el cliente tocó la notificación
// (desde el push o desde el listado). Registra la apertura (y la lectura) una sola vez.
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { supabase } from "@/lib/customerSupplements";

export async function POST(req, { params }) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  const { id } = await params;
  const now = new Date().toISOString();

  // Solo la primera apertura cuenta; read_at se completa si no estaba
  await supabase
    .from("customer_notifications")
    .update({ opened_at: now })
    .eq("id", id)
    .eq("user_id", payload.userId)
    .is("opened_at", null);
  await supabase
    .from("customer_notifications")
    .update({ read_at: now })
    .eq("id", id)
    .eq("user_id", payload.userId)
    .is("read_at", null);

  return NextResponse.json({ ok: true });
}
