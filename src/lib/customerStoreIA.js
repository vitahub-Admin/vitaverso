// Apoyo con IA para la búsqueda de la tienda de Mi Vitahub. No es un botón ni se anuncia:
// en cada búsqueda con texto (sus resultados van primero), Claude traduce lo que escribió el cliente
// (frases como "algo para dormir", sinónimos, nombres en inglés, errores) a términos del
// catálogo y una categoría, y con eso se busca igual que siempre.
//
// Solo arma la búsqueda: no responde, no recomienda ni receta. Los productos del profesional
// del paciente suben en los resultados. Límite diario por cliente (o por IP sin cuenta).
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { buscarPorTerminos, categorias, recomendadosDelProfesional } from "@/lib/customerStore";
import { supabase } from "@/lib/customerSupplements";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Rápido y barato: solo interpreta la búsqueda
const MODELO = "claude-haiku-5-5";

// Límite por día (en memoria de cada instancia: es un freno, no una cuenta exacta)
// Ahora va en todas las búsquedas con texto (la app busca al dejar de escribir), así que el
// límite es más amplio; al pasarlo, la búsqueda sigue con la normal
const LIMITE_CON_CUENTA = 120;
const LIMITE_INVITADO = 40;
const usos = new Map(); // clave → { dia, n }

// Interpretaciones ya hechas (la app busca mientras escriben y las frases se repiten entre
// clientes): no gastan IA ni cuentan para el límite
const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map(); // texto normalizado → { at, ia }

function permitir(clave, limite) {
  const dia = new Date().toISOString().slice(0, 10);
  const u = usos.get(clave);
  if (!u || u.dia !== dia) {
    if (usos.size > 5000) usos.clear();
    usos.set(clave, { dia, n: 1 });
    return true;
  }
  if (u.n >= limite) return false;
  u.n++;
  return true;
}

const ESQUEMA = jsonSchemaOutputFormat({
  type: "object",
  properties: {
    fuera_de_tema: { type: "boolean" },
    terminos: { type: "array", items: { type: "string" } },
    categoria: { type: "string" },
  },
  required: ["fuera_de_tema", "terminos", "categoria"],
  additionalProperties: false,
});

// Marcas del catálogo, para que la IA reconozca una marca aunque esté mal escrita ("nau" →
// NOW, "asent" → Ascent). Se leen una vez cada 6 h, no en cada búsqueda.
let marcasCache = { at: 0, lista: [] };
async function marcasDelCatalogo() {
  if (marcasCache.lista.length && marcasCache.at > Date.now() - CACHE_MS) return marcasCache.lista;
  const marcas = new Set();
  for (let desde = 0; desde < 20000; desde += 1000) {
    const { data, error } = await supabase
      .from("product_catalog")
      .select("brand")
      .eq("status", "ACTIVE")
      .not("brand", "is", null)
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (r.brand?.trim()) marcas.add(r.brand.trim());
    if ((data ?? []).length < 1000) break;
  }
  marcasCache = { at: Date.now(), lista: [...marcas].sort() };
  return marcasCache.lista;
}

function instrucciones(listaCategorias, listaMarcas) {
  return `Conviertes lo que un cliente de Vitahub (tienda de suplementos en México) escribe en el buscador en términos de búsqueda del catálogo.

Qué devolver:
- terminos: de 1 a 6 términos cortos para buscar en el nombre, marca, ingrediente o componente de los productos, en español como aparecerían en la etiqueta (por ejemplo "magnesio", "melatonina", "omega 3", "probiótico", "colágeno", "ashwagandha"). Corrige errores de escritura y traduce nombres en inglés o coloquiales. Si nombra una marca o producto concreto, inclúyelo tal cual. Si se parece a una de estas marcas del catálogo (aunque esté mal escrita o suene parecido, p. ej. "nau" → NOW Foods), devuelve la marca como está escrita aquí: ${listaMarcas}. Una palabra que no reconozcas puede ser una marca o un producto: devuélvela tal cual y no la marques fuera de tema.
- Abreviaturas comunes de salud: SOP = síndrome de ovario poliquístico (inositol, myo inositol), NAC = N-acetilcisteína, CoQ10 = coenzima Q10, NAD = NAD+, MSM = metilsulfonilmetano.
- categoria: una de estas categorías si alguna encaja claramente con lo que busca, o "" si ninguna: ${listaCategorias}.
- fuera_de_tema: true solo si lo que escribe claramente no tiene que ver con suplementos, vitaminas, nutrición, bienestar o cuidado personal; en ese caso terminos va vacío.

Si describe un síntoma o un objetivo, elige los ingredientes que suelen asociarse a ese objetivo de bienestar. Solo armas la búsqueda: no diagnosticas ni indicas qué debe tomar.`;
}

/**
 * Productos para una búsqueda con texto y los términos que armó la IA (el route los usa para
 * ordenar). Devuelve { productos: [], terminos: [] } si no aplica (fuera de tema, límite del
 * día, error o rechazo): nunca rompe la búsqueda normal.
 */
export async function buscarConIA({ q, user = null, ip = "sin-ip", limite = 24 }) {
  const nada = { productos: [], terminos: [] };
  const texto = String(q ?? "").trim().slice(0, 200);
  if (texto.length < 3 || !process.env.ANTHROPIC_API_KEY) return nada;
  const clave = texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

  try {
    // Los productos de su profesional suben; se piden mientras piensa la IA
    const delProfesional = recomendadosDelProfesional(user?.specialist_shopify_id, 50).catch(() => []);
    const [cats, marcas] = await Promise.all([categorias().catch(() => []), marcasDelCatalogo().catch(() => [])]);

    let ia = cache.get(clave)?.at > Date.now() - CACHE_MS ? cache.get(clave).ia : undefined;
    if (ia === undefined) {
      if (!permitir(user ? `u:${user.id}` : `ip:${ip}`, user ? LIMITE_CON_CUENTA : LIMITE_INVITADO)) return nada;
      const respuesta = await anthropic.messages.parse({
        model: MODELO,
        max_tokens: 2000,
        output_config: { effort: "low", format: ESQUEMA },
        system: instrucciones(cats.map((c) => c.nombre).join(", ") || "ninguna", marcas.join(", ") || "ninguna"),
        messages: [{ role: "user", content: texto }],
      });
      // Rechazo o respuesta cortada: no hay interpretación
      ia = respuesta.stop_reason === "end_turn" ? respuesta.parsed_output : null;
      if (cache.size > 2000) cache.clear();
      cache.set(clave, { at: Date.now(), ia });
    }
    if (!ia || ia.fuera_de_tema || !ia.terminos?.length) return nada;

    const nombresCat = new Set(cats.map((c) => c.nombre));
    const categoria = ia.categoria && nombresCat.has(ia.categoria) ? ia.categoria : null;
    const primero = new Set((await delProfesional).map((p) => String(p.productId)));
    const productos = await buscarPorTerminos({ terminos: ia.terminos, categoria, primero, limite });
    return { productos, terminos: ia.terminos };
  } catch (err) {
    console.error("[customerStoreIA]", err?.status ?? "", err?.message);
    return nada;
  }
}
