/**
 * import-taxonomy.mjs
 * Toma el CSV aprobado de classify-products.mjs y escribe `productType` y
 * `category` en Shopify vía Admin GraphQL (productUpdate).
 *
 * ⚠️  ESCRIBE EN PRODUCCIÓN. Por defecto NO hace nada: hay que pasar --execute.
 *     Sin ese flag corre en seco y te muestra exactamente qué cambiaría.
 *
 * Por defecto solo rellena campos VACÍOS — no pisa valores existentes.
 * Y solo importa filas con confidence = alta, salvo que le digas otra cosa.
 *
 * Uso recomendado, en tres pasos:
 *   1. node scripts/import-taxonomy.mjs --file clasificacion.csv
 *        (seco, solo confianza alta — mirá el resumen)
 *   2. node scripts/import-taxonomy.mjs --file clasificacion.csv --limit 10 --execute
 *        (10 productos de verdad — verificá en el admin de Shopify)
 *   3. node scripts/import-taxonomy.mjs --file clasificacion.csv --execute
 *
 * Después, para las de confianza media que ya revisaste a mano:
 *      node scripts/import-taxonomy.mjs --file clasificacion.csv --confidence alta,media --execute
 *
 * Flags:
 *   --file <path>         CSV de entrada (obligatorio)
 *   --execute             Escribe de verdad. Sin esto: dry run.
 *   --confidence <lista>  Confianzas a importar  (default: "alta")
 *   --limit <N>           Solo las primeras N filas elegibles
 *   --overwrite           También pisa productType/category ya cargados
 *   --skip-type           No toca productType (solo category)
 *   --skip-category       No toca category (solo productType)
 *   --skip-errors         Continúa aunque un batch falle
 *   --errors-out <path>   CSV con las filas que fallaron (default: errores_taxonomia.csv)
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

// ── CSV ───────────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows  = [];
  let cur = "", row = [], inQ = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQ) {
      if (ch === '"') { if (clean[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",")   { row.push(cur); cur = ""; }
    else if (ch === "\n")  { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }

  const headers = rows.shift().map(h => h.trim());
  return rows
    .filter(r => r.some(c => c.trim() !== ""))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const esc = v => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ── GraphQL con manejo de throttling ─────────────────────────────────────────
async function gql(query, variables = {}, attempt = 1) {
  const res = await fetch(GQL_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body:    JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();

  const throttled = json.errors?.some(e => e.extensions?.code === "THROTTLED");
  if (throttled && attempt <= 5) {
    const wait = 2000 * attempt;
    process.stderr.write(`\n   ⏳  Throttled — esperando ${wait / 1000}s…\n`);
    await sleep(wait);
    return gql(query, variables, attempt + 1);
  }
  if (json.errors) throw new Error(json.errors.map(e => e.message).join(" | "));

  // Dejar respirar el bucket de costo si quedó bajo
  const left = json.extensions?.cost?.throttleStatus?.currentlyAvailable;
  if (typeof left === "number" && left < 300) await sleep(1000);

  return json.data;
}

// productUpdate no tiene versión bulk — se mandan varias con alias en un request.
// Ojo con la firma: el argumento es `product: ProductUpdateInput!`. El viejo
// `input:` sigue existiendo pero espera `ProductInput`, y mezclarlos da
// "Type mismatch on variable $i0 and argument input".
function buildBatchMutation(items) {
  const params = items.map((_, i) => `$p${i}: ProductUpdateInput!`).join(", ");
  const bodies = items.map((_, i) => `
    p${i}: productUpdate(product: $p${i}) {
      product { id productType category { id fullName } }
      userErrors { field message }
    }`).join("\n");
  return `mutation Batch(${params}) {${bodies}\n}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const args    = process.argv.slice(2);
  const flag    = n => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : null; };
  const hasFlag = n => args.includes(n);

  const filePath     = flag("--file");
  const execute      = hasFlag("--execute");
  const overwrite    = hasFlag("--overwrite");
  const skipType     = hasFlag("--skip-type");
  const skipCategory = hasFlag("--skip-category");
  const skipErrors   = hasFlag("--skip-errors");
  const limit        = flag("--limit") ? Number(flag("--limit")) : null;
  const errorsOut    = flag("--errors-out") || "errores_taxonomia.csv";
  const confidences  = (flag("--confidence") || "alta").split(",").map(s => s.trim());

  if (!filePath) {
    console.error("❌  Falta --file <ruta.csv>  →  node scripts/import-taxonomy.mjs --file clasificacion.csv");
    process.exit(1);
  }
  if (skipType && skipCategory) {
    console.error("❌  --skip-type y --skip-category juntos no dejan nada que escribir");
    process.exit(1);
  }
  if (!env.SHOPIFY_STORE || !TOKEN) {
    console.error("❌  Faltan SHOPIFY_STORE o SHOPIFY_ACCESS_TOKEN en .env");
    process.exit(1);
  }

  const rows = parseCSV(readFileSync(filePath, "utf8"));
  if (!rows.length) { console.error("❌  CSV vacío"); process.exit(1); }

  const need = ["product_id", "suggested_product_type", "suggested_category_id", "confidence"];
  const missing = need.filter(c => !(c in rows[0]));
  if (missing.length) {
    console.error(`❌  Faltan columnas: ${missing.join(", ")}`);
    console.error(`   Disponibles: ${Object.keys(rows[0]).join(", ")}`);
    process.exit(1);
  }

  // — Filtrar —
  const stats = { total: rows.length, confianza: 0, sinDato: 0, yaCargado: 0, elegibles: 0 };
  let candidates = [];

  for (const r of rows) {
    if (!confidences.includes(r.confidence)) { stats.confianza++; continue; }

    const wantType = !skipType     && r.suggested_product_type;
    const wantCat  = !skipCategory && r.suggested_category_id;
    if (!wantType && !wantCat) { stats.sinDato++; continue; }

    // Sin --overwrite, solo rellenamos lo que está vacío.
    // Ojo: la Admin API devuelve la categoría como "Uncategorized", no como
    // vacío. Sin esta normalización la guarda cree que ya tiene valor y no
    // escribe nunca.
    const catVacia = !r.current_category || r.current_category.trim() === "Uncategorized";
    const setType = wantType && (overwrite || !r.current_product_type);
    const setCat  = wantCat  && (overwrite || catVacia);
    if (!setType && !setCat) { stats.yaCargado++; continue; }

    const input = { id: `gid://shopify/Product/${r.product_id}` };
    if (setType) input.productType = r.suggested_product_type;
    if (setCat)  input.category    = r.suggested_category_id;

    candidates.push({ row: r, input });
  }

  stats.elegibles = candidates.length;
  if (limit) candidates = candidates.slice(0, limit);

  // — Resumen —
  process.stderr.write(`\n${execute ? "🚀  IMPORTANDO" : "🧪  DRY RUN — no se escribe nada"}\n`);
  process.stderr.write(`   Archivo:    ${filePath}\n`);
  process.stderr.write(`   Confianza:  ${confidences.join(", ")}\n`);
  process.stderr.write(`   Campos:     ${[!skipType && "productType", !skipCategory && "category"].filter(Boolean).join(" + ")}\n`);
  process.stderr.write(`   Modo:       ${overwrite ? "pisa valores existentes" : "solo rellena vacíos"}\n\n`);
  process.stderr.write(`   ${String(stats.total).padStart(5)}  filas en el CSV\n`);
  process.stderr.write(`   ${String(stats.confianza).padStart(5)}  descartadas por confianza\n`);
  process.stderr.write(`   ${String(stats.sinDato).padStart(5)}  sin categoría sugerida\n`);
  process.stderr.write(`   ${String(stats.yaCargado).padStart(5)}  ya tenían valor (usá --overwrite para pisarlas)\n`);
  process.stderr.write(`   ${String(stats.elegibles).padStart(5)}  elegibles${limit ? ` → limitado a ${candidates.length}` : ""}\n`);

  if (!candidates.length) { process.stderr.write("\n   Nada que hacer.\n\n"); process.exit(0); }

  if (!execute) {
    process.stderr.write("\n── Muestra de lo que se escribiría ─────────────────────\n");
    for (const c of candidates.slice(0, 15)) {
      process.stderr.write(`\n  ${c.row.title?.slice(0, 62) ?? c.row.product_id}\n`);
      if (c.input.productType) process.stderr.write(`     productType → ${c.input.productType}\n`);
      if (c.input.category)    process.stderr.write(`     category    → ${c.row.suggested_category_name} (${c.input.category.split("/").pop()})\n`);
    }
    if (candidates.length > 15) process.stderr.write(`\n  … y ${candidates.length - 15} más\n`);
    process.stderr.write(`\n✅  Dry run completo. Agregá --execute para escribir.\n`);
    process.stderr.write(`   Antes de ir a todo: probá con --limit 10 --execute\n\n`);
    process.exit(0);
  }

  // — Escribir en batches con alias —
  const BATCH = 10;
  let ok = 0, failed = 0;
  const errors = [];

  process.stderr.write(`\n📡  Escribiendo en batches de ${BATCH}…\n`);

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch   = candidates.slice(i, i + BATCH);
    const batchNo = Math.floor(i / BATCH) + 1;
    const total   = Math.ceil(candidates.length / BATCH);

    process.stderr.write(`   Batch ${String(batchNo).padStart(4)}/${total}… `);

    const mutation  = buildBatchMutation(batch);
    const variables = Object.fromEntries(batch.map((c, n) => [`p${n}`, c.input]));

    try {
      const data = await gql(mutation, variables);
      let batchErrs = 0;

      batch.forEach((c, n) => {
        const result = data[`p${n}`];
        const errs   = result?.userErrors ?? [];
        if (errs.length) {
          batchErrs++;
          const msg = errs.map(e => `${e.field}: ${e.message}`).join("; ");
          errors.push({ product_id: c.row.product_id, title: c.row.title, error: msg });
        } else ok++;
      });

      failed += batchErrs;
      process.stderr.write(batchErrs ? `⚠️  ${batchErrs} con error\n` : `✅\n`);

      if (batchErrs && !skipErrors) {
        process.stderr.write("\n❌  Abortando. Últimos errores:\n");
        errors.slice(-batchErrs).forEach(e => process.stderr.write(`   ${e.title?.slice(0, 50)}: ${e.error}\n`));
        process.stderr.write("   Usá --skip-errors para continuar igual.\n\n");
        break;
      }
    } catch (e) {
      failed += batch.length;
      batch.forEach(c => errors.push({ product_id: c.row.product_id, title: c.row.title, error: e.message }));
      process.stderr.write(`❌  ${e.message}\n`);
      if (!skipErrors) { process.stderr.write("   Usá --skip-errors para continuar igual.\n\n"); break; }
    }

    if (i + BATCH < candidates.length) await sleep(500);
  }

  // — Resultado —
  process.stderr.write("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.stderr.write(`✅  Actualizados: ${ok} productos\n`);
  if (failed) process.stderr.write(`❌  Con error:    ${failed}\n`);
  process.stderr.write("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (errors.length) {
    const headers = ["product_id", "title", "error"];
    writeFileSync(errorsOut, "﻿" + [headers.join(","), ...errors.map(e => headers.map(h => esc(e[h])).join(","))].join("\n"), "utf8");
    process.stderr.write(`\n   Detalle de errores → ${errorsOut}\n`);
  }
  process.stderr.write("\n");
  if (failed && !ok) process.exit(1);
})().catch(e => { console.error("\n❌  Error:", e.message); process.exit(1); });
