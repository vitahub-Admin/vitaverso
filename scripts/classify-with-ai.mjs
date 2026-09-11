/**
 * classify-with-ai.mjs
 * Segunda pasada sobre los casos que las reglas de classify-products.mjs no
 * resolvieron, usando Claude con rol de nutricionista clínico.
 *
 * Lee el CSV de classify-products.mjs, toma las filas de confianza baja/media,
 * y devuelve el MISMO formato de CSV — así import-taxonomy.mjs lo consume sin
 * cambios.
 *
 * No escribe nada en Shopify.
 *
 * Uso:
 *   node scripts/classify-with-ai.mjs --file clasificacion.csv
 *   node scripts/classify-with-ai.mjs --file clasificacion.csv --limit 40     (probar)
 *   node scripts/classify-with-ai.mjs --file clasificacion.csv --confidence baja
 *   node scripts/classify-with-ai.mjs --file clasificacion.csv --out revisadas.csv
 *
 * Flags:
 *   --file <path>         CSV de classify-products.mjs (obligatorio)
 *   --out <path>          CSV de salida (default: <file>_ai.csv)
 *   --confidence <lista>  Cuáles reprocesar     (default: "baja,media,revisar")
 *   --limit <N>           Solo las primeras N   (para probar y medir costo)
 *   --batch <N>           Productos por llamada (default: 20)
 *   --model <id>          Modelo                (default: claude-opus-5)
 *   --propose-vocab       Fase 1: lee todo el catálogo y propone el árbol de
 *                         tipos de producto. No clasifica nada.
 *   --vocab <path>        Vocabulario a usar (default de salida de la fase 1:
 *                         vocabulario.json). Entra como enum en el schema, así
 *                         la deriva de etiquetas es imposible por construcción.
 *   --merge               Devuelve el CSV completo (filas de confianza alta
 *                         intactas + las reprocesadas), listo para importar
 *   --grep <regex>        Reprocesa por título en vez de por confianza. Sirve
 *                         para corregir un ingrediente puntual después de tocar
 *                         el vocabulario, sin repagar el catálogo entero.
 *                         Ej: --grep 'inositol|biotina'
 */

import { readFileSync, writeFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";

// ── .env ──────────────────────────────────────────────────────────────────────
function loadEnv(path = ".env") {
  try {
    return Object.fromEntries(
      readFileSync(path, "utf8")
        .split("\n")
        .filter(l => l.includes("=") && !l.startsWith("#"))
        .map(l => {
          const eq  = l.indexOf("=");
          return [l.slice(0, eq).trim(), l.slice(eq + 1).trim().replace(/^["']|["']$/g, "")];
        })
    );
  } catch {
    console.error("❌  No se encontró .env — ejecuta desde la carpeta vitaverse/");
    process.exit(1);
  }
}

const env = loadEnv();
if (!env.ANTHROPIC_API_KEY) {
  console.error("❌  Falta ANTHROPIC_API_KEY en .env");
  process.exit(1);
}
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

// ── Taxonomía ─────────────────────────────────────────────────────────────────
// { "gid://shopify/TaxonomyCategory/hb-1-9-6-6-3": "Health & Beauty > … > Magnesium" }
const TAXONOMY = JSON.parse(readFileSync(new URL("./shopify-taxonomy-nutricion.json", import.meta.url), "utf8"));
const VALID_IDS = new Set(Object.keys(TAXONOMY));

const TAXONOMY_TXT = Object.entries(TAXONOMY)
  .map(([gid, full]) => `${gid.split("/").pop()}  ${full.replace(/^Health & Beauty > /, "")}`)
  .join("\n");

// ── CSV ───────────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = []; let cur = "", row = [], inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQ) {
      if (ch === '"') { if (clean[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",")  { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const headers = rows.shift().map(h => h.trim());
  return rows.filter(r => r.some(c => c.trim() !== ""))
             .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const esc = v => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCSV = (headers, rows) =>
  [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n");

// ── El agente ─────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres nutricionista clínico con experiencia en catalogación de productos de suplementación para e-commerce. Clasificas productos de una tienda mexicana de suplementos dentro de la Taxonomía Estándar de Producto de Shopify.

## Tu tarea
Para cada producto recibís el título comercial completo, la marca/proveedor y las etiquetas de la tienda. Devolvés la categoría de Shopify que le corresponde y un tipo de producto en español para los filtros de la tienda.

## Cómo decidir la categoría

1. **Identificá el ingrediente o formato PRINCIPAL, no los secundarios.** Los títulos de esta tienda suelen listar cofactores y sinérgicos. En "5-HTP Sinergia 50mg + Vitamina B6", el producto es de 5-HTP; la B6 es cofactor. Regla práctica: lo que aparece primero en el título y le da el nombre comercial al producto suele ser el principal.

2. **Multi-ingrediente de verdad → nodo multi.** Si el producto aporta 3 o más vitaminas/minerales en dosis relevantes sin un protagonista claro, es Multivitamin Supplements o Multimineral Supplements. Un producto de magnesio con algo de B6 NO es multivitamínico.

3. **El formato importa tanto como el ingrediente.** Una barra de proteína va a Nutrition Bars > Protein Bars, no a Protein Supplements. Un batido sustituto de comida va a Nutrition Drinks & Shakes. Un polvo de proteína va a Protein Supplements.

4. **No todo es suplemento.** Esta tienda mezcla cosmética: aceites esenciales, sérums, cremas, aceites corporales, productos capilares. Esos van a los nodos de Personal Care, NUNCA al árbol de Vitamins & Supplements — Merchant Center rechaza los productos mal categorizados. Si el producto no es ingerible, no es suplemento.

5. **Si dudás entre un nodo específico y su padre, elegí el padre.** Es preferible "Herbal Supplements" correcto que "Kratom Supplements" equivocado.

6. **Si no podés determinarlo con la información dada**, usá \`needs_human: true\` y explicá qué falta. Es una respuesta válida y útil — preferible a inventar.

## El tipo de producto (product_type)
Es texto en español que ve el cliente en los filtros de la tienda. Puede ser más específico que la categoría de Shopify: "Antioxidantes", "Longevidad y metabolismo", "Adaptógenos" y "Hongos funcionales" son útiles como filtro aunque en la taxonomía caigan todos en nodos más amplios. Usá términos que un comprador mexicano buscaría. Sé consistente: mismo concepto, misma etiqueta, siempre.

## Categorías válidas
Usá EXCLUSIVAMENTE un id de esta lista. El id es la primera columna.

${TAXONOMY_TXT}

## Restricciones
- Nunca sugieras que un suplemento trata, cura o previene una enfermedad.
- No inventes ids de categoría. Si ninguno encaja, usá \`needs_human: true\`.
- La confianza es tu evaluación honesta: "alta" solo si el producto es inequívoco.`;

// El vocabulario entra como `enum`: así la deriva de etiquetas
// ("Aceite MCT" / "Aceite MCT y keto" / "Aceite MCT y omegas") es
// estructuralmente imposible, no una cuestión de que el modelo obedezca.
const buildSchema = vocab => ({
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["product_id", "category_id", "product_type", "confidence", "reason", "needs_human"],
        properties: {
          product_id:   { type: "string", description: "El id exacto que recibiste" },
          category_id:  { type: "string", description: "Id de la taxonomía, ej. hb-1-9-6-6-3. Vacío si needs_human." },
          product_type: vocab?.length
            ? { type: "string", enum: [...vocab, ""], description: "Elegí uno del vocabulario. Vacío solo si needs_human." }
            : { type: "string", description: "Tipo en español para el filtro de la tienda" },
          confidence:   { type: "string", enum: ["alta", "media", "baja"] },
          reason:       { type: "string", description: "Máximo 15 palabras: qué ingrediente o formato define la categoría" },
          needs_human:  { type: "boolean", description: "true si ningún tipo del vocabulario encaja o falta información" },
        },
      },
    },
  },
});

// ── Fase 1: proponer el vocabulario ──────────────────────────────────────────
const VOCAB_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["tipos"],
  properties: {
    tipos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tipo", "descripcion", "ejemplos"],
        properties: {
          tipo:        { type: "string", description: "La etiqueta como la ve el cliente en el filtro" },
          descripcion: { type: "string", description: "Qué entra y qué no, en una línea" },
          ejemplos:    { type: "array", items: { type: "string" }, description: "2-3 títulos del catálogo que caen acá" },
        },
      },
    },
  },
};

const VOCAB_PROMPT = `Eres nutricionista clínico diseñando el filtro de categorías de una tienda mexicana de suplementos con 1,500 productos.

Vas a recibir todos los títulos del catálogo. Devolvé el árbol COMPLETO de tipos de producto para el filtro de la tienda.

Criterios:
- Entre 25 y 45 tipos. Menos deja el filtro inútil; más lo vuelve inmanejable.
- Cada tipo debe cubrir al menos ~8 productos del catálogo. Si algo cubre 2, va dentro de un tipo más amplio.
- Nombrá como busca un comprador mexicano, no como lo diría una etiqueta técnica: "Omega 3", no "Ácidos grasos poliinsaturados".
- Un producto tiene que caer en UN solo tipo sin ambigüedad. Si dos tipos se solapan ("Salud digestiva" y "Probióticos"), elegí uno de los dos criterios — por ingrediente o por objetivo — y aplicalo parejo en todo el árbol.
- Incluí los tipos que ya usa la tienda si siguen sirviendo; renombrá o fusioná los que no.
- Los productos tópicos (aceites esenciales, sérums, cremas) necesitan sus propios tipos, separados de lo ingerible.

Nunca sugieras que un suplemento trata, cura o previene enfermedades.`;

async function proposeVocab(titles, existing, model) {
  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    system: VOCAB_PROMPT,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: VOCAB_SCHEMA } },
    messages: [{
      role: "user",
      content: `Tipos que la tienda usa hoy (de un clasificador por reglas):\n${existing.join(" · ")}\n\n`
             + `Los ${titles.length} títulos del catálogo:\n${titles.join("\n")}`,
    }],
  });
  if (response.stop_reason === "refusal")
    throw new Error(`El modelo declinó: ${response.stop_details?.category ?? "sin categoría"}`);
  const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
  return { tipos: JSON.parse(text).tipos ?? [], usage: response.usage };
}

async function classifyBatch(products, model, vocab, vocabFull) {
  const payload = products.map(p => ({
    product_id: p.product_id,
    titulo:     p.title,
    proveedor:  p.vendor,
    etiquetas:  p.tags ? p.tags.split(" | ").slice(0, 12).join(", ") : "",
  }));

  // El vocabulario va en el prompt de sistema junto a la taxonomía: es fijo
  // durante toda la corrida, así que no rompe el caché.
  // Se mandan con su descripción: ahí está el "qué entra y qué no" que
  // resuelve los bordes (biotina sola va a Belleza, no a Complejo B).
  const system = vocab?.length
    ? `${SYSTEM_PROMPT}\n\n## Vocabulario de product_type\nUsá EXCLUSIVAMENTE uno de estos. Si ninguno encaja, needs_human: true.\n`
      + (vocabFull?.length
          ? vocabFull.map(v => `- ${v.tipo}: ${v.descripcion}`).join("\n")
          : vocab.map(v => `- ${v}`).join("\n"))
    : SYSTEM_PROMPT;

  const response = await client.messages.create({
    model,
    max_tokens: 16000,
    // El prompt de sistema (taxonomía + criterios + vocabulario) es idéntico en
    // cada llamada: cachearlo evita repagar ~3k tokens por batch.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: buildSchema(vocab) },
    },
    messages: [{
      role: "user",
      content: `Clasificá estos ${payload.length} productos. Devolvé un resultado por cada product_id recibido.\n\n${JSON.stringify(payload, null, 1)}`,
    }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`El modelo declinó la solicitud: ${response.stop_details?.category ?? "sin categoría"}`);
  }

  const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error(`Respuesta no parseable: ${text.slice(0, 200)}`); }

  return { results: parsed.results ?? [], usage: response.usage };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const args    = process.argv.slice(2);
  const flag    = n => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : null; };
  const hasFlag = n => args.includes(n);

  const filePath = flag("--file");
  if (!filePath) {
    console.error("❌  Falta --file <ruta.csv>");
    process.exit(1);
  }
  const model       = flag("--model") || "claude-opus-5";
  const batchSize   = Number(flag("--batch") || 20);
  const limit       = flag("--limit") ? Number(flag("--limit")) : null;
  const merge       = hasFlag("--merge");
  const outPath     = flag("--out") || filePath.replace(/\.csv$/i, "") + "_ai.csv";
  const confidences = (flag("--confidence") || "baja,media,revisar").split(",").map(s => s.trim());

  const allRows = parseCSV(readFileSync(filePath, "utf8"));

  // ── Fase 1: proponer el vocabulario y salir ────────────────────────────────
  if (hasFlag("--propose-vocab")) {
    const vocabOut = flag("--vocab") || "vocabulario.json";
    const titles   = allRows.map(r => r.title).filter(Boolean);
    const existing = [...new Set(allRows.map(r => r.suggested_product_type).filter(Boolean))].sort();

    process.stderr.write(`\n🧑‍⚕️  Proponiendo vocabulario — ${model}\n`);
    process.stderr.write(`   ${titles.length} títulos del catálogo\n`);
    process.stderr.write(`   ${existing.length} tipos actuales como punto de partida\n\n   Pensando…\n`);

    const { tipos, usage } = await proposeVocab(titles, existing, model);

    writeFileSync(vocabOut, JSON.stringify(tipos, null, 1), "utf8");
    process.stderr.write(`\n📋  ${tipos.length} tipos propuestos\n\n`);
    for (const t of tipos) {
      const marca = existing.includes(t.tipo) ? " " : "+";
      process.stderr.write(` ${marca} ${t.tipo}\n     ${t.descripcion}\n`);
    }
    const c = (usage.input_tokens * 5 + usage.output_tokens * 25) / 1_000_000;
    process.stderr.write(`\n   ("+" = tipo nuevo · sin marca = ya lo usabas)\n`);
    process.stderr.write(`   Costo: USD ${c.toFixed(3)}\n`);
    process.stderr.write(`\n✅  ${vocabOut}\n   Revisalo y editalo a gusto. Después:\n`);
    process.stderr.write(`   node scripts/classify-with-ai.mjs --file ${filePath} --vocab ${vocabOut}\n\n`);
    return; // no process.exit(): en Windows corta stderr a media escritura
  }

  // ── Fase 2: clasificar contra un vocabulario fijo ──────────────────────────
  let vocab = null, vocabFull = null;
  const vocabPath = flag("--vocab");
  if (vocabPath) {
    const raw = JSON.parse(readFileSync(vocabPath, "utf8"));
    vocabFull = (Array.isArray(raw) ? raw : raw.tipos).filter(t => typeof t === "object");
    vocab = (Array.isArray(raw) ? raw : raw.tipos).map(t => (typeof t === "string" ? t : t.tipo));
  }

  // --grep reprocesa por título en vez de por confianza: sirve para corregir
  // un ingrediente puntual sin volver a pagar el catálogo entero.
  const grep    = flag("--grep");
  const rx      = grep ? new RegExp(grep, "i") : null;
  const targets = rx
    ? allRows.filter(r => rx.test(r.title))
    : allRows.filter(r => confidences.includes(r.confidence));
  const work    = limit ? targets.slice(0, limit) : targets;

  process.stderr.write(`\n🧑‍⚕️  Clasificador nutricional — ${model}\n`);
  process.stderr.write(`   ${allRows.length} filas en el CSV\n`);
  process.stderr.write(`   ${targets.length} ${rx ? `que coinciden con /${grep}/` : `con confianza ${confidences.join("/")}`}\n`);
  process.stderr.write(`   ${work.length} a procesar en ${Math.ceil(work.length / batchSize)} llamadas de ${batchSize}\n`);
  process.stderr.write(`   ${Object.keys(TAXONOMY).length} categorías de Shopify disponibles\n`);
  process.stderr.write(vocab
    ? `   ${vocab.length} tipos de producto (vocabulario cerrado — sin deriva posible)\n\n`
    : `   ⚠️  Sin --vocab: el modelo inventa etiquetas y van a derivar entre batches.\n      Corré primero --propose-vocab\n\n`);

  if (!work.length) { process.stderr.write("   Nada que hacer.\n\n"); process.exit(0); }

  const byId = new Map();
  let inTok = 0, outTok = 0, cacheRead = 0, cacheWrite = 0, failed = 0, invalid = 0, humano = 0;

  for (let i = 0; i < work.length; i += batchSize) {
    const batch   = work.slice(i, i + batchSize);
    const batchNo = Math.floor(i / batchSize) + 1;
    const total   = Math.ceil(work.length / batchSize);
    process.stderr.write(`   Batch ${String(batchNo).padStart(3)}/${total} (${batch.length})… `);

    try {
      const { results, usage } = await classifyBatch(batch, model, vocab, vocabFull);
      inTok      += usage.input_tokens  ?? 0;
      outTok     += usage.output_tokens ?? 0;
      cacheRead  += usage.cache_read_input_tokens     ?? 0;
      cacheWrite += usage.cache_creation_input_tokens ?? 0;

      for (const r of results) {
        const gid = `gid://shopify/TaxonomyCategory/${r.category_id}`;
        // El modelo puede alucinar un id: lo validamos contra la taxonomía real
        if (!r.needs_human && !VALID_IDS.has(gid)) { invalid++; r.needs_human = true; r.reason = `id inválido (${r.category_id}) — ${r.reason}`; }
        if (r.needs_human) humano++;
        byId.set(r.product_id, r);
      }

      const faltan = batch.filter(b => !byId.has(b.product_id)).length;
      process.stderr.write(faltan ? `⚠️  faltaron ${faltan}\n` : `✅\n`);
    } catch (e) {
      failed += batch.length;
      process.stderr.write(`❌  ${e.message.slice(0, 90)}\n`);
    }
  }

  // — Aplicar resultados —
  const apply = r => {
    const ai = byId.get(r.product_id);
    if (!ai) return r;
    const gid = `gid://shopify/TaxonomyCategory/${ai.category_id}`;
    return {
      ...r,
      suggested_product_type:  ai.needs_human ? "" : ai.product_type,
      suggested_category_id:   ai.needs_human ? "" : gid,
      suggested_category_name: ai.needs_human ? "" : (TAXONOMY[gid]?.split(" > ").pop() ?? ""),
      rule:                    ai.needs_human ? `ai:revisar — ${ai.reason}` : `ai: ${ai.reason}`,
      confidence:              ai.needs_human ? "revisar" : ai.confidence,
      needs_human:             ai.needs_human ? "si" : "no",
    };
  };

  const outRows = merge ? allRows.map(apply) : work.map(apply);
  const headers = [...new Set([...Object.keys(allRows[0]), "needs_human"])];
  writeFileSync(outPath, "﻿" + toCSV(headers, outRows), "utf8");

  // — Resumen —
  const done = [...byId.values()];
  const dist = done.reduce((a, r) => { const k = r.needs_human ? "(revisar a mano)" : r.product_type; a[k] = (a[k] || 0) + 1; return a; }, {});

  process.stderr.write(`\n📊  Resultado\n`);
  Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 20)
    .forEach(([k, v]) => process.stderr.write(`   ${String(v).padStart(5)}  ${k}\n`));

  const conf = done.reduce((a, r) => { if (!r.needs_human) a[r.confidence] = (a[r.confidence] || 0) + 1; return a; }, {});
  process.stderr.write(`\n   Clasificados:  ${done.length - humano}  (alta ${conf.alta || 0} · media ${conf.media || 0} · baja ${conf.baja || 0})\n`);
  process.stderr.write(`   Para revisar:  ${humano}${invalid ? `  (${invalid} por id inválido)` : ""}\n`);
  if (failed) process.stderr.write(`   Fallaron:      ${failed}\n`);

  // Precios de Claude Opus 5: $5/MTok entrada, $25/MTok salida, caché leída ~0.1x
  const cost = (inTok * 5 + outTok * 25 + cacheRead * 0.5 + cacheWrite * 6.25) / 1_000_000;
  process.stderr.write(`\n   Tokens: ${inTok} entrada · ${outTok} salida · ${cacheWrite} escritos en caché · ${cacheRead} leídos\n`);
  if (cacheWrite === 0 && cacheRead === 0 && work.length > batchSize)
    process.stderr.write(`   ⚠️  El caché no se activó: el prompt de sistema no llega al mínimo del modelo.\n      Subí --batch para repetirlo menos veces.\n`);
  process.stderr.write(`   Costo aprox: USD ${cost.toFixed(3)}${limit ? `  → catálogo completo ≈ USD ${(cost / work.length * targets.length).toFixed(2)}` : ""}\n`);
  process.stderr.write(`\n✅  ${outRows.length} filas → ${outPath}\n\n`);
})().catch(e => { console.error("\n❌  Error:", e.message); process.exit(1); });
