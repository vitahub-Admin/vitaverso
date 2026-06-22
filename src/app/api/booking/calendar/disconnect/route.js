// POST /api/booking/calendar/disconnect
// Desvincula Google Calendar del afiliado: limpia token e ID en Supabase.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get("proJwt")?.value;

  if (!token) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.SHOPIFY_TOKEN_SECRET);
  } catch {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  // Traer el token antes de borrarlo para poder revocarlo en Google
  const { data: affiliate, error: fetchError } = await supabase
    .from("booking_affiliates")
    .select("google_calendar_token")
    .eq("shopify_customer_id", Number(payload.userId))
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  // Revocar en Google (fire-and-forget, no bloqueamos si falla)
  if (affiliate?.google_calendar_token) {
    const tokenData = typeof affiliate.google_calendar_token === "string"
      ? JSON.parse(affiliate.google_calendar_token)
      : affiliate.google_calendar_token;

    const revokeToken = tokenData?.refresh_token || tokenData?.access_token;
    if (revokeToken) {
      fetch(`https://oauth2.googleapis.com/revoke?token=${revokeToken}`, { method: "POST" })
        .catch(e => console.error("Google revoke error:", e.message));
    }
  }

  // Limpiar en Supabase
  const { error } = await supabase
    .from("booking_affiliates")
    .update({ google_calendar_token: null, google_calendar_id: null })
    .eq("shopify_customer_id", Number(payload.userId));

  if (error) {
    console.error("calendar/disconnect error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
