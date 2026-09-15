/**
 * ga4-export.mjs
 * Exporta de Google Analytics 4 lo que Search Console no tiene: sesiones y
 * VENTAS por canal, tráfico que llega desde asistentes de IA, y páginas de
 * entrada orgánicas antes vs después de los core updates. Solo lectura.
 *
 * Usa la cuenta de servicio del calendario (GOOGLE_SERVICE_ACCOUNT_EMAIL_CALENDAR),
 * cuyo proyecto (noted-falcon-490700-d1) ya tiene habilitadas las APIs
 * analyticsadmin y analyticsdata.
 *
 * Requisito, una sola vez: en GA4 → Administrar → Gestión de acceso a la
 * propiedad → agregar el correo de la cuenta con rol "Lector".
 *
 * Uso:
 *   node scripts/ga4-export.mjs
 *   node scripts/ga4-export.mjs --property 123456789
 *   node scripts/ga4-export.mjs --dias 70
 *
 * Genera en vitaverse/:
 *   ga4_canales_por_mes.csv              sesiones, transacciones e ingresos por canal y mes (16 meses)
 *   ga4_trafico_ia.csv                   sesiones y ventas desde ChatGPT, Perplexity, Gemini, Copilot…
 *   ga4_landing_organico_comparacion.csv páginas de entrada orgánicas: antes vs después
 */

import { readFileSync, writeFileSync } from "fs";
import dotenv from "dotenv";
import { JWT } from "google-auth-library";

const env  = dotenv.parse(readFileSync(new URL("../.env", import.meta.url)));
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : null; };

const client = new JWT({
  email:  env.GOOGLE_SERVICE_ACCOUNT_EMAIL_CALENDAR,
  key:    (env.GOOGLE_PRIVATE_KEY_CALENDAR || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
});

async function call(url, body) {
  const { token } = await client.getAccessToken();
  const res = await fetch(url, {
    method:  body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${json.error?.message?.slice(0, 220)}`);
  return json;
}

// ── Fechas ────────────────────────────────────────────────────────────────────
const fmt     = d => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const end     = addDays(new Date(), -1);
const start   = new Date(end); start.setMonth(start.getMonth() - 16); start.setDate(1);

const DIAS        = Number(flag("--dias") || 70);
const beforeEnd   = new Date("2026-03-26");
const beforeStart = addDays(beforeEnd, -(DIAS - 1));
const afterStart  = addDays(end, -(DIAS - 1));

const UPDATES = { "202603": "core update de marzo", "202604": "fin core update de marzo", "202605": "core update de mayo", "202606": "fin core update de mayo" };

// Fuentes de asistentes de IA tal como aparecen en sessionSource
const IA_REGEX = "(chatgpt|openai|perplexity|gemini|bard|copilot|claude|anthropic|deepseek|grok|meta\\.ai|you\\.com|phind|mistral)";

// ── Helpers ───────────────────────────────────────────────────────────────────
let property;
async function report(body) {
  const rows = [];
  for (let offset = 0; ; offset += 10000) {
    const j = await call(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, { ...body, limit: 10000, offset });
    const dims = (j.dimensionHeaders || []).map(h => h.name);
    const mets = (j.metricHeaders || []).map(h => h.name);
    for (const r of j.rows || []) {
      const o = {};
      dims.forEach((d, i) => (o[d] = r.dimensionValues[i].value));
      mets.forEach((m, i) => (o[m] = Number(r.metricValues[i].value)));
      rows.push(o);
    }
    if (!j.rows || offset + j.rows.length >= (j.rowCount || 0)) break;
  }
  return rows;
}

const r2  = v => Math.round(v * 100) / 100;
const esc = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function writeCSV(file, headers, rows) {
  writeFileSync(new URL(`../${file}`, import.meta.url), "﻿" + [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n"), "utf8");
  console.log(`   → ${file} (${rows.length} filas)`);
}
const pct   = (a, b) => (a ? `${Math.round(((b - a) / a) * 100)}%` : "—");
const money = v => `$${Math.round(v).toLocaleString("es-MX")}`;

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const { accountSummaries = [] } = await call("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
  const props = accountSummaries.flatMap(a => (a.propertySummaries || []).map(p => ({ ...p, cuenta: a.displayName })));
  if (!props.length) {
    console.error(`❌  ${env.GOOGLE_SERVICE_ACCOUNT_EMAIL_CALENDAR} no tiene acceso a ninguna propiedad de GA4.`);
    console.error("   GA4 → Administrar → Gestión de acceso a la propiedad → agregar con rol Lector.");
    process.exit(1);
  }
  // Elegir la propiedad que mide la TIENDA: la que tiene un flujo web a vitahub.mx.
  // No alcanza con el nombre: "pro-vitahub" también contiene "vitahub" y es la app de afiliados.
  console.log("\n   Propiedades accesibles:");
  let tienda = null;
  for (const p of props) {
    const { dataStreams = [] } = await call(`https://analyticsadmin.googleapis.com/v1beta/${p.property}/dataStreams`);
    const webs = dataStreams.filter(s => s.webStreamData).map(s => s.webStreamData.defaultUri);
    console.log(`   ${p.property.padEnd(22)} ${p.displayName.padEnd(28)} ${webs.join(", ") || "(sin flujo web)"}`);
    if (!tienda && webs.some(u => /\/\/(www\.)?vitahub\.mx\/?$/i.test(u))) tienda = p.property;
  }
  property = flag("--property") ? `properties/${flag("--property")}` : tienda;
  if (!property) {
    console.error("\n❌  No encontré una propiedad con flujo web de vitahub.mx. Indícala con --property <id>.");
    process.exit(1);
  }
  const nombre = props.find(p => p.property === property)?.displayName || property;

  console.log(`\n📊  GA4 — ${nombre} (${property})`);
  console.log(`   16 meses: ${fmt(start)} → ${fmt(end)}`);
  console.log(`   Antes:    ${fmt(beforeStart)} → ${fmt(beforeEnd)} · Después: ${fmt(afterStart)} → ${fmt(end)}\n`);

  // 1. Canales por mes
  const canales = await report({
    dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
    dimensions: [{ name: "yearMonth" }, { name: "sessionDefaultChannelGroup" }],
    metrics:    [{ name: "sessions" }, { name: "transactions" }, { name: "purchaseRevenue" }],
  });
  writeCSV("ga4_canales_por_mes.csv", ["yearMonth", "sessionDefaultChannelGroup", "sessions", "transactions", "purchaseRevenue"], canales);

  const organico = canales.filter(r => r.sessionDefaultChannelGroup === "Organic Search").sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
  const maxS = Math.max(...organico.map(r => r.sessions), 1);
  console.log("\n   Búsqueda orgánica por mes (sesiones · ventas · ingresos):");
  for (const r of organico)
    console.log(`   ${r.yearMonth}  ${String(r.sessions).padStart(7)} ${"█".repeat(Math.round((r.sessions / maxS) * 30)).padEnd(30)} ${String(r.transactions).padStart(5)} · ${money(r.purchaseRevenue).padStart(11)} ${UPDATES[r.yearMonth] ? "← " + UPDATES[r.yearMonth] : ""}`);

  // 2. Tráfico desde IAs
  const ia = await report({
    dateRanges: [{ startDate: fmt(start), endDate: fmt(end) }],
    dimensions: [{ name: "yearMonth" }, { name: "sessionSource" }],
    metrics:    [{ name: "sessions" }, { name: "transactions" }, { name: "purchaseRevenue" }],
    dimensionFilter: { filter: { fieldName: "sessionSource", stringFilter: { matchType: "PARTIAL_REGEXP", value: IA_REGEX, caseSensitive: false } } },
  });
  writeCSV("ga4_trafico_ia.csv", ["yearMonth", "sessionSource", "sessions", "transactions", "purchaseRevenue"], ia);
  const porFuente = {};
  for (const r of ia) { const k = r.sessionSource; porFuente[k] ||= { s: 0, t: 0, $: 0 }; porFuente[k].s += r.sessions; porFuente[k].t += r.transactions; porFuente[k].$ += r.purchaseRevenue; }
  console.log("\n   Tráfico desde asistentes de IA (16 meses):");
  if (!ia.length) console.log("   ninguna sesión registrada desde fuentes de IA");
  for (const [k, v] of Object.entries(porFuente).sort((a, b) => b[1].s - a[1].s))
    console.log(`   ${k.padEnd(28)} ${String(v.s).padStart(6)} sesiones · ${String(v.t).padStart(4)} ventas · ${money(v.$)}`);

  // 3. Páginas de entrada orgánicas: antes vs después
  const base = {
    dimensions: [{ name: "landingPage" }],
    metrics:    [{ name: "sessions" }, { name: "transactions" }, { name: "purchaseRevenue" }],
    dimensionFilter: { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search" } } },
  };
  const [antes, despues] = await Promise.all([
    report({ ...base, dateRanges: [{ startDate: fmt(beforeStart), endDate: fmt(beforeEnd) }] }),
    report({ ...base, dateRanges: [{ startDate: fmt(afterStart),  endDate: fmt(end) }] }),
  ]);
  const m = new Map();
  for (const r of antes)   m.set(r.landingPage, { pagina: r.landingPage, ses_antes: r.sessions, ventas_antes: r.transactions, ingresos_antes: r2(r.purchaseRevenue), ses_despues: 0, ventas_despues: 0, ingresos_despues: 0 });
  for (const r of despues) { const o = m.get(r.landingPage) || { pagina: r.landingPage, ses_antes: 0, ventas_antes: 0, ingresos_antes: 0 }; Object.assign(o, { ses_despues: r.sessions, ventas_despues: r.transactions, ingresos_despues: r2(r.purchaseRevenue) }); m.set(r.landingPage, o); }
  const comp = [...m.values()].map(o => ({ ...o, dif_ses: o.ses_despues - o.ses_antes, dif_ingresos: r2(o.ingresos_despues - o.ingresos_antes) })).sort((a, b) => a.dif_ingresos - b.dif_ingresos);
  writeCSV("ga4_landing_organico_comparacion.csv", ["pagina", "ses_antes", "ses_despues", "dif_ses", "ventas_antes", "ventas_despues", "ingresos_antes", "ingresos_despues", "dif_ingresos"], comp);

  const tot = comp.reduce((a, r) => ({ sa: a.sa + r.ses_antes, sd: a.sd + r.ses_despues, ia: a.ia + r.ingresos_antes, id: a.id + r.ingresos_despues }), { sa: 0, sd: 0, ia: 0, id: 0 });
  console.log(`\n   Orgánico, ${DIAS} días antes vs últimos ${DIAS}: sesiones ${tot.sa} → ${tot.sd} (${pct(tot.sa, tot.sd)}) · ingresos ${money(tot.ia)} → ${money(tot.id)} (${pct(tot.ia, tot.id)})`);
  console.log("\n   Páginas de entrada orgánicas que más ingresos perdieron:");
  comp.slice(0, 15).forEach(r => console.log(`   ${money(r.dif_ingresos).padStart(10)}  ${String(r.dif_ses).padStart(6)} ses  ${r.pagina.slice(0, 70)}`));
  console.log();
})().catch(e => { console.error("\n❌ ", e.message); process.exit(1); });
