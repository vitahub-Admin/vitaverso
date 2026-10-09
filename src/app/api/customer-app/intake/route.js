// /api/customer-app/intake — historial de tomas (adherencia)
//   GET  ?date=YYYY-MM-DD → { taken: { [variantId]: true }, streak }
//        date = día local del teléfono (por si el cliente no está en hora de México)
//   POST { variantId, date, taken } → marca o desmarca la toma de ese día
//
// Racha: días seguidos (hasta hoy, o hasta ayer si hoy aún no completa) en los que
// tomó todos los suplementos que tenía en seguimiento ese día.
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { supabase, mxDate, addDays } from "@/lib/customerSupplements";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RACHA_MAX_DIAS = 120;

function dayParam(value) {
  const today = mxDate();
  if (!FECHA.test(value ?? "")) return today;
  // Aceptamos ±1 día respecto a México (husos horarios del teléfono)
  return value >= addDays(today, -1) && value <= addDays(today, 1) ? value : today;
}

async function computeStreak(userId, today) {
  const desde = addDays(today, -RACHA_MAX_DIAS);
  const [{ data: rows }, { data: intakes }] = await Promise.all([
    supabase
      .from("supplement_tracking")
      .select("shopify_variant_id, start_date, end_date, active")
      .eq("user_id", userId)
      .eq("active", true)
      .not("start_date", "is", null),
    supabase
      .from("supplement_intake")
      .select("shopify_variant_id, taken_date")
      .eq("user_id", userId)
      .gte("taken_date", desde),
  ]);
  if (!rows?.length) return 0;

  const takenByDay = {};
  for (const i of intakes ?? []) {
    (takenByDay[i.taken_date] ??= new Set()).add(String(i.shopify_variant_id));
  }

  const completo = (day) => {
    const requeridos = rows.filter((r) => r.start_date <= day && (!r.end_date || r.end_date >= day));
    if (!requeridos.length) return null; // día sin suplementos: no suma ni corta
    const tomados = takenByDay[day] ?? new Set();
    return requeridos.every((r) => tomados.has(String(r.shopify_variant_id)));
  };

  let streak = 0;
  let day = completo(today) ? today : addDays(today, -1);
  for (let i = 0; i < RACHA_MAX_DIAS; i++) {
    const c = completo(day);
    if (c === false) break;
    if (c === true) streak++;
    else if (!rows.some((r) => r.start_date <= day)) break; // antes de empezar
    day = addDays(day, -1);
  }
  return streak;
}

export async function GET(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const day = dayParam(new URL(req.url).searchParams.get("date"));
    const { data, error } = await supabase
      .from("supplement_intake")
      .select("shopify_variant_id")
      .eq("user_id", payload.userId)
      .eq("taken_date", day);
    if (error) throw new Error(error.message);

    const taken = Object.fromEntries((data ?? []).map((r) => [String(r.shopify_variant_id), true]));
    const streak = await computeStreak(payload.userId, day);
    return NextResponse.json({ ok: true, date: day, taken, streak });
  } catch (err) {
    console.error("customer-app/intake GET error:", err);
    return NextResponse.json({ ok: false, error: "No se pudo cargar tu registro" }, { status: 500 });
  }
}

export async function POST(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const body = await req.json();
    const variantId = Number(body.variantId);
    if (!variantId) {
      return NextResponse.json({ ok: false, error: "Falta el suplemento" }, { status: 400 });
    }
    const day = dayParam(body.date);

    const { error } = body.taken
      ? await supabase
          .from("supplement_intake")
          .upsert(
            { user_id: payload.userId, shopify_variant_id: variantId, taken_date: day },
            { onConflict: "user_id,shopify_variant_id,taken_date", ignoreDuplicates: true }
          )
      : await supabase
          .from("supplement_intake")
          .delete()
          .eq("user_id", payload.userId)
          .eq("shopify_variant_id", variantId)
          .eq("taken_date", day);
    if (error) throw new Error(error.message);

    const streak = await computeStreak(payload.userId, day);
    return NextResponse.json({ ok: true, streak });
  } catch (err) {
    console.error("customer-app/intake POST error:", err);
    return NextResponse.json({ ok: false, error: "No se pudo guardar tu toma" }, { status: 500 });
  }
}
