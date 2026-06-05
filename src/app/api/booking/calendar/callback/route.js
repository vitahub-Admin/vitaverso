// GET /api/booking/calendar/callback?code=XXX&state=affiliateId
// Completa el OAuth, guarda el token y redirige al dashboard.
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { exchangeCode } from "@/lib/bookingCalendar";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const affiliateId = searchParams.get("state");

  if (!code || !affiliateId) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/booking-dashboard?error=oauth_failed`
    );
  }

  try {
    const tokens = await exchangeCode(code);

    await supabase
      .from("booking_affiliates")
      .update({ google_calendar_token: tokens })
      .eq("id", affiliateId);

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/booking-dashboard?calendar=connected`
    );
  } catch {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL}/booking-dashboard?error=oauth_failed`
    );
  }
}
