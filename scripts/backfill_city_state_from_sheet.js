// scripts/backfill_city_state_from_sheet.js
// Lee ciudad y estado del Sheet de afiliados y actualiza Supabase
// SOLO en afiliados que no tienen esos campos ya registrados.
//
// Uso:
//   node --env-file=.env scripts/backfill_city_state_from_sheet.js
//   node --env-file=.env scripts/backfill_city_state_from_sheet.js --dry-run

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
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") || "",
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  console.log("\n🏙️  BACKFILL CIUDAD/ESTADO: Sheet → Supabase");
  if (DRY_RUN) console.log("   ⚠️  DRY RUN — no se escribe en Supabase");
  console.log("═".repeat(60));
  console.time("⏱  Tiempo total");

  // ── 1. Leer sheet ────────────────────────────────────────────────────────
  console.log("\n📄 Leyendo Google Sheet...");
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.AFILIADOS_SHEET_ID,
    range: "Hoja 1",
  });

  const rows = response.data.values || [];
  if (rows.length < 2) {
    console.log("❌ El sheet está vacío o solo tiene cabecera.");
    process.exit(0);
  }

  const headers = rows[0].map(h => String(h ?? "").trim().toLowerCase());
  console.log(`   Columnas encontradas: ${headers.length}`);
  console.log(`   Filas de datos: ${rows.length - 1}`);

  // ── 2. Ubicar columnas ───────────────────────────────────────────────────
  const idCol      = headers.indexOf("id usuario");
  const ciudadCol  = headers.findIndex(h => h.includes("ciudad"));
  const estadoCol  = headers.findIndex(h => h === "estado" || h.includes("estado"));

  if (idCol === -1) {
    console.error('\n❌ No se encontró columna "Id Usuario". Headers disponibles:');
    headers.forEach((h, i) => console.log(`   [${i}] ${h}`));
    process.exit(1);
  }

  console.log(`\n   Columna "Id Usuario": col ${idCol}  (${colLetter(idCol)})`);
  console.log(`   Columna "Ciudad":     col ${ciudadCol}  (${ciudadCol >= 0 ? colLetter(ciudadCol) : "NO ENCONTRADA"})`);
  console.log(`   Columna "Estado":     col ${estadoCol}  (${estadoCol >= 0 ? colLetter(estadoCol) : "NO ENCONTRADA"})`);

  if (ciudadCol === -1 && estadoCol === -1) {
    console.error('\n❌ No se encontraron columnas de ciudad ni estado.');
    console.log('   Headers disponibles:', headers.join(' | '));
    process.exit(1);
  }

  // ── 3. Extraer filas con datos en ciudad/estado ──────────────────────────
  const fromSheet = {};
  for (let i = 1; i < rows.length; i++) {
    const row    = rows[i];
    const userId = String(row[idCol] ?? "").trim();
    if (!userId || userId === "0") continue;

    const ciudad = ciudadCol >= 0 ? String(row[ciudadCol] ?? "").trim() : "";
    const estado = estadoCol >= 0 ? String(row[estadoCol] ?? "").trim() : "";

    if (!ciudad && !estado) continue;

    fromSheet[userId] = { ciudad: ciudad || null, estado: estado || null };
  }

  const sheetIds = Object.keys(fromSheet);
  console.log(`\n   ${sheetIds.length} filas con ciudad/estado en el sheet`);

  // ── 4. Leer afiliados en Supabase que NO tienen ciudad o estado ──────────
  console.log("\n📊 Leyendo affiliates sin ciudad/estado en Supabase...");

  const { data: sinDatos, error: errSupa } = await supabase
    .from("affiliates")
    .select("shopify_customer_id, city, state, email")
    .or("city.is.null,city.eq.,state.is.null,state.eq.")
    .is("deleted_at", null);

  if (errSupa) throw new Error(`affiliates: ${errSupa.message}`);

  // Set de IDs que necesitan actualización
  const sinDatosMap = {};
  for (const a of (sinDatos || [])) {
    const id = String(a.shopify_customer_id);
    if (!a.city || !a.state) sinDatosMap[id] = a;
  }
  console.log(`   ${Object.keys(sinDatosMap).length} afiliados sin ciudad y/o estado en Supabase`);

  // ── 5. Cruzar: sheet ∩ sin-datos ─────────────────────────────────────────
  const candidates = [];
  for (const id of sheetIds) {
    if (!sinDatosMap[id]) continue; // ya tiene datos → saltar

    const { ciudad, estado } = fromSheet[id];
    const aff = sinDatosMap[id];
    const payload = {};

    // Solo completar el campo si está vacío en Supabase Y viene del sheet
    if ((!aff.city) && ciudad)   payload.city  = ciudad;
    if ((!aff.state) && estado)  payload.state = estado;

    if (Object.keys(payload).length === 0) continue;
    candidates.push({ shopify_customer_id: id, email: aff.email, ...payload });
  }

  console.log(`\n   📌 ${candidates.length} afiliados a actualizar`);

  if (candidates.length === 0) {
    console.log("   Nada que sincronizar — todos ya tienen datos o no hay match.");
    console.timeEnd("⏱  Tiempo total");
    return;
  }

  // Preview
  console.log("\n   Preview (primeros 10):");
  candidates.slice(0, 10).forEach(c => {
    const parts = [];
    if (c.city)  parts.push(`ciudad="${c.city}"`);
    if (c.state) parts.push(`estado="${c.state}"`);
    console.log(`   • ${c.email || c.shopify_customer_id} → ${parts.join(", ")}`);
  });
  if (candidates.length > 10) console.log(`   ... y ${candidates.length - 10} más`);

  if (DRY_RUN) {
    console.log("\n   [DRY RUN] No se escribió nada.");
    console.timeEnd("⏱  Tiempo total");
    return;
  }

  // ── 6. Actualizar en Supabase ─────────────────────────────────────────────
  console.log("\n💾 Actualizando Supabase...");
  let updated = 0, errors = 0;
  const BATCH = 50;

  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    await Promise.all(batch.map(async c => {
      const payload = {};
      if (c.city)  payload.city  = c.city;
      if (c.state) payload.state = c.state;

      const { error } = await supabase
        .from("affiliates")
        .update(payload)
        .eq("shopify_customer_id", Number(c.shopify_customer_id));

      if (error) {
        console.error(`   ❌ ${c.shopify_customer_id}: ${error.message}`);
        errors++;
      } else {
        updated++;
      }
    }));
  }

  // ── 7. Resumen ────────────────────────────────────────────────────────────
  console.log(`\n📊 Resumen:`);
  console.log(`   ✅ Actualizados: ${updated}`);
  console.log(`   ❌ Errores:      ${errors}`);
  console.log("\n" + "═".repeat(60));
  console.timeEnd("⏱  Tiempo total");
}

function colLetter(i) {
  return i >= 0 ? String.fromCharCode(65 + i) : "—";
}

main().catch(err => {
  console.error("\n💥 Error fatal:", err.message);
  process.exit(1);
});
