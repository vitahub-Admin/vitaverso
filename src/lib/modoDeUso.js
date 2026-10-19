// Horarios de toma y lectura del "modo de uso" del catálogo.
//
// Los recordatorios se arman con la rutina de comidas habitual en México: desayuno
// temprano, la COMIDA (la principal del día) a media tarde y la cena tarde.
// Cuando la receta del profesional no dice cuándo tomar algo (pasa en ~76% de los
// productos recetados), se usa el modo de uso del producto, que es texto libre:
// "Tomar 1 tableta con cada comida principal", "2 cápsulas antes de dormir"...
// Esta lectura es por palabras clave; es una sugerencia que el cliente confirma.

export const MOMENTO_HORA = {
  "En ayunas": "07:30",
  "Mañana": "08:00",
  "Con desayuno": "08:30",
  "Mediodía": "12:30",
  "Con almuerzo": "14:30", // en el armador "almuerzo" = la comida principal del día
  "Tarde": "17:30",
  "Con cena": "20:30",
  "Noche": "21:30",
  "Antes de dormir": "22:30",
};

// Si no hay momentos: repartir las tomas en las comidas
const POR_TOMAS = {
  1: ["Con desayuno"],
  2: ["Con desayuno", "Con cena"],
  3: ["Con desayuno", "Con almuerzo", "Con cena"],
  4: ["Con desayuno", "Mediodía", "Con almuerzo", "Con cena"],
};

export function horasDeMomentos(momentos) {
  return [...new Set(momentos.map((m) => MOMENTO_HORA[m]).filter(Boolean))].sort();
}

export function suggestedTimes(momentosList, tomasPorDia) {
  const desdeMomentos = horasDeMomentos(momentosList ?? []);
  if (desdeMomentos.length) return desdeMomentos;
  const n = Math.min(Math.max(1, Math.round(tomasPorDia || 1)), 4);
  return horasDeMomentos(POR_TOMAS[n]);
}

const NUMEROS = { una: 1, un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };
const num = (t) => (t ? (/^\d+$/.test(t) ? Number(t) : NUMEROS[t] ?? null) : null);

/**
 * Lee un texto de modo de uso. Devuelve lo que pudo entender, o null.
 * { momentos: ["Con desayuno", ...], tomas, cantidadPorToma, porDia }
 *   porDia = cantidad total al día (unidades) cuando se puede deducir
 */
export function leerModoDeUso(texto) {
  if (!texto) return null;
  const t = String(texto).toLowerCase().normalize("NFC");

  let momentos = [];
  if (/en ayunas|al despertar|antes del desayuno/.test(t)) momentos.push("En ayunas");
  if (/cada comida|con las comidas|en cada alimento|con cada alimento/.test(t)) {
    momentos.push("Con desayuno", "Con almuerzo", "Con cena");
  } else {
    if (/desayuno/.test(t)) momentos.push("Con desayuno");
    else if (/mañana/.test(t) && !momentos.includes("En ayunas")) momentos.push("Con desayuno");
    if (/comida principal|con la comida|antes de la comida|después de la comida/.test(t)) momentos.push("Con almuerzo");
    if (/por la tarde|en la tarde|y tarde|\(tarde|, tarde/.test(t)) momentos.push("Tarde");
    if (/\bcena\b/.test(t)) momentos.push("Con cena");
    if (/antes de dormir|antes de acostarse|al acostarse/.test(t)) momentos.push("Antes de dormir");
    else if (/por la noche|en la noche/.test(t) && !momentos.includes("Con cena")) momentos.push("Noche");
  }
  momentos = [...new Set(momentos)];
  // "en la mañana o con la comida principal": son alternativas, no dos tomas
  const esAlternativa = / o (con |en |por |antes |después |al )/.test(t) && !/veces al d|tomas/.test(t);
  if (esAlternativa && momentos.length > 1) momentos = momentos.slice(0, 1);

  // "2 veces al día", "dos veces al día"
  const veces = t.match(/(\d+|una|dos|tres|cuatro)\s+veces?\s+al\s+d[ií]a/);
  // "distribuidas en dos tomas"
  const enTomas = t.match(/(\d+|dos|tres|cuatro)\s+tomas/);
  let tomas = veces ? num(veces[1]) : enTomas ? num(enTomas[1]) : null;
  if (!tomas && momentos.length) tomas = momentos.length;

  // "Tomar 2 cápsulas", "tomar una tableta"
  const cant = t.match(/tomar\s+(\d+|una|un|uno|dos|tres|cuatro)\s+(c[aá]psulas?|tabletas?|softgels?|gomitas?|perlas?|comprimidos?|sobres?|medidas?|cucharadas?|cucharaditas?|scoops?|gotas?)/);
  const cantidadPorToma = cant ? num(cant[1]) : null;
  // "al día" junto a la cantidad = total diario; si dice "N veces al día", es por toma
  const totalDiario = cant && !veces && /al\s+d[ií]a/.test(t.slice(cant.index, cant.index + 60));
  let porDia = null;
  if (cantidadPorToma) porDia = totalDiario ? cantidadPorToma : cantidadPorToma * (tomas || 1);

  // Si dio el total diario y no hay momentos, una sola toma
  if (!tomas) tomas = totalDiario || cantidadPorToma ? 1 : null;
  if (!momentos.length && tomas) momentos = POR_TOMAS[Math.min(tomas, 4)] ?? [];

  if (!momentos.length && !porDia) return null;
  return { momentos, tomas: tomas ?? momentos.length ?? 1, cantidadPorToma, porDia };
}

/**
 * Saca el "Modo de uso" de la descripción HTML de un producto de Shopify.
 *
 * Las descripciones del catálogo vienen en bloques con un encabezado y su
 * párrafo ("Modo de uso" → "Tomar 1 cápsula al día…", seguido de "Advertencias
 * y contraindicaciones"). Se toma lo que hay entre ese encabezado y el
 * siguiente, y se devuelve como texto plano: en la ficha, el PDF y la app se
 * muestra con su propio estilo, y arrastrar HTML ajeno a tres lugares distintos
 * es pedir que alguno se vea roto.
 *
 * Devuelve null si el producto no lo trae. Mejor vacío que inventado: es una
 * indicación de salud y no se rellena con un genérico.
 */

const ENCABEZADO = /<(h[1-6]|strong|b)[^>]*>\s*(modo\s+de\s+uso(\s+recomendado)?|forma\s+de\s+uso|modo\s+de\s+empleo|c[oó]mo\s+tomarlo|sugerencia\s+de\s+uso)\s*:?\s*<\/\1>/i;
const SIGUIENTE_ENCABEZADO = /<(h[1-6])[^>]*>|<(strong|b)[^>]*>\s*(advertencias?|contraindicaciones?|ingredientes|beneficios|precauciones|almacenamiento|informaci[oó]n)/i;

const ENTIDADES = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&aacute;': 'á', '&eacute;': 'é', '&iacute;': 'í', '&oacute;': 'ó', '&uacute;': 'ú', '&ntilde;': 'ñ' };

function aTexto(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|li|div)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z#0-9]+;/gi, e => ENTIDADES[e.toLowerCase()] ?? ' ')
    // Algunas descripciones se redactaron con markdown y quedaron los asteriscos
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extraerModoDeUso(html) {
  if (!html || typeof html !== 'string') return null;

  const m = ENCABEZADO.exec(html);
  if (!m) return null;

  const resto = html.slice(m.index + m[0].length);
  const fin   = resto.search(SIGUIENTE_ENCABEZADO);
  const texto = aTexto(fin >= 0 ? resto.slice(0, fin) : resto);

  // Un encabezado sin nada debajo, o un resto absurdamente largo (el encabezado
  // estaba al final de otra sección y arrastró media descripción), no sirve.
  if (texto.length < 10 || texto.length > 600) return null;
  return texto;
}
