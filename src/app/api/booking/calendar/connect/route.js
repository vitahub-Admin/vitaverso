// GET /api/booking/calendar/connect
// Inicia el flujo OAuth de Google Calendar para el afiliado logueado.
// Lee el JWT desde cookie (proJwt) porque es una navegación directa del browser.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { getAuthUrl } from "@/lib/bookingCalendar";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("proJwt")?.value;

  if (!token) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/booking-dashboard?error=no_session`
    );
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.SHOPIFY_TOKEN_SECRET);
  } catch {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/booking-dashboard?error=no_session`
    );
  }

  const { data: affiliate } = await supabase
    .from("booking_affiliates")
    .select("id")
    .eq("shopify_customer_id", Number(payload.userId))
    .maybeSingle();

  if (!affiliate) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/booking-dashboard?error=no_profile`
    );
  }

  const url = getAuthUrl(affiliate.id);
  return NextResponse.redirect(url);
}
