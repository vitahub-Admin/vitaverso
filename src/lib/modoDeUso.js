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
