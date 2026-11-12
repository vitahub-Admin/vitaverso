// Huso horario de las citas. Todo el módulo de reservas trabaja con UN solo huso: el del
// profesional (hoy todos en México). Las horas de disponibilidad ("09:00") y las que elige el
// paciente son horas de pared de ese huso; en la base se guarda el instante real (timestamptz).
// El servidor de Vercel corre en UTC, así que nunca hay que armar fechas con `new Date("YYYY-MM-DDTHH:MM")`.
export const BOOKING_TZ = "America/Mexico_City";

const dtfCache = new Map();
function partes(date, tz) {
  let dtf = dtfCache.get(tz);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    dtfCache.set(tz, dtf);
  }
  return Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value]));
}

/** Minutos al este de UTC que tiene `tz` en ese instante (México: -360). */
function offsetMin(date, tz) {
  const p = partes(date, tz);
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((comoUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** "2026-11-20" + "10:00" (hora de pared en `tz`) → instante real (Date). Acepta "24:00". */
export function zonedToDate(fecha, hora, tz = BOOKING_TZ) {
  const [y, m, d] = String(fecha).split("-").map(Number);
  const [h, mi] = String(hora).split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi || 0, 0);
  const off1 = offsetMin(new Date(guess), tz);
  let t = guess - off1 * 60000;
  const off2 = offsetMin(new Date(t), tz);
  if (off2 !== off1) t = guess - off2 * 60000;
  return new Date(t);
}

/** Minutos desde la medianoche de la hora de pared de `tz` en ese instante. */
export function localMinutes(date, tz = BOOKING_TZ) {
  const p = partes(new Date(date), tz);
  return (+p.hour % 24) * 60 + +p.minute;
}

/** "YYYY-MM-DD" de ese instante en `tz`. */
export function localDateStr(date, tz = BOOKING_TZ) {
  const p = partes(new Date(date), tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "HH:MM" de ese instante en `tz`. */
export function localTimeStr(date, tz = BOOKING_TZ) {
  const p = partes(new Date(date), tz);
  return `${String(+p.hour % 24).padStart(2, "0")}:${p.minute}`;
}

/** [inicio, fin) del día de pared `fecha` en `tz`, como Dates (para filtrar en la base). */
export function dayRange(fecha, tz = BOOKING_TZ) {
  const [y, m, d] = String(fecha).split("-").map(Number);
  const sig = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return [zonedToDate(fecha, "00:00", tz), zonedToDate(sig, "00:00", tz)];
}

/** Instante con su offset: "2026-11-20T10:00:00-06:00" (para Google Calendar). */
export function toOffsetISO(date, tz = BOOKING_TZ) {
  const d = new Date(date);
  const off = offsetMin(d, tz);
  const signo = off < 0 ? "-" : "+";
  const abs = Math.abs(off);
  const p = partes(d, tz);
  return `${p.year}-${p.month}-${p.day}T${String(+p.hour % 24).padStart(2, "0")}:${p.minute}:${p.second}${signo}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Fecha y hora legibles en `tz`. */
export function formatoCita(date, tz = BOOKING_TZ) {
  const d = new Date(date);
  return {
    fecha: d.toLocaleDateString("es-MX", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }),
    hora: localTimeStr(d, tz),
  };
}
