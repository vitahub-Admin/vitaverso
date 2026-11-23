// Tomas por horario (Mi Vitahub): cada suplemento se toma en uno o más horarios
// (supplement_tracking.reminder_times) y cada toma se marca aparte en supplement_intake
// con su `slot` ("08:00"). Las marcas viejas, o las de suplementos sin horario, tienen
// slot 'dia' y valen por todas las tomas de ese suplemento ese día.
//
// El cumplimiento se cuenta por MOMENTO (mañana, mediodía, noche), no por hora exacta:
// si el paciente movió su toma de las 22:00 a las 21:00, los días anteriores siguen
// contando bien porque las dos son "noche".

export const MOMENTOS = ["manana", "mediodia", "noche", "dia"];
export const NOMBRE_MOMENTO = { manana: "Mañana", mediodia: "Mediodía", noche: "Noche", dia: "Durante el día" };
export const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function momentoDe(slot) {
  if (!slot || slot === "dia" || !HORA.test(slot)) return "dia";
  const h = Number(slot.slice(0, 2));
  if (h < 12) return "manana";
  if (h < 17) return "mediodia";
  return "noche";
}

/** Horarios de toma de un suplemento en seguimiento; sin horarios = una toma 'dia'. */
export function slotsDe(row) {
  const times = [...new Set((row?.reminder_times ?? []).filter((t) => HORA.test(t)))].sort();
  return times.length ? times : ["dia"];
}

/** Marcas → Map(día → Map(variante → [slots])) */
export function agruparMarcas(intakes) {
  const porDia = new Map();
  for (const i of intakes ?? []) {
    const dia = String(i.taken_date);
    if (!porDia.has(dia)) porDia.set(dia, new Map());
    const m = porDia.get(dia);
    const vid = String(i.shopify_variant_id);
    if (!m.has(vid)) m.set(vid, []);
    m.get(vid).push(i.slot ?? "dia");
  }
  return porDia;
}

/**
 * Cumplimiento de un día: { req, done, momentos: { manana: {req, done}, … } }, o null si ese
 * día no tenía suplementos en seguimiento (no suma ni corta la racha).
 */
export function evaluarDia(rows, marcasDelDia, day) {
  const requeridos = rows.filter((r) => r.start_date && r.start_date <= day && (!r.end_date || r.end_date >= day));
  if (!requeridos.length) return null;
  const momentos = {};
  let req = 0;
  let done = 0;
  for (const r of requeridos) {
    const marcas = marcasDelDia?.get(String(r.shopify_variant_id)) ?? [];
    const todoElDia = marcas.includes("dia");
    const hechasPorMomento = {};
    for (const s of marcas) hechasPorMomento[momentoDe(s)] = (hechasPorMomento[momentoDe(s)] ?? 0) + 1;

    const pedidasPorMomento = {};
    for (const s of slotsDe(r)) pedidasPorMomento[momentoDe(s)] = (pedidasPorMomento[momentoDe(s)] ?? 0) + 1;

    for (const [m, n] of Object.entries(pedidasPorMomento)) {
      const hechas = todoElDia ? n : Math.min(n, hechasPorMomento[m] ?? 0);
      momentos[m] ??= { req: 0, done: 0 };
      momentos[m].req += n;
      momentos[m].done += hechas;
      req += n;
      done += hechas;
    }
  }
  return { req, done, momentos };
}

// ── Fechas (YYYY-MM-DD, sin husos) ──────────────────────────────────────────
export function sumarDias(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export function restarMinutos(hhmm, min) {
  const [h, m] = hhmm.split(":").map(Number);
  let t = h * 60 + m - min;
  t = Math.max(t, 5 * 60); // nunca antes de las 5:00
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}
