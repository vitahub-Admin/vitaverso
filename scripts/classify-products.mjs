/**
 * classify-products.mjs
 * Propone `product_type` y `category` (Taxonomía Estándar de Shopify) para todo el catálogo.
 *
 * NO escribe nada en Shopify — solo lee y genera un CSV para que lo revises a ojo.
 * El CSV aprobado lo consume después scripts/import-taxonomy.mjs
 *
 * Categorías: subárbol hb-1-9-6 "Health & Beauty > Health Care > Fitness & Nutrition
 * > Vitamins & Supplements" de la taxonomía de Shopify (34 nodos).
 *
 * Uso:
 *   node scripts/classify-products.mjs
 *   node scripts/classify-products.mjs --out clasificacion.csv
 *   node scripts/classify-products.mjs --limit 50
 *   node scripts/classify-products.mjs --only-review     Solo los que necesitan revisión
 *   node scripts/classify-products.mjs --all-status      Incluye borradores y archivados
 *
 * Flags:
 *   --out <path>      CSV de salida            (default: clasificacion_<fecha>.csv)
 *   --limit <N>       Procesar solo N productos (para pruebas)
 *   --only-review     Exporta solo filas con needs_review = si
 *   --all-status      No filtra por status:active
 *   --from-json <p>   Clasifica desde un JSON local en vez de llamar a Shopify
 *                     (formato de /collections/all/products.json — para probar reglas)
 */

import { readFileSync, writeFileSync } from "fs";

// ── .env ──────────────────────────────────────────────────────────────────────
function loadEnv(path = ".env") {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split("\n")
        .filter(l => l.includes("=") && !l.startsWith("#"))
        .map(l => {
          const eq  = l.indexOf("=");
          const key = l.slice(0, eq).trim();
          const val = l.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
          return [key, val];
        })
    );
  } catch {
    console.error("❌  No se encontró .env — ejecuta desde la carpeta vitaverse/");
    process.exit(1);
  }
}

const env     = loadEnv();
const GQL_URL = `https://${env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;
const TOKEN   = env.SHOPIFY_ACCESS_TOKEN;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function gql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body:    JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join(" | "));
  return json.data;
}

// ── Taxonomía: subárbol Vitamins & Supplements ───────────────────────────────
const GID = id => `gid://shopify/TaxonomyCategory/${id}`;

const CAT = {
  ROOT:        ["hb-1-9-6",       "Vitamins & Supplements"],
  AMINO:       ["hb-1-9-6-1",     "Amino Acids"],
  BCAA:        ["hb-1-9-6-1-1",   "Branched-Chain Amino Acid (BCAA)"],
  AMINO_ONE:   ["hb-1-9-6-1-2",   "Single Amino Acid Supplements"],
  COLLAGEN:    ["hb-1-9-6-2",     "Collagen"],
  CREATINE:    ["hb-1-9-6-3",     "Creatine"],
  DIGEST:      ["hb-1-9-6-4",     "Digestive Supplements"],
  CHARCOAL:    ["hb-1-9-6-4-1",   "Activated Charcoal & Binders"],
  COLON:       ["hb-1-9-6-4-2",   "Colon Cleanses"],
  ENZYMES:     ["hb-1-9-6-4-3",   "Digestive Enzymes"],
  FIBER:       ["hb-1-9-6-4-4",   "Prebiotics & Fiber"],
  PROBIOTIC:   ["hb-1-9-6-4-5",   "Probiotics"],
  HERBAL:      ["hb-1-9-6-5",     "Herbal Supplements"],
  MINERALS:    ["hb-1-9-6-6",     "Minerals"],
  CALCIUM:     ["hb-1-9-6-6-1",   "Calcium"],
  IRON:        ["hb-1-9-6-6-2",   "Iron"],
  MAGNESIUM:   ["hb-1-9-6-6-3",   "Magnesium"],
  MULTIMIN:    ["hb-1-9-6-6-4",   "Multimineral Supplements"],
  ZINC:        ["hb-1-9-6-6-5",   "Zinc"],
  MULTIVIT:    ["hb-1-9-6-7",     "Multivitamin Supplements"],
  PROTEIN:     ["hb-1-9-6-8",     "Protein Supplements"],
  VITAMINS:    ["hb-1-9-6-9",     "Single Vitamins"],
  COQ10:       ["hb-1-9-6-9-1",   "CoQ10"],
  VIT_A:       ["hb-1-9-6-9-2",   "Vitamin A"],
  VIT_B:       ["hb-1-9-6-9-3",   "Vitamin B"],
  VIT_C:       ["hb-1-9-6-9-4",   "Vitamin C"],
  VIT_D:       ["hb-1-9-6-9-5",   "Vitamin D"],
  VIT_E:       ["hb-1-9-6-9-6",   "Vitamin E"],
  VIT_K:       ["hb-1-9-6-9-7",   "Vitamin K"],
  CBD:         ["hb-1-9-6-10",    "CBD Supplements"],
  OMEGA:       ["hb-1-9-6-11",    "Omega Fatty Acids"],
  SLEEP:       ["hb-1-9-6-12",    "Sleep Supplements"],

  // Tópicos — fuera del árbol de suplementos. Son 10 productos en todo el
  // catálogo, confirmados como de uso externo. Mandarlos a hb-1-9-6 haría que
  // Merchant Center los rechace.
  OIL_SINGLE:  ["hb-3-21-1",      "Essential Oil Singles"],
  OIL_BLEND:   ["hb-3-21-2",      "Essential Oil Blends"],
  BODY_OIL:    ["hb-3-2-9-3",     "Body Oil"],
  SKIN_CARE:   ["hb-3-2-9",       "Skin Care"],
  HAIR_CARE:   ["hb-3-10",        "Hair Care"],
};

// product_type en español — es lo que ve el cliente en filtros y colecciones.
// Los valores salen del vocabulario de vocabulario.json, para que las reglas y
// el clasificador con IA hablen el mismo idioma y no haya que unificar después.
const TYPE_ES = {
  AMINO: "Aminoácidos y BCAA",       BCAA: "Aminoácidos y BCAA",
  AMINO_ONE: "Aminoácidos y BCAA",   COLLAGEN: "Colágeno",
  CREATINE: "Creatina",              DIGEST: "Digestivos y confort intestinal",
  CHARCOAL: "Detox y apoyo hepático", COLON: "Digestivos y confort intestinal",
  ENZYMES: "Enzimas digestivas",     FIBER: "Fibra y prebióticos",
  PROBIOTIC: "Probióticos",          HERBAL: "Hierbas y extractos botánicos",
  MINERALS: "Otros minerales y multiminerales",
  MULTIMIN: "Otros minerales y multiminerales",
  CALCIUM: "Calcio",                 IRON: "Hierro",
  MAGNESIUM: "Magnesio",             ZINC: "Zinc",
  MULTIVIT: "Multivitamínicos",      PROTEIN: "Proteínas en polvo y barras",
  VITAMINS: "Multivitamínicos",      COQ10: "CoQ10 y energía celular",
  VIT_A: "Vitamina A y E",           VIT_B: "Complejo B y B12",
  VIT_C: "Vitamina C",               VIT_D: "Vitamina D y K",
  VIT_E: "Vitamina A y E",           VIT_K: "Vitamina D y K",
  CBD: "Hierbas y extractos botánicos",
  OMEGA: "Omega 3 y aceites de pescado",
  // ROOT es el fallback de "no hay señal": dejarlo vacío es honesto.
  // Esas filas salen en confianza baja y las resuelve la pasada con IA.
  SLEEP: "Sueño y relajación",       ROOT: "",
  OIL_SINGLE: "Aceites esenciales y aromaterapia",
  OIL_BLEND:  "Aceites esenciales y aromaterapia",
  BODY_OIL:   "Cuidado de la piel y cosmética",
  SKIN_CARE:  "Cuidado de la piel y cosmética",
  HAIR_CARE:  "Cuidado de la piel y cosmética",
};

// ── Normalización ─────────────────────────────────────────────────────────────
const norm = s => (s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/\s+/g, " ");

const has = (t, rx) => rx.test(t);

// ── Diccionarios para las reglas de conteo ───────────────────────────────────
const MINERAL_RX = {
  MAGNESIUM: /\bmagnesio\b|\bmagnesium\b/,
  ZINC:      /\bzinc\b|\bcinc\b/,
  IRON:      /\bhierro\b|\biron\b/,
  CALCIUM:   /\bcalcio\b|\bcalcium\b/,
  OTHER:     /\bselenio\b|\bcromo\b|\byodo\b|\bpotasio\b|\bcobre\b|\bmanganeso\b|\bmolibdeno\b|\bboro\b/,
};

const VITAMIN_RX = {
  VIT_A: /\bvitamina a\b|\bvitamin a\b|\bretinol\b|\bbetacaroteno\b/,
  VIT_B: /\bvitamina b|\bvitamin b|\bcomplejo b\b|\bb-?12\b|\bb-?6\b|\bb-?1\b|\bbiotina\b|\bfolato\b|\bacido folico\b|\bniacina\b|\btiamina\b|\briboflavina\b/,
  VIT_C: /\bvitamina c\b|\bvitamin c\b|\bacido ascorbico\b/,
  VIT_D: /\bvitamina d\b|\bvitamin d\b|\bd-?3\b|\bcolecalciferol\b/,
  VIT_E: /\bvitamina e\b|\bvitamin e\b|\btocoferol\b/,
  VIT_K: /\bvitamina k\b|\bvitamin k\b|\bk-?2\b|\bmenaquinona\b/,
};

const AMINO_RX = /\bl-?teanina\b|\bl-?glutamina\b|\bl-?arginina\b|\bl-?lisina\b|\bl-?carnitina\b|\btaurina\b|\bglicina\b|\btriptofano\b|\b5-?htp\b|\bnac\b|\bn-?acetil\b|\bgaba\b|\bcitrulina\b|\bbeta-?alanina\b/;

const countHits = (t, dict) => Object.entries(dict).filter(([, rx]) => rx.test(t)).map(([k]) => k);

// MINERAL_RX.OTHER agrupa minerales sin nodo propio → cae al nodo Minerals
const toCatKey = k => (k === "OTHER" ? "MINERALS" : k);

// Cuál de dos claves aparece primero en el texto — desempata combos de 1+1
const firstInText = (t, dictA, keyA, dictB, keyB) => {
  const ia = t.search(dictA[keyA]);
  const ib = t.search(dictB[keyB]);
  return ia === -1 ? keyB : ib === -1 ? keyA : (ia <= ib ? keyA : keyB);
};

// ── Clasificador ──────────────────────────────────────────────────────────────
// La identidad del ingrediente vive en el TÍTULO. Los tags de Vitahub son
// atributos ("Sin gluten") y beneficios ("Sistema inmunitario"), y ensucian:
// un producto de colina quedaba como multivitamínico por un tag heredado.
// Por eso: primera pasada solo con el título; si no hay señal, segunda pasada
// con título + tags y confianza degradada.
function classify(product) {
  const first = classifyText(norm(product.title));
  if (first.rule !== "sin-senal") return first;

  const second = classifyText(norm(`${product.title} ${(product.tags || []).join(" ")}`));
  if (second.rule === "sin-senal") return second;
  return { ...second, rule: `${second.rule} (por tag)`, confidence: "media" };
}

// Devuelve { key, type?, rule, confidence } — el orden de los bloques ES la prioridad.
function classifyText(t) {

  // 0a · No es un producto físico de suplementación
  if (has(t, /\bconsulta\b|\basesoria\b|\bcita\b|\btest genetico\b|\bkit de prueba\b|\bestudio\b|\banalisis clinico\b|\bgift ?card\b|\btarjeta de regalo\b|\bmembresia\b|\bsuscripcion\b|\bplan de\b/))
    return { key: null, rule: "no-suplemento", confidence: "revisar" };

  // 0b · Tópicos — van a Personal Care, NUNCA al subárbol de suplementos:
  // Merchant Center rechaza un cosmético categorizado como suplemento.
  // Son 10 productos en el catálogo, revisados uno por uno.
  if (has(t, /\bshampoo\b|\bchampu\b|acondicionador/))
    return { key: "HAIR_CARE",  rule: "topico-capilar", confidence: "alta" };
  if (has(t, /\bserum\b|\bcrema\b|\bmascarilla\b|\bloci[oó]n\b|healthy skin/))
    return { key: "SKIN_CARE",  rule: "topico-piel", confidence: "alta" };
  if (has(t, /\bjojoba\b|aceite corporal|\bmasaje\b/))
    return { key: "BODY_OIL",   rule: "topico-aceite-corporal", confidence: "alta" };
  if (has(t, /mezcla de aceites esenciales|aceites esenciales.*(mezcla|blend)/))
    return { key: "OIL_BLEND",  rule: "topico-mezcla-esencial", confidence: "alta" };
  if (has(t, /\baceite esencial|essential oils?\b|\baromaterapia\b|\bdifusor\b|arbol de te|\broll-?on\b/))
    return { key: "OIL_SINGLE", rule: "topico-aceite-esencial", confidence: "alta" };

  // 1 · Formas propias que no deben caer en reglas de ingrediente
  if (has(t, /\bcreatina\b|\bcreatine\b/))                      return { key: "CREATINE", rule: "creatina", confidence: "alta" };
  if (has(t, /\bcolageno\b|\bcollagen\b/))                      return { key: "COLLAGEN", rule: "colageno", confidence: "alta" };
  if (has(t, /\bcbd\b|\bcannabidiol\b/))                        return { key: "CBD",      rule: "cbd",      confidence: "alta" };
  if (has(t, /\bkratom\b/))                                      return { key: "HERBAL",   rule: "kratom",   confidence: "alta" };

  // 2 · Multi-ingrediente — ANTES que los ingredientes sueltos
  const mins = countHits(t, MINERAL_RX);
  const vits = countHits(t, VITAMIN_RX);

  if (has(t, /\bmultivitamin|\bmulti-?vitamin|\bmultivitaminico\b/))
    return { key: "MULTIVIT", rule: "multivitaminico-explicito", confidence: "alta" };
  if (has(t, /\bmultimineral\b/))
    return { key: "MULTIMIN", rule: "multimineral-explicito", confidence: "alta" };

  if (mins.length + vits.length >= 3)
    return { key: "MULTIVIT", rule: `combo-${mins.length}min-${vits.length}vit`, confidence: "media" };
  if (mins.length >= 2 && vits.length === 0)
    return { key: "MULTIMIN", rule: `multi-mineral-${mins.join("+")}`, confidence: "alta" };
  if (vits.length >= 2 && mins.length === 0)
    return { key: "MULTIVIT", rule: `multi-vitamina-${vits.join("+")}`, confidence: "alta" };
  if (mins.length === 1 && vits.length === 1) {
    // ej. "Vitamina C con Zinc" — gana el que aparece primero en el título
    const winner = firstInText(t, MINERAL_RX, mins[0], VITAMIN_RX, vits[0]);
    return { key: toCatKey(winner), rule: `combo-1+1 (${mins[0]}/${vits[0]})`, confidence: "media" };
  }

  // 3 · Deporte
  if (has(t, /\bbcaa\b|aminoacidos ramificados|\bleucina\b.*\bvalina\b/))
    return { key: "BCAA", rule: "bcaa", confidence: "alta" };
  if (has(t, /\bproteina\b|\bprotein\b|\bwhey\b|\bcaseina\b|\bisolate\b|\baislado de proteina\b/))
    return { key: "PROTEIN", rule: "proteina", confidence: "alta" };

  // 4 · Omega y ácidos grasos (incluye los aceites que SÍ son ácidos grasos)
  if (has(t, /\bomega\b|aceite de pescado|\bfish oil\b|\bkrill\b|\bdha\b|\bepa\b|\baceite de linaza\b|\bflaxseed\b/))
    return { key: "OMEGA", rule: "omega", confidence: "alta" };
  if (has(t, /higado de bacalao|\bcod liver\b|\bonagra\b|evening primrose|\bborraja\b|\bborage\b|\bgla\b/))
    return { key: "OMEGA", rule: "aceite-acido-graso", confidence: "alta" };

  // 5 · Sueño
  if (has(t, /\bmelatonina\b|\bmelatonin\b/))
    return { key: "SLEEP", rule: "melatonina", confidence: "alta" };

  // 6 · Digestivo
  if (has(t, /\bprobiotic|\blactobacil|\bbifidobact|\bufc\b|\bcfu\b|\bakkermansia\b|\bsaccharomyces\b|\bmicrobiota\b/))
    return { key: "PROBIOTIC", rule: "probiotico", confidence: "alta" };
  if (has(t, /\bprebiotic|\bfibra\b|\bpsyllium\b|\binulina\b|\bglucomanano\b/))
    return { key: "FIBER", rule: "fibra-prebiotico", confidence: "alta" };
  if (has(t, /\benzima|\bbromelina\b|\bpapaina\b|\blipasa\b|\bamilasa\b|\bproteasa\b/))
    return { key: "ENZYMES", rule: "enzimas", confidence: "alta" };
  if (has(t, /carbon activado|\bcharcoal\b|\bbentonita\b/))
    return { key: "CHARCOAL", rule: "carbon-activado", confidence: "alta" };
  if (has(t, /limpieza de colon|\bcolon cleanse\b|\bdetox intestinal\b/))
    return { key: "COLON", rule: "colon", confidence: "media" };

  // 7 · Mineral único
  if (mins.length === 1 && mins[0] !== "OTHER")
    return { key: mins[0], rule: `mineral-${mins[0]}`, confidence: "alta" };
  if (mins.length === 1 && mins[0] === "OTHER")
    return { key: "MINERALS", rule: "mineral-otro", confidence: "media" };

  // 8 · Vitamina única
  if (has(t, /\bcoq-?10\b|\bcoenzima q\b|\bubiquinol\b/))
    return { key: "COQ10", rule: "coq10", confidence: "alta" };

  // 8/9 · Vitamina única vs aminoácido: gana el que aparece PRIMERO en el título.
  // "5-HTP + Vitamina B6" es un producto de 5-HTP con la B6 como cofactor,
  // no una vitamina B.
  const iAmino = t.search(AMINO_RX);
  const iVit   = vits.length === 1 ? t.search(VITAMIN_RX[vits[0]]) : -1;

  if (iAmino !== -1 && iVit !== -1)
    return iAmino < iVit
      ? { key: "AMINO_ONE", rule: `aminoacido-antes-que-${vits[0]}`, confidence: "media" }
      : { key: vits[0],     rule: `vitamina-${vits[0]}-antes-que-aminoacido`, confidence: "media" };

  if (iVit   !== -1) return { key: vits[0],     rule: `vitamina-${vits[0]}`,     confidence: "alta" };
  if (iAmino !== -1) return { key: "AMINO_ONE", rule: "aminoacido-individual", confidence: "alta" };

  // 9b · Nutrientes sin nodo propio en la taxonomía.
  // La categoría cae al nodo raíz, pero el product_type sí distingue —
  // por eso los dos campos existen por separado.
  // Solo moléculas nombradas — la palabra "antioxidante" suelta aparece como
  // beneficio en medio catálogo y arrastraba botánicos enteros.
  if (has(t, /\bluteina\b|\bzeaxantina\b/))
    return { key: "ROOT", type: "Salud de la vista", rule: "vista", confidence: "media" };
  if (has(t, /\bresveratrol\b|\bpterostilbene\b|\bnmn\b|nicotinamida ribosido|\bespermidina\b|\bfisetina\b/))
    return { key: "ROOT", type: "Longevidad: NAD+, NMN y resveratrol", rule: "longevidad", confidence: "media" };
  if (has(t, /\bastaxantina\b|\bquercetina\b|\bglutation\b|\bglutathione\b/))
    return { key: "ROOT", type: "Antioxidantes", rule: "antioxidante", confidence: "media" };
  if (has(t, /acido hialuronico|\bmsm\b/))
    return { key: "ROOT", type: "Belleza: cabello, piel y uñas", rule: "belleza", confidence: "media" };
  if (has(t, /\bmct\b|trigliceridos de cadena media|aceite de coco|acido alfa lipoico|\binositol\b/))
    return { key: "ROOT", type: "Control de peso y metabolismo", rule: "metabolismo", confidence: "media" };
  if (has(t, /\bcolina\b|\bfosfatidilserina\b/))
    return { key: "ROOT", type: "Memoria y concentración", rule: "cognitivo", confidence: "media" };

  // 10 · Herbal / botánico
  if (has(t, /\bashwagandha\b|\bcurcuma\b|\bcurcumin\b|\bginkgo\b|\bginseng\b|\bmaca\b|\bmoringa\b|\bequinacea\b|\bvaleriana\b|\bberberina\b|\bboswellia\b|\brhodiola\b|\bcardo mariano\b|\bmilk thistle\b|\bsaw palmetto\b|\bdiente de leon\b|\bmanzanilla\b|\bjengibre\b|\bajo\b|\bhierba\b|\bherbal\b|\bextracto de\b|\bbotanico\b|\bplanta\b|\bhongo\b|\breishi\b|\bmelena de leon\b|\bcordyceps\b|\bspirulina\b|\bchlorella\b/))
    return { key: "HERBAL", rule: "herbal", confidence: "media" };

  // 11 · Sin señal — cae al nodo raíz y se marca para revisión
  return { key: "ROOT", rule: "sin-senal", confidence: "baja" };
}

// ── CSV ───────────────────────────────────────────────────────────────────────
const esc = v => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCSV = (headers, rows) =>
  [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");

// ── Traer catálogo ────────────────────────────────────────────────────────────
const PRODUCTS_QUERY = /* graphql */ `
  query Products($after: String, $q: String) {
    products(first: 250, after: $after, query: $q) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          handle
          title
          vendor
          productType
          status
          tags
          category { id fullName }
        }
      }
    }
  }
`;

async function fetchAllProducts(q) {
  const out = [];
  let after = null;
  process.stderr.write(`\n🔍  Trayendo catálogo de Shopify…\n`);
  while (true) {
    const data = await gql(PRODUCTS_QUERY, { after, q });
    const conn = data.products;
    out.push(...conn.edges.map(e => e.node));
    process.stderr.write(`   ${out.length} productos…\r`);
    if (!conn.pageInfo.hasNextPage) break;
    after = conn.pageInfo.endCursor;
    await sleep(200);
  }
  process.stderr.write(`   ✅  ${out.length} productos leídos\n`);
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  const flag = n => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : null; };
  const hasFlag = n => args.includes(n);

  const limit      = flag("--limit") ? Number(flag("--limit")) : null;
  const onlyReview = hasFlag("--only-review");
  const allStatus  = hasFlag("--all-status");
  const fromJson   = flag("--from-json");
  const outPath    = flag("--out") || `clasificacion_${new Date().toISOString().slice(0, 10)}.csv`;

  let products;
  if (fromJson) {
    // Modo offline: JSON con forma de products.json (tags como array, id numérico)
    const raw = JSON.parse(readFileSync(fromJson, "utf8"));
    const arr = Array.isArray(raw) ? raw : raw.products;
    products = arr.map(p => ({
      id:          `gid://shopify/Product/${p.id}`,
      handle:      p.handle,
      title:       p.title,
      vendor:      p.vendor,
      productType: p.product_type || "",
      status:      "ACTIVE",
      tags:        Array.isArray(p.tags) ? p.tags : String(p.tags || "").split(",").map(s => s.trim()),
      category:    null,
    }));
    process.stderr.write(`\n📂  Modo offline — ${products.length} productos desde ${fromJson}\n`);
  } else {
    if (!env.SHOPIFY_STORE || !TOKEN) {
      console.error("❌  Faltan SHOPIFY_STORE o SHOPIFY_ACCESS_TOKEN en .env");
      process.exit(1);
    }
    products = await fetchAllProducts(allStatus ? null : "status:active");
  }
  if (limit) {
    products = products.slice(0, limit);
    process.stderr.write(`🧪  Modo prueba — solo ${limit} productos\n`);
  }

  // — Clasificar —
  const rows = products.map(p => {
    const { key, type, rule, confidence } = classify(p);
    if (key && !CAT[key]) throw new Error(`Regla "${rule}" devolvió una clave sin nodo: ${key}`);
    const [catId, catName] = key ? CAT[key] : [null, null];
    // `type` gana sobre el nombre del nodo: product_type puede ser más fino que la taxonomía
    const productType = type || (key ? TYPE_ES[key] : "");
    const needsReview = confidence !== "alta";
    return {
      product_id:              p.id.replace("gid://shopify/Product/", ""),
      handle:                  p.handle,
      title:                   p.title,
      vendor:                  p.vendor,
      status:                  p.status,
      tags:                    (p.tags || []).join(" | "),
      current_product_type:    p.productType || "",
      current_category:        p.category?.fullName || "",
      suggested_product_type:  productType,
      suggested_category_id:   catId ? GID(catId) : "",
      suggested_category_name: catName || "",
      rule,
      confidence,
      needs_review:            needsReview ? "si" : "no",
    };
  });

  // — Resumen —
  const byCat  = {};
  const byConf = { alta: 0, media: 0, baja: 0, revisar: 0 };
  for (const r of rows) {
    const k = r.suggested_product_type || "(sin categoría — revisar)";
    byCat[k] = (byCat[k] || 0) + 1;
    byConf[r.confidence]++;
  }

  process.stderr.write(`\n📊  Clasificación propuesta\n`);
  Object.entries(byCat).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => process.stderr.write(`   ${String(v).padStart(5)}  ${k}\n`));

  const total = rows.length;
  const auto  = byConf.alta;
  process.stderr.write(`\n   Confianza alta:  ${String(auto).padStart(5)}  (${Math.round(auto / total * 100)}%) — listos para importar\n`);
  process.stderr.write(`   Confianza media: ${String(byConf.media).padStart(5)}  — revisar por muestreo\n`);
  process.stderr.write(`   Confianza baja:  ${String(byConf.baja).padStart(5)}  — cayeron al nodo raíz\n`);
  process.stderr.write(`   No suplemento:   ${String(byConf.revisar).padStart(5)}  — necesitan categoría fuera de hb-1-9-6\n`);

  // — Escribir CSV —
  const headers = Object.keys(rows[0]);
  const final   = onlyReview ? rows.filter(r => r.needs_review === "si") : rows;
  writeFileSync(outPath, "﻿" + toCSV(headers, final), "utf8");

  process.stderr.write(`\n✅  ${final.length} filas → ${outPath}\n`);
  process.stderr.write(`   Revisá la columna suggested_product_type y corregí lo que haga falta.\n`);
  process.stderr.write(`   Después: node scripts/import-taxonomy.mjs --file ${outPath}\n`);
  process.stderr.write(`   (corre en seco por defecto — escribe solo con --execute)\n\n`);
})().catch(e => { console.error("\n❌  Error:", e.message); process.exit(1); });
