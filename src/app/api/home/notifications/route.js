import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { idDeSesion } from "@/lib/sesionWeb";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Los avisos son del profesional que tiene la sesión; el ID de la URL ya no cuenta
export async function GET() {
  const customerId = idDeSesion(await cookies());
  if (!customerId) return NextResponse.json({ notifications: [] }, { status: 401 });

  const { data, error } = await supabase
    .from("affiliate_notifications")
    .select("id, title, body, data, created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ notifications: [] });
  return NextResponse.json({ notifications: data || [] });
}
