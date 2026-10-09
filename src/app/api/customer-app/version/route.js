// GET /api/customer-app/version?platform=ios|android
// Versión mínima de la app de clientes (app_config id=2; id=1 es Vitahub Pro).
// Sin auth: la app lo consulta antes de saber si la sesión sirve.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/customerSupplements";

const CONFIG_ID = 2;

export async function GET(req) {
  try {
    const platform = req.nextUrl.searchParams.get("platform") === "ios" ? "ios" : "android";

    const { data, error } = await supabase
      .from("app_config")
      .select("android_min_version, ios_min_version, forced, update_message, ios_store_url, android_store_url")
      .eq("id", CONFIG_ID)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ ok: true, min_version: null });

    return NextResponse.json({
      ok: true,
      min_version: platform === "ios" ? data.ios_min_version : data.android_min_version,
      forced: !!data.forced,
      message: data.update_message,
      store_url: platform === "ios" ? data.ios_store_url : data.android_store_url,
    });
  } catch (err) {
    console.error("customer-app/version error:", err);
    return NextResponse.json({ ok: false, error: "No disponible" }, { status: 500 });
  }
}
