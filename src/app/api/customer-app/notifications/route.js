// /api/customer-app/notifications — historial del cliente
//   GET  ?count=1 → solo { unread }   ·   sin count → { notifications (50), unread }
//   PATCH { all: true } | { ids: [...] } → marcar como leídas
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { supabase } from "@/lib/customerSupplements";

async function unreadCount(userId) {
  const { count } = await supabase
    .from("customer_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)
    .is("deleted_at", null);
  return count ?? 0;
}

export async function GET(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const unread = await unreadCount(payload.userId);
    if (new URL(req.url).searchParams.get("count")) return NextResponse.json({ ok: true, unread });

    const { data, error } = await supabase
      .from("customer_notifications")
      .select("id, title, body, data, read_at, opened_at, created_at")
      .eq("user_id", payload.userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      ok: true,
      unread,
      notifications: (data ?? []).map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.data?.type ?? "admin_message",
        url: n.data?.url ?? null,
        variantId: n.data?.variantId ?? null,
        productTitle: n.data?.productTitle ?? null,
        productHandle: n.data?.productHandle ?? null,
        read: !!n.read_at,
        opened: !!n.opened_at,
        createdAt: n.created_at,
      })),
    });
  } catch (err) {
    console.error("customer-app/notifications GET:", err);
    return NextResponse.json({ ok: false, error: "No se pudieron cargar tus notificaciones" }, { status: 500 });
  }
}

export async function PATCH(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  const body = await req.json().catch(() => ({}));
  let q = supabase
    .from("customer_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", payload.userId)
    .is("read_at", null);
  if (!body.all) {
    const ids = Array.isArray(body.ids) ? body.ids.slice(0, 200) : [];
    if (!ids.length) return NextResponse.json({ ok: true });
    q = q.in("id", ids);
  }
  const { error } = await q;
  if (error) return NextResponse.json({ ok: false, error: "No se pudo actualizar" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
