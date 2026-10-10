// DELETE /api/customer-app/notifications/:id — la quita del listado del cliente.
// Se marca deleted_at en lugar de borrar la fila, para no perder las métricas de la campaña.
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { supabase } from "@/lib/customerSupplements";

export async function DELETE(req, { params }) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  const { id } = await params;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("customer_notifications")
    .update({ deleted_at: now })
    .eq("id", id)
    .eq("user_id", payload.userId);

  if (error) return NextResponse.json({ ok: false, error: "No se pudo eliminar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
