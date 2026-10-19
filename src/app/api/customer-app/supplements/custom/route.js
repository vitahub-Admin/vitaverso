// POST /api/customer-app/supplements/custom
// Agrega al seguimiento un suplemento que Vitahub no vende, con foto opcional.
// Body: { name, dailyDose, unitsPerBottle?, quantity?, startDate, photoBase64?, photoType? }
//   photoBase64: JPEG/PNG en base64 (la app la manda ya reducida, ~1080 px)
// Queda en supplement_tracking con un id de variante negativo (no existe en Shopify),
// así tomas, racha y recordatorios funcionan igual que con los productos de la tienda.
import { NextResponse } from "next/server";
import crypto from "crypto";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { supabase, getAppUser, addDays, mxDate, CUSTOM_BUCKET } from "@/lib/customerSupplements";
import { suggestedTimes } from "@/lib/modoDeUso";

export const maxDuration = 30;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FOTO_BYTES = 3 * 1024 * 1024;

export async function POST(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const user = await getAppUser(payload.userId);
    if (!user) return unauthorized();

    const body = await req.json();
    const name = String(body.name ?? "").trim().slice(0, 120);
    const dose = Number(body.dailyDose);
    const units = body.unitsPerBottle ? Math.round(Number(body.unitsPerBottle)) : null;
    const quantity = Math.min(Math.max(1, Math.round(Number(body.quantity) || 1)), 20);
    const today = mxDate();
    const startDate = FECHA.test(body.startDate ?? "") && body.startDate <= addDays(today, 1) ? body.startDate : today;

    if (name.length < 2) return NextResponse.json({ ok: false, error: "Escribe el nombre del suplemento" }, { status: 400 });
    if (!(dose > 0 && dose <= 100)) return NextResponse.json({ ok: false, error: "Indica cuánto tomas al día" }, { status: 400 });
    if (units != null && !(units >= 1 && units <= 5000)) {
      return NextResponse.json({ ok: false, error: "Revisa cuántas unidades trae el frasco" }, { status: 400 });
    }

    // Foto (opcional)
    let photoPath = null;
    if (body.photoBase64) {
      const tipo = ["image/jpeg", "image/png", "image/webp"].includes(body.photoType) ? body.photoType : "image/jpeg";
      const buf = Buffer.from(String(body.photoBase64).replace(/^data:[^,]+,/, ""), "base64");
      if (!buf.length || buf.length > MAX_FOTO_BYTES) {
        return NextResponse.json({ ok: false, error: "La foto es muy pesada. Intenta con otra." }, { status: 400 });
      }
      photoPath = `${user.id}/${crypto.randomUUID()}.${tipo.split("/")[1].replace("jpeg", "jpg")}`;
      const { error: upErr } = await supabase.storage.from(CUSTOM_BUCKET).upload(photoPath, buf, { contentType: tipo });
      if (upErr) {
        console.error("custom supplement upload:", upErr.message);
        return NextResponse.json({ ok: false, error: "No se pudo guardar la foto" }, { status: 500 });
      }
    }

    // Id negativo único: no choca nunca con variantes reales de Shopify
    const variantId = -Number(BigInt("0x" + crypto.randomBytes(6).toString("hex")));
    const perBottle = units ? Math.max(1, Math.floor(units / dose)) : null;
    const tomas = Math.min(Math.max(1, Math.round(dose)), 3);

    const { error } = await supabase.from("supplement_tracking").insert({
      user_id: user.id,
      shopify_customer_id: user.shopify_customer_id ?? null,
      shopify_variant_id: variantId,
      product_title: name,
      variant_title: "",
      custom: true,
      custom_name: name,
      photo_path: photoPath,
      order_id: "manual",
      source: "propio",
      active: true,
      start_date: startDate,
      daily_dose: dose,
      duration_days: perBottle,
      quantity,
      end_date: perBottle ? addDays(startDate, perBottle * quantity) : null,
      last_order_at: new Date().toISOString(),
      reminder_times: suggestedTimes([], tomas),
      updated_at: new Date().toISOString(),
    });
    if (error) {
      console.error("custom supplement insert:", error.message);
      if (photoPath) await supabase.storage.from(CUSTOM_BUCKET).remove([photoPath]);
      return NextResponse.json({ ok: false, error: "No se pudo guardar" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, variantId: String(variantId), reminderTimes: suggestedTimes([], tomas) });
  } catch (err) {
    console.error("customer-app/supplements/custom:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
