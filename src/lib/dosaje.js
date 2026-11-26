// Pauta de toma por momento del día.
//
// Antes la dosis se guardaba como "una cantidad por toma" + "una lista de
// momentos", y todo multiplicaba (cantidad × momentos): poner 3 y marcar tres
// momentos daba 9 al día, y no se podía repartir distinto (2 en la mañana, 1 en
// la noche).
//
// Ahora cada momento lleva su propia cantidad: `tomas = { Mañana: 2, Noche: 1 }`,
// en UNIDADES físicas (cápsulas, ml, gotas…), y el total del día es la suma.
// Nada se multiplica.
//
// Lo viejo sigue valiendo: un registro sin `tomas` se lee como antes
// (cantidad en dosis × unidades por dosis × número de momentos).

// Los cinco momentos que se ofrecen. "Antes de dormir" se muestra como "Al dormir".
export const MOMENTOS_TOMA = ["Mañana", "Mediodía", "Tarde", "Noche", "Antes de dormir"];
export const ETIQUETA_MOMENTO = { "Antes de dormir": "Al dormir" };

/** Unidades físicas que trae una dosis del fabricante (2 cápsulas, 5 ml…). */
export function unidadesPorDosis(meta) {
  const n = Number(meta?.dosis);
  return n > 0 ? n : 1;
}

function limpiar(tomas) {
  const out = {};
  for (const [k, v] of Object.entries(tomas || {})) {
    const n = Number(v);
    if (n > 0) out[k] = n;
  }
  return out;
}

/** Unidades al día de una pauta. */
export function totalTomas(tomas) {
  return Object.values(limpiar(tomas)).reduce((a, b) => a + b, 0);
}

/** Orden de los momentos: primero los cinco habituales, después cualquier otro que ya traiga el registro. */
export function momentosOrdenados(tomas) {
  const claves = Object.keys(limpiar(tomas));
  return [
    ...MOMENTOS_TOMA.filter(m => claves.includes(m)),
    ...claves.filter(m => !MOMENTOS_TOMA.includes(m)),
  ];
}

/** Pauta por defecto: una dosis del fabricante por la mañana. */
export function tomasPorDefecto(meta) {
  return { Mañana: unidadesPorDosis(meta) };
}

/** Lo guardado en un carrito (viejo o nuevo) → pauta por momento. */
export function tomasDeDosage(dosage, meta) {
  if (dosage?.tomas && typeof dosage.tomas === "object") return limpiar(dosage.tomas);
  const momentos = Array.isArray(dosage?.momentos) && dosage.momentos.length
    ? dosage.momentos
    : (dosage?.momento ? [dosage.momento] : []);
  const porToma = (Number(dosage?.amount) || 1) * unidadesPorDosis(meta ?? dosage?.meta);
  if (!momentos.length) return { Mañana: porToma };
  return Object.fromEntries(momentos.map(m => [m, porToma]));
}

/**
 * Pauta → el objeto `dosage` que guarda el carrito. Además de `tomas` llena los
 * campos de siempre (amount, momentos) para que lo que todavía los lea no se rompa.
 */
export function dosageDesdeTomas({ tomas, unit, meta, acompanamiento = "", nota = "" }) {
  const limpias = limpiar(tomas);
  const momentos = momentosOrdenados(limpias);
  const mayor = Math.max(0, ...Object.values(limpias));
  const amount = Number((mayor / unidadesPorDosis(meta)).toFixed(2)) || 1;
  return { amount, unit, momentos, tomas: limpias, acompanamiento, nota, meta: meta ?? null };
}

/** Unidades al día de un dosage, nuevo o viejo. */
export function unidadesPorDia(dosage, meta) {
  if (dosage?.tomas) return totalTomas(dosage.tomas);
  const momentos = Array.isArray(dosage?.momentos) ? dosage.momentos.length : 0;
  return (Number(dosage?.amount) || 1) * unidadesPorDosis(meta ?? dosage?.meta) * Math.max(1, momentos);
}

const ABREV = [
  [/^c[aá]psula/, "cáps."], [/^tableta/, "tabs."], [/^softgel/, "softgels"], [/^gota/, "gotas"],
  [/^cucharada/, "cdas."], [/^sobre/, "sobres"], [/^probi[oó]tico/, "probs."], [/^unidad/, "uds."],
];

/** Unidad corta para el botón de un momento: "2 cáps." */
export function abreviarUnidad(unit = "") {
  const u = String(unit).trim().toLowerCase();
  if (!u) return "";
  for (const [re, txt] of ABREV) if (re.test(u)) return txt;
  return u.split(/\s+/)[0];
}
