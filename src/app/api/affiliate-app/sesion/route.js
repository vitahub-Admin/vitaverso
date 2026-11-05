// POST /api/affiliate-app/sesion  (Authorization: Bearer <token de Pro>)
// La app Vitahub Pro lo llama al abrirse y al volver a primer plano. Confirma que el
// profesional siga activo y, si el token ya pasó los 30 días, entrega uno nuevo de 90:
// así la sesión no vence mientras la app se use. Dado de baja → 401 y la app cierra sesión.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCustomerToken, signCustomerToken, shouldRenewAppToken, unauthorized } from "@/lib/customerAppAuth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  try {
    const payload = verifyCustomerToken(req);
    if (!payload?.userId) return unauthorized();

    const { data: afiliado, error } = await supabase
      .from("affiliates")
      .select("status, deleted_at, email")
      .eq("shopify_customer_id", Number(payload.userId))
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!afiliado || afiliado.status !== "active" || afiliado.deleted_at) return unauthorized();

    const token = shouldRenewAppToken(payload)
      ? signCustomerToken(payload.userId, afiliado.email || payload.email)
      : null;

    return NextResponse.json({ ok: true, ...(token ? { token } : {}) });
  } catch (err) {
    console.error("affiliate-app/sesion error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
