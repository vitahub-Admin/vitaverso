// scripts/audit_recovery_carts.js
// Diagnóstico de sharecarts para el proceso de recovery.
//
// Modos:
//   --hoy       Solo los convocados hoy (recovery_exported_at >= hoy)
//   --3dias     Todos los de los últimos 3 días, con o sin phone, con o sin nombre
//               (sin filtrar recovery_exported_at)
//
// Uso:
//   node --env-file=.env scripts/audit_recovery_carts.js --hoy
//   node --env-file=.env scripts/audit_recovery_carts.js --3dias

import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const MODE_HOY   = process.argv.includes("--hoy");
const MODE_3DIAS = process.argv.includes("--3dias");

if (!MODE_HOY && !MODE_3DIAS) {
  console.error("Especificá un modo: --hoy  o  --3dias");
  process.exitCode = 1;
  process.exit();
}

function fmt(d) { return new Date(d).toLocaleString("es-MX", { timeZone: "America/Mexico_City" }); }

async function main() {
  const now   = new Date();
  const today = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // ── Modo --hoy: los que fueron convocados hoy ─────────────────────────────
  if (MODE_HOY) {
    console.log(`\n📋 CONVOCADOS HOY (${today})`);
    console.log("═".repeat(70));

    const { data: carts, error } = await supabase
      .from("sharecarts")
      .select("id, phone, name, token, owner_id, created_at, recovery_exported_at")
      .gte("recovery_exported_at", `${today}T00:00:00Z`)
      .order("recovery_exported_at", { ascending: false });

    if (error) throw new Error(error.message);
    if (!carts?.length) {
      console.log("   (ninguno convocado hoy todavía)");
      return;
    }

    // Traer especialistas
    const ownerIds = [...new Set(carts.map(c => c.owner_id).filter(Boolean))];
    const { data: affiliates } = await supabase
      .from("affiliates")
      .select("shopify_customer_id, first_name, last_name")
      .in("shopify_customer_id", ownerIds);

    const affMap = Object.fromEntries(
      (affiliates || []).map(a => [String(a.shopify_customer_id), `${a.first_name || ""} ${a.last_name || ""}`.trim()])
    );

    // Contadores
    let sinNombre = 0, sinPhone = 0;

    console.log(`\nTotal convocados: ${carts.length}\n`);
    console.log("  #  | Teléfono        | Nombre (RAW)          | Especialista          | Creado");
    console.log("─────┼─────────────────┼───────────────────────┼───────────────────────┼──────────────────");

    carts.forEach((c, i) => {
      const hasNombre = c.name && c.name.trim().length > 0;
      const hasPhone  = c.phone && c.phone.trim().length > 0;
      if (!hasNombre) sinNombre++;
      if (!hasPhone)  sinPhone++;

      const nombreFlag = !hasNombre ? " ⚠️ NULL" : "";
      const phoneStr   = (c.phone || "(sin tel)").padEnd(15);
      const nameStr    = (c.name  || "NULL").padEnd(20) + nombreFlag;
      const specStr    = (affMap[String(c.owner_id)] || `owner:${c.owner_id}`).padEnd(20);
      const fechaStr   = fmt(c.created_at);

      console.log(`  ${String(i+1).padStart(2)} | ${phoneStr} | ${nameStr.padEnd(21)} | ${specStr} | ${fechaStr}`);
    });

    console.log("\n─".repeat(70));
    console.log(`✅ Con nombre:  ${carts.length - sinNombre}`);
    console.log(`⚠️  Sin nombre:  ${sinNombre}   ← estos llegan como "Cliente" al XLSX`);
    console.log(`📵 Sin teléfono: ${sinPhone}`);
    return;
  }

  // ── Modo --3dias: todos los de los últimos 3 días, sin filtros ────────────
  if (MODE_3DIAS) {
    const from3 = new Date(now); from3.setDate(now.getDate() - 3);
    const fromStr = from3.toISOString().slice(0, 10);

    console.log(`\n🗂️  TODOS LOS SHARECARTS (${fromStr} → ${today}), SIN FILTROS`);
    console.log("═".repeat(70));

    const { data: carts, error } = await supabase
      .from("sharecarts")
      .select("id, phone, name, token, owner_id, created_at, recovery_exported_at")
      .gte("created_at", `${fromStr}T00:00:00Z`)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    if (!carts?.length) {
      console.log("   (sin carritos en los últimos 3 días)");
      return;
    }

    // Traer especialistas
    const ownerIds = [...new Set(carts.map(c => c.owner_id).filter(Boolean))];
    const { data: affiliates } = await supabase
      .from("affiliates")
      .select("shopify_customer_id, first_name, last_name")
      .in("shopify_customer_id", ownerIds);

    const affMap = Object.fromEntries(
      (affiliates || []).map(a => [String(a.shopify_customer_id), `${a.first_name || ""} ${a.last_name || ""}`.trim()])
    );

    // Traer órdenes convertidas
    const { data: orders } = await supabase
      .from("orders")
      .select("share_cart")
      .not("share_cart", "is", null)
      .gte("shopify_created_at", `${fromStr}T00:00:00Z`);

    const convertedTokens = new Set((orders || []).map(r => r.share_cart));

    // Clasificar
    let sinNombre = 0, sinPhone = 0, convertidos = 0, yaExportados = 0, pendientes = 0;

    const rows = carts.map(c => {
      const hasNombre    = !!(c.name && c.name.trim());
      const hasPhone     = !!(c.phone && c.phone.trim());
      const convirtio    = convertedTokens.has(c.token);
      const exportado    = !!c.recovery_exported_at;

      if (!hasNombre) sinNombre++;
      if (!hasPhone)  sinPhone++;
      if (convirtio)  convertidos++;
      if (exportado && !convirtio) yaExportados++;
      if (!exportado && !convirtio && hasPhone) pendientes++;

      const estado = convirtio  ? "✅ Compró"
                   : exportado  ? "📤 Exportado"
                   : !hasPhone  ? "📵 Sin tel"
                   : "🔴 Pendiente";

      return { c, hasNombre, hasPhone, convirtio, exportado, estado,
               spec: affMap[String(c.owner_id)] || `owner:${c.owner_id}` };
    });

    // Mostrar tabla resumida
    console.log(`\nTotal carts: ${carts.length}\n`);
    console.log("  Estado      | Teléfono        | Nombre (RAW)           | Especialista          | Creado");
    console.log("─────────────┼─────────────────┼────────────────────────┼───────────────────────┼──────────────────");

    rows.forEach(({ c, hasNombre, estado, spec }) => {
      const nombreRaw  = (c.name  || "NULL").padEnd(22);
      const phoneStr   = (c.phone || "(sin tel)").padEnd(15);
      const specStr    = spec.padEnd(20);
      const flag       = !hasNombre ? " ⚠️" : "";
      console.log(`  ${estado.padEnd(11)} | ${phoneStr} | ${nombreRaw}${flag.padEnd(3)} | ${specStr} | ${fmt(c.created_at)}`);
    });

    console.log("\n─".repeat(70));
    console.log(`📊 Total:              ${carts.length}`);
    console.log(`✅ Convirtieron:       ${convertidos}`);
    console.log(`📤 Ya exportados:      ${yaExportados}   (no vuelven a salir en el botón)`);
    console.log(`🔴 Pendientes reales:  ${pendientes}   (con phone, no exportado, no compró)`);
    console.log(`📵 Sin teléfono:       ${sinPhone}   (nunca entran al recovery)`);
    console.log(`⚠️  Sin nombre (NULL):  ${sinNombre}   (llegan como "Cliente" al XLSX)`);
  }
}

main()
  .then(() => { process.exitCode = 0; })
  .catch(err => {
    console.error("\n💥", err.message);
    process.exitCode = 1;
  });
