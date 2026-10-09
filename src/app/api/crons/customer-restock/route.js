// GET /api/crons/customer-restock
// Push diario a clientes de la app cuyos suplementos se están por terminar.
// Vercel Cron, 15:00 UTC = 9:00 en México. Protegido con Authorization: Bearer CRON_SECRET
import { NextResponse } from "next/server";
import { sendRestockNotifications } from "@/lib/restockNotifications";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req) {
  if (req.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendRestockNotifications();
    console.log("✅ customer-restock:", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("❌ customer-restock failed:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
