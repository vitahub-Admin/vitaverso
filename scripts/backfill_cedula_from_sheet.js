// scripts/backfill_cedula_from_sheet.js
// Lee la cédula profesional del Sheet de afiliados y la escribe en Supabase.
// Por defecto solo actualiza afiliados que tienen cedula_profesional vacía.
// Con --force sobreescribe TAMBIÉN los que ya tienen valor.
//
// Uso:
//   node --env-file=.env scripts/backfill_cedula_from_sheet.js
//   node --env-file=.env scripts/backfill_cedula_from_sheet.js --dry-run
//   node --env-file=.env scripts/backfill_cedula_from_sheet.js --force
//   node --env-file=.env scripts/backfill_cedula_from_sheet.js --force --dry-run

import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") || "",
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE   = process.argv.includes("--force");   // sobreescribir aunque ya tenga valor

async function main() {
  console.log("\n🪪  BACKFILL CÉDULA PROFESIONAL: Sheet → Supabase");
  if (DRY_RUN) console.log("   ⚠️  DRY RUN — no se escribe en Supabase");
  if (FORCE)   console.log("   ⚡ FORCE — sobreescribirá cédulas existentes");
  console.log("═".repeat(60));
  console.time("⏱  Tiempo total");

  // ── 1. Leer sheet ────────────────────────────────────────────────────────
  console.log("\n📄 Leyendo Google Sheet...");
  const sheets   = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.AFILIADOS_SHEET_ID,
    range:         "Hoja 1",
  });

  const rows = response.data.values || [];
  if (rows.length < 2) {
    console.log("❌ El sheet está vacío o solo tiene cabecera.");
    process.exit(0);
  }

  const headers = rows[0].map(h => String(h ?? "").trim().toLowerCase());
  console.log(`   Columnas encontradas: ${headers.length}`);
  console.log(`   Filas de datos:       ${rows.length - 1}`);

  // ── 2. Ubicar columnas ───────────────────────────────────────────────────
  const idCol     = headers.indexOf("id usuario");
  const cedulaCol = headers.findIndex(
    h => h.includes("cedula") || h.includes("cédula")
  );

  if (idCol === -1) {
    console.error('\n❌ No se encontró columna "Id Usuario". Headers:');
    headers.forEach((h, i) => console.log(`   [${i}] ${h}`));
    process.exit(1);
  }
  if (cedulaCol === -1) {
    console.error('\n❌ No se encontró columna de cédula. Headers:');
    headers.forEach((h, i) => console.log(`   [${i}] ${h}`));
    process.exit(1);
  }

  console.log(`\n   Columna "Id Usuario":         col ${idCol}     (${colLetter(idCol)})`);
  console.log(`   Columna "Cédula" encontrada:  col ${cedulaCol}  (${colLetter(cedulaCol)}) → "${headers[cedulaCol]}"`);

  // ── 3. Extraer filas con cédula en el sheet ──────────────────────────────
  // Una cédula mexicana válida es solo dígitos, entre 5 y 8 caracteres.
  const CEDULA_RE = /^\d{5,8}$/;

  const fromSheet  = {}; // { userId → cedula }
  const skippedInvalid = [];

  for (let i = 1; i < rows.length; i++) {
    const row    = rows[i];
    const userId = String(row[idCol] ?? "").trim();
    if (!userId || userId === "0") continue;

    const cedula = String(row[cedulaCol] ?? "").trim();
    if (!cedula) continue;

    if (!CEDULA_RE.test(cedula)) {
      // Valor presente pero no parece una cédula real → ignorar
      skippedInvalid.push({ userId, cedula });
      continue;
    }

    fromSheet[userId] = cedula;
  }

  if (skippedInvalid.length > 0) {
    console.log(`\n   ⚠️  ${skippedInvalid.length} filas con valor inválido (se ignoran):`);
    skippedInvalid.slice(0, 20).forEach(({ userId, cedula }) =>
      console.log(`      id=${userId.padEnd(16)} valor="${cedula}"`)
    );
    if (skippedInvalid.length > 20) console.log(`      ... y ${skippedInvalid.length - 20} más`);
  }

  const sheetIds = Object.keys(fromSheet);
  console.log(`\n   ${sheetIds.length} filas con cédula en el sheet`);

  if (sheetIds.length === 0) {
    console.log("   Nada que sincronizar — la columna cédula está vacía en el sheet.");
    console.timeEnd("⏱  Tiempo total");
    return;
  }

  // ── 4. Leer afiliados en Supabase ────────────────────────────────────────
  console.log("\n📊 Leyendo affiliates en Supabase...");

  let query = supabase
    .from("affiliates")
    .select("shopify_customer_id, email, cedula_profesional")
    .in("shopify_customer_id", sheetIds.map(Number))
    .is("deleted_at", null);

  // Sin --force: solo los que no tienen cédula
  if (!FORCE) {
    query = query.or("cedula_profesional.is.null,cedula_profesional.eq.");
  }

  const { data: supaRows, error: errSupa } = await query;
  if (errSupa) throw new Error(`affiliates: ${errSupa.message}`);

  const supaMap = {};
  for (const a of (supaRows || [])) {
    supaMap[String(a.shopify_customer_id)] = a;
  }
  console.log(`   ${Object.keys(supaMap).length} afiliados candidatos en Supabase`);

  // ── 5. Cruzar: sheet ∩ candidatos ────────────────────────────────────────
  const candidates = [];
  for (const id of sheetIds) {
    const aff    = supaMap[id];
    if (!aff) continue; // no está en Supabase o ya tiene cédula (sin --force)

    const cedula = fromSheet[id];

    // Sin --force no hay que hacer nada si ya tiene valor (por si el OR no filtró)
    if (!FORCE && aff.cedula_profesional) continue;

    // Con --force saltamos si el valor ya es idéntico
    if (FORCE && aff.cedula_profesional === cedula) continue;

    candidates.push({
      shopify_customer_id: id,
      email:               aff.email,
      cedula_anterior:     aff.cedula_profesional || null,
      cedula:              cedula,
    });
  }

  console.log(`\n   📌 ${candidates.length} afiliados a actualizar`);

  if (candidates.length === 0) {
    console.log("   Nada que sincronizar — todos ya tienen cédula o no hay match.");
    console.timeEnd("⏱  Tiempo total");
    return;
  }

  // Preview
  console.log("\n   Preview (primeros 15):");
  candidates.slice(0, 15).forEach(c => {
    const cambio = c.cedula_anterior
      ? `"${c.cedula_anterior}" → "${c.cedula}"`
      : `→ "${c.cedula}"`;
    console.log(`   • ${(c.email || c.shopify_customer_id).padEnd(36)} ${cambio}`);
  });
  if (candidates.length > 15) console.log(`   ... y ${candidates.length - 15} más`);

  if (DRY_RUN) {
    console.log("\n   [DRY RUN] No se escribió nada.");
    console.timeEnd("⏱  Tiempo total");
    return;
  }

  // ── 6. Actualizar en Supabase (lotes de 50) ───────────────────────────────
  console.log("\n💾 Actualizando Supabase...");
  let updated = 0, errors = 0;
  const BATCH = 50;

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    await Promise.all(batch.map(async c => {
      const { error } = await supabase
        .from("affiliates")
        .update({ cedula_profesional: c.cedula })
        .eq("shopify_customer_id", Number(c.shopify_customer_id));

      if (error) {
        console.error(`   ❌ ${c.shopify_customer_id}: ${error.message}`);
        errors++;
      } else {
        updated++;
      }
    }));

    // Log progreso cada 100
    if ((i + BATCH) % 100 === 0 || i + BATCH >= candidates.length) {
      console.log(`   → ${Math.min(i + BATCH, candidates.length)} / ${candidates.length}`);
    }
  }

  // ── 7. Resumen ────────────────────────────────────────────────────────────
  console.log(`\n📊 Resumen:`);
  console.log(`   ✅ Actualizados: ${updated}`);
  console.log(`   ❌ Errores:      ${errors}`);
  console.log("\n" + "═".repeat(60));
  console.timeEnd("⏱  Tiempo total");
}

function colLetter(i) {
  if (i < 0) return "—";
  // Soporta hasta columna Z (26 columnas); más que suficiente
  return i < 26
    ? String.fromCharCode(65 + i)
    : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26));
}

main().catch(err => {
  console.error("\n💥 Error fatal:", err.message);
  process.exit(1);
});
