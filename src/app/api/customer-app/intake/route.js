// /api/customer-app/intake — historial de tomas (adherencia)
//   GET  ?date=YYYY-MM-DD → { taken: { [variantId]: true }, tomas: { [variantId]: [slots] }, streak }
//        date = día local del teléfono (por si el cliente no está en hora de México)
//        `taken` = tiene alguna marca ese día (lo que leen las versiones viejas de la app)
//   GET  ?month=YYYY-MM   → calendario del mes: cumplimiento por día y por momento + consejo
//   POST { variantId, date, taken, slot?, source? } → marca o desmarca una toma
//        sin slot (app vieja, o "marcar todo el suplemento"): vale por todas las tomas del día
//
// Racha: días seguidos (hasta hoy, o hasta ayer si hoy aún no completa) en los que hizo
// TODAS las tomas que tenía ese día. Ver src/lib/tomas.js.
//
// Compatible con la base antes y después de supabase/migrations/tomas_por_horario.sql:
// no usa upsert por (user_id, shopify_variant_id, taken_date) y lee las filas con "*"
// (sin la columna `slot`, cada marca cuenta como 'dia').
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { supabase, mxDate, addDays } from "@/lib/customerSupplements";
import {
  HORA, MOMENTOS, NOMBRE_MOMENTO, momentoDe, slotsDe, agruparMarcas, evaluarDia, restarMinutos,
} from "@/lib/tomas";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MES = /^\d{4}-\d{2}$/;
const RACHA_MAX_DIAS = 120;
const ORIGENES = ["app", "notificacion", "widget"];
// Consejo de "te avisamos antes": con al menos estos días de datos y debajo de este %
const CONSEJO_MIN_DIAS = 7;
const CONSEJO_MAX_PCT = 85;

function dayParam(value) {
  const today = mxDate();
  if (!FECHA.test(value ?? "")) return today;
  // Aceptamos ±1 día respecto a México (husos horarios del teléfono)
  return value >= addDays(today, -1) && value <= addDays(today, 1) ? value : today;
}

async function seguimiento(userId) {
  const { data, error } = await supabase
    .from("supplement_tracking")
    .select("shopify_variant_id, start_date, end_date, reminder_times, product_title, custom_name, custom")
    .eq("user_id", userId)
    .eq("active", true)
    .not("start_date", "is", null);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function marcas(userId, desde, hasta) {
  let q = supabase.from("supplement_intake").select("*").eq("user_id", userId).gte("taken_date", desde);
  if (hasta) q = q.lte("taken_date", hasta);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function computeStreak(userId, today) {
  const [rows, intakes] = await Promise.all([seguimiento(userId), marcas(userId, addDays(today, -RACHA_MAX_DIAS))]);
  if (!rows.length) return 0;
  const porDia = agruparMarcas(intakes);
  const completo = (day) => {
    const e = evaluarDia(rows, porDia.get(day), day);
    return e ? e.done >= e.req : null;
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

// ── Calendario del mes ───────────────────────────────────────────────────────
async function calendario(userId, month) {
  const today = mxDate();
  const desde = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const hasta = `${month}-${String(ultimo).padStart(2, "0")}`;

  const [rows, intakes] = await Promise.all([seguimiento(userId), marcas(userId, desde, hasta)]);
  const porDia = agruparMarcas(intakes);

  const dias = [];
  const totales = {};
  let perfectos = 0;
  let conDatos = 0;
  let req = 0;
  let done = 0;
  for (let d = 1; d <= ultimo; d++) {
    const day = `${month}-${String(d).padStart(2, "0")}`;
    if (day > today) {
      dias.push({ date: day, estado: "futuro" });
      continue;
    }
    const e = evaluarDia(rows, porDia.get(day), day);
    if (!e) {
      dias.push({ date: day, estado: "sin_datos" });
      continue;
    }
    const esHoy = day === today;
    dias.push({ date: day, estado: esHoy ? "hoy" : e.done >= e.req ? "completo" : "incompleto", ...e });
    // Hoy está en curso: se ve en el calendario pero no baja los porcentajes
    if (esHoy) continue;
    conDatos++;
    req += e.req;
    done += e.done;
    if (e.done >= e.req) perfectos++;
    for (const [mo, v] of Object.entries(e.momentos)) {
      totales[mo] ??= { req: 0, done: 0, dias: 0 };
      totales[mo].req += v.req;
      totales[mo].done += v.done;
      totales[mo].dias++;
    }
  }

  const porMomento = MOMENTOS.filter((mo) => totales[mo]).map((mo) => ({
    momento: mo,
    nombre: NOMBRE_MOMENTO[mo],
    pct: Math.round((totales[mo].done / totales[mo].req) * 100),
    saltadas: totales[mo].req - totales[mo].done,
    dias: totales[mo].dias,
  }));

  // Consejo: el momento que más se le pasa → avisarle una hora antes
  let consejo = null;
  const candidato = porMomento
    .filter((p) => p.momento !== "dia" && p.dias >= CONSEJO_MIN_DIAS && p.pct < CONSEJO_MAX_PCT)
    .sort((a, b) => a.pct - b.pct)[0];
  if (candidato) {
    const cambios = rows
      .filter((r) => slotsDe(r).some((s) => momentoDe(s) === candidato.momento))
      .map((r) => {
        const times = slotsDe(r).filter((s) => s !== "dia");
        const nuevos = times.map((s) => (momentoDe(s) === candidato.momento ? restarMinutos(s, 60) : s));
        return { variantId: String(r.shopify_variant_id), de: times, a: [...new Set(nuevos)].sort() };
      })
      .filter((c) => JSON.stringify(c.de) !== JSON.stringify(c.a));
    if (cambios.length) {
      const horaActual = cambios.flatMap((c) => c.de).filter((s) => momentoDe(s) === candidato.momento).sort()[0];
      consejo = {
        momento: candidato.momento,
        nombre: candidato.nombre,
        saltadas: candidato.saltadas,
        horaActual,
        horaNueva: restarMinutos(horaActual, 60),
        cambios,
      };
    }
  }

  return {
    month,
    today,
    dias,
    momentosUsados: MOMENTOS.filter((mo) => rows.some((r) => slotsDe(r).some((s) => momentoDe(s) === mo))),
    resumen: {
      adherencia: req ? Math.round((done / req) * 100) : null,
      perfectos,
      dias: conDatos,
    },
    porMomento,
    consejo,
  };
}

export async function GET(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const params = new URL(req.url).searchParams;
    const month = params.get("month");
    if (month) {
      if (!MES.test(month)) {
        return NextResponse.json({ ok: false, error: "Mes inválido, usa el formato 2026-11" }, { status: 400 });
      }
      return NextResponse.json({ ok: true, ...(await calendario(payload.userId, month)) });
    }

    const day = dayParam(params.get("date"));
    const data = await marcas(payload.userId, day, day);
    const tomas = {};
    for (const r of data) (tomas[String(r.shopify_variant_id)] ??= []).push(r.slot ?? "dia");
    const taken = Object.fromEntries(Object.keys(tomas).map((vid) => [vid, true]));
    const streak = await computeStreak(payload.userId, day);
    return NextResponse.json({ ok: true, date: day, taken, tomas, streak });
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
    const slot = body.slot == null || body.slot === "" ? null : String(body.slot);
    if (slot && slot !== "dia" && !HORA.test(slot)) {
      return NextResponse.json({ ok: false, error: "Horario inválido" }, { status: 400 });
    }
    const source = ORIGENES.includes(body.source) ? body.source : "app";
    const day = dayParam(body.date);
    const userId = payload.userId;

    const delDia = () =>
      supabase.from("supplement_intake").select("*").eq("user_id", userId).eq("shopify_variant_id", variantId).eq("taken_date", day);
    const insertar = async (filas) => {
      if (!filas.length) return;
      const { error } = await supabase.from("supplement_intake").insert(filas);
      // 23505: ya estaba marcada (doble toque, reintento de la cola offline)
      if (error && error.code !== "23505") throw new Error(error.message);
    };

    const { data: existentes, error: errEx } = await delDia();
    if (errEx) throw new Error(errEx.message);
    const slotsMarcados = (existentes ?? []).map((r) => r.slot ?? "dia");

    if (body.taken) {
      if (!slot) {
        // Todo el suplemento (o app vieja): una marca 'dia' si no había ninguna
        if (!slotsMarcados.length) await insertar([{ user_id: userId, shopify_variant_id: variantId, taken_date: day }]);
      } else if (!slotsMarcados.includes(slot) && !slotsMarcados.includes("dia")) {
        await insertar([{ user_id: userId, shopify_variant_id: variantId, taken_date: day, slot, source }]);
      }
    } else if (!slot) {
      const { error } = await supabase
        .from("supplement_intake").delete()
        .eq("user_id", userId).eq("shopify_variant_id", variantId).eq("taken_date", day);
      if (error) throw new Error(error.message);
    } else {
      // Desmarcar una toma. Si estaba la marca de todo el día, se reemplaza por las demás tomas.
      if (slotsMarcados.includes("dia") && slot !== "dia") {
        const { data: fila } = await supabase
          .from("supplement_tracking").select("reminder_times")
          .eq("user_id", userId).eq("shopify_variant_id", variantId).maybeSingle();
        const otras = slotsDe(fila).filter((s) => s !== slot && s !== "dia" && !slotsMarcados.includes(s));
        await insertar(otras.map((s) => ({ user_id: userId, shopify_variant_id: variantId, taken_date: day, slot: s, source })));
      }
      const borrar = slot === "dia" ? ["dia"] : ["dia", slot];
      const { error } = await supabase
        .from("supplement_intake").delete()
        .eq("user_id", userId).eq("shopify_variant_id", variantId).eq("taken_date", day)
        .in("slot", borrar);
      if (error) throw new Error(error.message);
    }

    const streak = await computeStreak(userId, day);
    return NextResponse.json({ ok: true, streak });
  } catch (err) {
    console.error("customer-app/intake POST error:", err);
    return NextResponse.json({ ok: false, error: "No se pudo guardar tu toma" }, { status: 500 });
  }
}
