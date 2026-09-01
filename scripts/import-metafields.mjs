/**
 * import-metafields.mjs
 * Lee un CSV con datos de dosis y actualiza metafields de producto en Shopify.
 *
 * Identificador: columna "sku" → se busca el product_id en Shopify por variante.
 *
 * Columnas del CSV (defaults, ajustables con --col-*):
 *   sku              SKU de la variante (obligatorio)
 *   Unidad           → custom.tipo_dosis
 *   Unidades x dosis → custom.dosis
 *   contenido        → custom.total_unidades
 *   dosis_totales    → custom.total_dosis
 *
 * Uso:
 *   node scripts/import-metafields.mjs --file catalogo_dosis_v2.csv --dry-run
 *   node scripts/import-metafields.mjs --file catalogo_dosis_v2.csv --limit 5
 *   node scripts/import-metafields.mjs --file catalogo_dosis_v2.csv
 *   node scripts/import-metafields.mjs --file catalogo_dosis_v2.csv --col-tipo Unidad
 *
 * Flags:
 *   --file <path>           CSV de entrada (obligatorio)
 *   --dry-run               Solo muestra qué haría, sin tocar Shopify
 *   --limit <N>             Procesar solo las primeras N filas (para pruebas)
 *   --skip-errors           Continúa aunque haya errores de API
 *   --col-sku <col>         Columna SKU              (default: "sku")
 *   --col-tipo <col>        Columna tipo_dosis        (default: "Unidad")
 *   --col-dosis <col>       Columna dosis             (default: "Unidades x dosis")
 *   --col-unidades <col>    Columna total_unidades    (default: "contenido")
 *   --col-total-dosis <col> Columna total_dosis       (default: "dosis_totales")
 */

import { readFileSync } from "fs";

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

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const clean = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines  = clean.split("\n");
  const result = [];
  let i = 0;

  function parseLine(line) {
    const cells = [];
    let cur = ""; let inQ = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') { if (inQ && line[c+1] === '"') { cur += '"'; c++; } else inQ = !inQ; }
      else if (ch === "," && !inQ) { cells.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  }

  while (i < lines.length && !lines[i].trim()) i++;
  if (i >= lines.length) return [];
  const headers = parseLine(lines[i++]);
  while (i < lines.length) {
    const line = lines[i++];
    if (!line.trim()) continue;
    const cells = parseLine(line);
    const row   = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
    result.push(row);
  }
  return result;
}

// ── Shopify GraphQL ───────────────────────────────────────────────────────────
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Lookup SKU → variantId ────────────────────────────────────────────────────
// Shopify soporta queries con OR: "sku:ABC OR sku:DEF"
// Máximo ~50 SKUs por batch para no reventar el query string.
async function lookupVariantsBySKU(skus) {
  const map    = {}; // sku → variantId (string numérico)
  const BATCH  = 50;
  const unique = [...new Set(skus.filter(Boolean))];

  process.stderr.write(`\n🔍  Buscando ${unique.length} SKUs en Shopify…\n`);

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch    = unique.slice(i, i + BATCH);
    const queryStr = batch.map(s => `sku:${s}`).join(" OR ");

    const data = await gql(`
      query($q: String!) {
        productVariants(first: 250, query: $q) {
          edges {
            node {
              id
              sku
            }
          }
        }
      }
    `, { q: queryStr });

    for (const { node } of data?.productVariants?.edges ?? []) {
      if (node.sku && !map[node.sku]) {
        map[node.sku] = node.id.replace("gid://shopify/ProductVariant/", "");
      }
    }

    if (i + BATCH < unique.length) await sleep(200);
  }

  process.stderr.write(`   ✅  ${Object.keys(map).length} / ${unique.length} SKUs resueltos\n`);
  const missed = unique.filter(s => !map[s]);
  if (missed.length) {
    process.stderr.write(`   ⚠️  Sin resultado: ${missed.join(", ")}\n`);
  }
  return map;
}

// ── Construir metafields para una variante ────────────────────────────────────
function buildMetafields(variantId, row, cols) {
  const ownerId = `gid://shopify/ProductVariant/${variantId}`;
  const fields  = [];

  const tipo = row[cols.tipo]?.trim();
  if (tipo) {
    fields.push({ ownerId, namespace: "custom", key: "tipo_dosis",
                  value: tipo, type: "single_line_text_field" });
  }

  const dosis = row[cols.dosis]?.trim();
  if (dosis && !isNaN(Number(dosis))) {
    fields.push({ ownerId, namespace: "custom", key: "dosis",
                  value: String(Math.round(Number(dosis))),
                  type:  "number_integer" });
  }

  const totalUnidades = row[cols.totalUnidades]?.trim();
  if (totalUnidades && !isNaN(Number(totalUnidades))) {
    fields.push({ ownerId, namespace: "custom", key: "total_unidades",
                  value: String(Math.round(Number(totalUnidades))),
                  type:  "number_integer" });
  }

  const totalDosis = row[cols.totalDosis]?.trim();
  if (totalDosis && !isNaN(Number(totalDosis))) {
    fields.push({ ownerId, namespace: "custom", key: "total_dosis",
                  value: String(Math.round(Number(totalDosis))),
                  type:  "number_integer" });
  }

  return fields;
}

const METAFIELDS_SET = /* graphql */ `
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { key namespace value }
      userErrors  { field message code }
    }
  }
`;

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i !== -1 && args[i+1] ? args[i+1] : null; };
  const has  = (name) => args.includes(name);

  const filePath   = flag("--file");
  if (!filePath) {
    console.error("❌  Falta --file <ruta.csv>  →  node scripts/import-metafields.mjs --file catalogo_dosis_v2.csv");
    process.exit(1);
  }

  const dryRun     = has("--dry-run");
  const skipErrors = has("--skip-errors");
  const limit      = flag("--limit") ? Number(flag("--limit")) : null;

  const cols = {
    sku:         flag("--col-sku")         || "sku",
    tipo:        flag("--col-tipo")        || "Unidad",
    dosis:       flag("--col-dosis")       || "Unidades x dosis",
    totalUnidades: flag("--col-unidades")  || "contenido",
    totalDosis:  flag("--col-total-dosis") || "dosis_totales",
  };

  // — Leer CSV —
  let csvText;
  try { csvText = readFileSync(filePath, "utf8"); }
  catch (e) { console.error(`❌  No se pudo leer ${filePath}: ${e.message}`); process.exit(1); }

  let rows = parseCSV(csvText);
  if (!rows.length) { console.error("❌  CSV vacío"); process.exit(1); }

  // Verificar columnas
  const missing = [cols.sku, cols.tipo, cols.dosis, cols.totalUnidades, cols.totalDosis]
    .filter(c => !(c in rows[0]));
  if (missing.length) {
    console.error(`❌  Columnas no encontradas: ${missing.join(", ")}`);
    console.error(`   Columnas disponibles: ${Object.keys(rows[0]).join(", ")}`);
    process.exit(1);
  }

  if (limit) {
    rows = rows.slice(0, limit);
    process.stderr.write(`\n🧪  Modo prueba — procesando solo ${limit} filas\n`);
  }

  process.stderr.write(`\n🚀  import-metafields ${dryRun ? "(DRY RUN) " : ""}— ${filePath}\n`);
  process.stderr.write(`   ${rows.length} filas a procesar\n`);

  // — Phase 1: Lookup SKU → variantId —
  const skus   = rows.map(r => r[cols.sku]?.trim()).filter(Boolean);
  const skuMap = await lookupVariantsBySKU(skus);

  // — Phase 2: Construir metafields (uno por variante, sin deduplicar) —
  const allFields = [];
  let   resolved  = 0;
  for (const row of rows) {
    const sku       = row[cols.sku]?.trim();
    const variantId = skuMap[sku];
    if (!variantId) continue;
    const fields = buildMetafields(variantId, row, cols);
    if (fields.length) { allFields.push(...fields); resolved++; }
    else process.stderr.write(`  ⚠️  SKU ${sku}: sin datos de metafields\n`);
  }

  process.stderr.write(`\n📋  ${resolved} variantes → ${allFields.length} metafields a enviar\n`);

  if (!allFields.length) {
    process.stderr.write("   Nada que actualizar.\n\n");
    process.exit(0);
  }

  // — Preview (dry-run) —
  if (dryRun) {
    process.stderr.write("\n── Preview ─────────────────────────────────────────────\n");
    // Agrupar por variante para legibilidad
    const byVariant = {};
    for (const f of allFields) {
      const id = f.ownerId.replace("gid://shopify/ProductVariant/", "");
      if (!byVariant[id]) byVariant[id] = [];
      byVariant[id].push(f);
    }
    for (const [id, fields] of Object.entries(byVariant)) {
      const sku = Object.entries(skuMap).find(([, vid]) => vid === id)?.[0] ?? "?";
      process.stderr.write(`\n  Variante ${id} (${sku}):\n`);
      for (const f of fields) {
        process.stderr.write(`    ${f.key.padEnd(22)} = ${f.value}\n`);
      }
    }
    process.stderr.write("\n✅  Dry run completo. Quita --dry-run para ejecutar.\n\n");
    process.exit(0);
  }

  // — Phase 4: Enviar en batches de 25 —
  const BATCH = 25;
  let sent = 0, failed = 0, apiErrors = [];

  process.stderr.write(`\n📡  Enviando en batches de ${BATCH}…\n`);

  for (let i = 0; i < allFields.length; i += BATCH) {
    const batch   = allFields.slice(i, i + BATCH);
    const batchNo = Math.floor(i / BATCH) + 1;
    const total   = Math.ceil(allFields.length / BATCH);

    process.stderr.write(`   Batch ${String(batchNo).padStart(3)}/${total}… `);

    try {
      const data = await gql(METAFIELDS_SET, { metafields: batch });
      const errs = data?.metafieldsSet?.userErrors ?? [];

      if (errs.length) {
        const msg = errs.map(e => `${e.field}: ${e.message}`).join("; ");
        process.stderr.write(`⚠️  ${msg}\n`);
        apiErrors.push(`Batch ${batchNo}: ${msg}`);
        failed += batch.length;
        if (!skipErrors) { process.stderr.write("❌  Abortando (usa --skip-errors para continuar)\n"); process.exit(1); }
      } else {
        process.stderr.write(`✅\n`);
        sent += batch.length;
      }
    } catch (e) {
      process.stderr.write(`❌  ${e.message}\n`);
      apiErrors.push(`Batch ${batchNo}: ${e.message}`);
      failed += batch.length;
      if (!skipErrors) { process.stderr.write("❌  Abortando (usa --skip-errors para continuar)\n"); process.exit(1); }
    }

    if (i + BATCH < allFields.length) await sleep(150);
  }

  // — Resumen —
  process.stderr.write("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.stderr.write(`✅  Enviados:  ${sent} metafields (${resolved} variantes)\n`);
  if (failed)  process.stderr.write(`❌  Con error: ${failed} metafields\n`);
  process.stderr.write(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`);

  if (apiErrors.length) {
    apiErrors.forEach(e => process.stderr.write(`  ${e}\n`));
    process.exit(1);
  }
})().catch(e => { console.error("\n❌  Error:", e.message); process.exit(1); });
