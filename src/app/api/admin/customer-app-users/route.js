// GET /api/admin/customer-app-users?search=&has_app=true&limit=20
// Busca clientes de la app Mi Vitahub (para elegir destinatario de una notificación).
// Protegida por src/proxy.js (solo ADMIN_IDS).
import { NextResponse } from "next/server";
import { supabase } from "@/lib/customerSupplements";

export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const search = (p.get("search") ?? "").trim().replace(/[,%()]/g, " ");
  const limit = Math.min(Number(p.get("limit")) || 20, 50);

  let q = supabase
    .from("customer_app_users")
    .select("id, email, first_name, last_name, push_token, specialist_shopify_id, last_login_at")
    .order("last_login_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (search) q = q.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  if (p.get("has_app") === "true") q = q.not("push_token", "is", null);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const { count: total } = await supabase.from("customer_app_users").select("id", { count: "exact", head: true });
  const { count: conApp } = await supabase
    .from("customer_app_users").select("id", { count: "exact", head: true }).not("push_token", "is", null);

  return NextResponse.json({
    ok: true,
    total: total ?? 0,
    con_app: conApp ?? 0,
    data: (data ?? []).map(({ push_token, ...u }) => ({ ...u, has_push: !!push_token })),
  });
}
