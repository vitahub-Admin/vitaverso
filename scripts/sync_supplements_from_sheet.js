// scripts/sync_supplements_from_sheet.js
// Lee columnas "recomienda suplementos" y "que recomienda" del Sheet de afiliados
// y actualiza recommends_supplements / supplement_types en Supabase.

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

// Convierte el valor de la celda "recomienda suplementos" a boolean
function toBoolean(val) {
  if (!val) return null;
  const v = String(val).trim().toLowerCase();
  if (["sí", "si", "yes", "true", "1", "x"].includes(v)) return true;
  if (["no", "false", "0"].includes(v)) return false;
  return null; // valor ambiguo → no tocar
}

async function main() {
  console.log("\n🚀 SYNC SUPLEMENTOS: Sheet → Supabase");
  console.log("═".repeat(60));

  // ── 1. Leer sheet completo ────────────────────────────────────────────────
  console.log("📄 Leyendo Google Sheet...");
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

  const headers = rows[0].map(h => h?.trim().toLowerCase());
  console.log(`   Total filas (sin cabecera): ${rows.length - 1}`);

  // ── 2. Ubicar columnas relevantes ─────────────────────────────────────────
  const idCol      = headers.indexOf("id usuario");
  const recomiendaCol = headers.findIndex(h =>
    h.includes("recomienda suplementos") || h.includes("recomienda supl")
  );
  const quéCol     = headers.findIndex(h =>
    h.includes("que recomienda") || h.includes("qué recomienda")
  );

  if (idCol === -1) {
    console.error("❌ No se encontró columna 'Id Usuario' en el sheet.");
    process.exit(1);
  }
  if (recomiendaCol === -1 && quéCol === -1) {
    console.error("❌ No se encontraron las columnas de suplementos en el sheet.");
    process.exit(1);
  }

  console.log(`   Columna "Id Usuario":              col ${idCol} (${String.fromCharCode(65 + idCol)})`);
  console.log(`   Columna "recomienda suplementos":  col ${recomiendaCol} (${recomiendaCol >= 0 ? String.fromCharCode(65 + recomiendaCol) : "—"})`);
  console.log(`   Columna "que recomienda":          col ${quéCol} (${quéCol >= 0 ? String.fromCharCode(65 + quéCol) : "—"})`);

  // ── 3. Filtrar filas con datos en alguna de las dos columnas ──────────────
  const candidates = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const userId = row[idCol]?.trim();
    if (!userId) continue;

    const rawRecomienda = recomiendaCol >= 0 ? row[recomiendaCol]?.trim() : undefined;
    const rawQue        = quéCol >= 0        ? row[quéCol]?.trim()        : undefined;

    const hasData = (rawRecomienda && rawRecomienda !== "") ||
                    (rawQue && rawQue !== "");
    if (!hasData) continue;

    candidates.push({
      shopify_customer_id: userId,
      recommends_supplements: recomiendaCol >= 0 ? toBoolean(rawRecomienda) : null,
      supplement_types:       rawQue || null,
    });
  }

  console.log(`\n   📌 Filas con datos en columnas de suplementos: ${candidates.length}`);

  if (candidates.length === 0) {
    console.log("   Nada que sincronizar.");
    process.exit(0);
  }

  // Preview de los primeros 5
  console.log("\n   Preview (primeros 5):");
  candidates.slice(0, 5).forEach(c => {
    console.log(`   • ID ${c.shopify_customer_id} → recomienda=${c.recommends_supplements}, tipos="${c.supplement_types}"`);
  });

  // ── 4. Actualizar Supabase ────────────────────────────────────────────────
  console.log("\n💾 Actualizando affiliates en Supabase...");

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  // Procesar en batches de 50
  const BATCH = 50;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);

    await Promise.all(batch.map(async (c) => {
      const payload = {};
      if (c.recommends_supplements !== null)
        payload.recommends_supplements = c.recommends_supplements;
      if (c.supplement_types !== null)
        payload.supplement_types = c.supplement_types;

      if (Object.keys(payload).length === 0) return;

      const { data, error } = await supabase
        .from("affiliates")
        .update(payload)
        .eq("shopify_customer_id", c.shopify_customer_id)
        .select("id, shopify_customer_id")
        .maybeSingle();

      if (error) {
        console.error(`   ❌ Error ID ${c.shopify_customer_id}: ${error.message}`);
        errors++;
      } else if (!data) {
        console.warn(`   ⚠️  ID ${c.shopify_customer_id} no encontrado en affiliates`);
        notFound++;
      } else {
        updated++;
      }
    }));

    const processed = Math.min(i + BATCH, candidates.length);
    console.log(`   📦 ${processed}/${candidates.length} procesados`);
  }

  // ── 5. Resumen ─────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("📊 RESUMEN");
  console.log(`   ✅ Actualizados:    ${updated}`);
  console.log(`   ⚠️  No encontrados: ${notFound}`);
  console.log(`   ❌ Errores:         ${errors}`);
  console.log("═".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("\n💥 Error fatal:", err);
    process.exit(1);
  });
