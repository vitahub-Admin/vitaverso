import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Llamado por n8n cada 30 min para limpiar pending_payment vencidos
export async function POST(req) {
  const secret = req.headers.get("x-cleanup-secret");
  if (secret !== process.env.CLEANUP_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expiryThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("booking_appointments")
    .update({ status: "cancelled", cancelled_reason: "payment_timeout" })
    .eq("status", "pending_payment")
    .lt("created_at", expiryThreshold)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ cancelled: data?.length ?? 0 });
}
