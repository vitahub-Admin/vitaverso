// POST /api/customer-app/push-token
// Guarda el Expo push token del dispositivo. { pushToken: null } lo borra (al cerrar sesión).
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { supabase } from "@/lib/customerSupplements";

export async function POST(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const { pushToken } = await req.json();
    if (pushToken !== null && !/^Expo(nent)?PushToken\[.+\]$/.test(String(pushToken ?? ""))) {
      return NextResponse.json({ ok: false, error: "pushToken inválido" }, { status: 400 });
    }

    // Un token es de un solo dispositivo: si otra cuenta lo tenía (mismo teléfono), se lo quitamos
    if (pushToken) {
      await supabase
        .from("customer_app_users")
        .update({ push_token: null })
        .eq("push_token", pushToken)
        .neq("id", payload.userId);
    }

    const { error } = await supabase
      .from("customer_app_users")
      .update({ push_token: pushToken, updated_at: new Date().toISOString() })
      .eq("id", payload.userId);

    if (error) {
      console.error("push-token update error:", error);
      return NextResponse.json({ ok: false, error: "No se pudo guardar" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("push-token error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
