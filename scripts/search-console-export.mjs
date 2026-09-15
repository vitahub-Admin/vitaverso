/**
 * search-console-export.mjs
 * Exporta datos de Google Search Console de vitahub.mx usando la cuenta de
 * servicio del .env (por default la del calendario; --cuenta n8n para la otra). Solo lectura.
 *
 * Requisitos, una sola vez:
 *   1. Habilitar "Google Search Console API" en el proyecto de Google Cloud
 *      de la cuenta de servicio.
 *   2. Agregar el correo de la cuenta como usuario de la propiedad en Search
 *      Console (permiso "Restringido" alcanza).
 *
 * Uso:
 *   node scripts/search-console-export.mjs
 *   node scripts/search-console-export.mjs --site sc-domain:vitahub.mx
 *   node scripts/search-console-export.mjs --dias 70
 *
 * Genera en vitaverse/:
 *   gsc_por_fecha.csv              clics, impresiones, CTR y posición por día (16 meses)
 *   gsc_paginas_comparacion.csv    por URL: antes vs después de los core updates
 *   gsc_consultas_comparacion.csv  por búsqueda: antes vs después
 */

import { readFileSync, writeFileSync } from "fs";
import dotenv from "dotenv";
import { JWT } from "google-auth-library";

const env = dotenv.parse(readFileSync(new URL("../.env", import.meta.url)));
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : null; };

// La API está habilitada en el proyecto de la cuenta del calendario (noted-falcon-490700-d1).
// La de n8n (vitahub-435120) no tiene la API activa ni permisos para activarla.
const CUENTAS = {
  calendario: { email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL_CALENDAR, key: env.GOOGLE_PRIVATE_KEY_CALENDAR },
  n8n:        { email: env.GOOGLE_CLIENT_EMAIL,                   key: env.GOOGLE_PRIVATE_KEY },
};
const cuenta = CUENTAS[flag("--cuenta") || "calendario"];
if (!cuenta?.email) { console.error("❌  Cuenta desconocida. Usa --cuenta calendario o --cuenta n8n"); process.exit(1); }

const client = new JWT({
  email:  cuenta.email,
  key:    (cuenta.key || "").replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
});

const API = "https://searchconsole.googleapis.com/webmasters/v3";
async function api(path, body) {
  const { token } = await client.getAccessToken();
  const res = await fetch(API + path, {
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

const end   = addDays(new Date(), -3);                 // GSC tiene ~2-3 días de retraso
const start = new Date(end); start.setMonth(start.getMonth() - 16); start.setDate(start.getDate() + 1);

// Ventanas de comparación del mismo largo: antes del core update de marzo vs lo último disponible
const DIAS        = Number(flag("--dias") || 70);
const beforeEnd   = new Date("2026-03-26");
const beforeStart = addDays(beforeEnd, -(DIAS - 1));
const afterStart  = addDays(end, -(DIAS - 1));

const UPDATES = [
  ["2026-03-27", "2026-04-08", "core update de marzo"],
  ["2026-05-21", "2026-06-02", "core update de mayo"],
];

// ── Consultas ─────────────────────────────────────────────────────────────────
let site;
async function query(body) {
  const rows = [];
  for (let startRow = 0; ; startRow += 25000) {
    const j = await api(`/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { ...body, rowLimit: 25000, startRow });
    rows.push(...(j.rows || []));
    if (!j.rows || j.rows.length < 25000) break;
  }
  return rows;
}

async function compare(dimension) {
  const [antes, despues] = await Promise.all([
    query({ startDate: fmt(beforeStart), endDate: fmt(beforeEnd), dimensions: [dimension] }),
    query({ startDate: fmt(afterStart),  endDate: fmt(end),       dimensions: [dimension] }),
  ]);
  const map = new Map();
  for (const r of antes) map.set(r.keys[0], { clave: r.keys[0], clics_antes: r.clicks, impr_antes: r.impressions, pos_antes: r.position, clics_despues: 0, impr_despues: 0, pos_despues: null });
  for (const r of despues) {
    const o = map.get(r.keys[0]) || { clave: r.keys[0], clics_antes: 0, impr_antes: 0, pos_antes: null };
    Object.assign(o, { clics_despues: r.clicks, impr_despues: r.impressions, pos_despues: r.position });
    map.set(r.keys[0], o);
  }
  return [...map.values()]
    .map(o => ({ ...o, dif_clics: o.clics_despues - o.clics_antes, dif_impr: o.impr_despues - o.impr_antes }))
    .sort((a, b) => a.dif_clics - b.dif_clics);
}

// ── CSV y resúmenes ───────────────────────────────────────────────────────────
const r2  = v => (v == null ? "" : Math.round(v * 100) / 100);
const esc = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
function writeCSV(file, headers, rows) {
  writeFileSync(new URL(`../${file}`, import.meta.url), "﻿" + [headers.join(","), ...rows.map(r => headers.map(h => esc(r[h])).join(","))].join("\n"), "utf8");
  console.log(`   → ${file} (${rows.length} filas)`);
}

const esMarca = q => /vita\s?hub/i.test(q);
function tipoURL(u) {
  const p = new URL(u).pathname;
  if (p === "/" || p === "") return "home";
  if (p.startsWith("/products/"))    return "productos";
  if (p.startsWith("/collections/")) return "colecciones";
  if (p.startsWith("/blogs/"))       return "blog";
  if (p.startsWith("/pages/"))       return "páginas";
  return "otras";
}
function sumar(rows, keyFn) {
  const out = {};
  for (const r of rows) {
    const k = keyFn(r.clave);
    out[k] ||= { clics_antes: 0, clics_despues: 0, impr_antes: 0, impr_despues: 0 };
    out[k].clics_antes += r.clics_antes; out[k].clics_despues += r.clics_despues;
    out[k].impr_antes  += r.impr_antes;  out[k].impr_despues  += r.impr_despues;
  }
  return out;
}
const pct = (a, b) => (a ? `${Math.round(((b - a) / a) * 100)}%` : "—");

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const { siteEntry = [] } = await api("/sites");
  if (!siteEntry.length) {
    console.error(`❌  ${cuenta.email} no tiene acceso a ninguna propiedad de Search Console.`);
    console.error("   Agrégala como usuario en Search Console → Configuración → Usuarios y permisos.");
    process.exit(1);
  }
  site = flag("--site")
    || siteEntry.find(s => s.siteUrl === "sc-domain:vitahub.mx")?.siteUrl
    || siteEntry.find(s => s.siteUrl.includes("vitahub"))?.siteUrl;
  if (!site) { console.error("❌  No encontré la propiedad de vitahub. Disponibles:", siteEntry.map(s => s.siteUrl).join(", ")); process.exit(1); }

  console.log(`\n📈  Search Console — ${site}`);
  console.log(`   16 meses: ${fmt(start)} → ${fmt(end)}`);
  console.log(`   Antes:    ${fmt(beforeStart)} → ${fmt(beforeEnd)}   (${DIAS} días previos al core update de marzo)`);
  console.log(`   Después:  ${fmt(afterStart)} → ${fmt(end)}   (últimos ${DIAS} días)\n`);

  // 1. Por fecha
  const diario = (await query({ startDate: fmt(start), endDate: fmt(end), dimensions: ["date"] }))
    .map(r => ({ fecha: r.keys[0], clics: r.clicks, impresiones: r.impressions, ctr: r2(r.ctr * 100), posicion: r2(r.position) }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  writeCSV("gsc_por_fecha.csv", ["fecha", "clics", "impresiones", "ctr", "posicion"], diario);

  const mensual = {};
  for (const d of diario) { const m = d.fecha.slice(0, 7); mensual[m] ||= { clics: 0, impr: 0 }; mensual[m].clics += d.clics; mensual[m].impr += d.impresiones; }
  console.log("\n   Clics por mes:");
  const maxClics = Math.max(...Object.values(mensual).map(v => v.clics), 1);
  for (const [m, v] of Object.entries(mensual)) {
    const marca = UPDATES.filter(([a, b]) => a.slice(0, 7) === m || b.slice(0, 7) === m).map(u => u[2]).join(", ");
    console.log(`   ${m}  ${String(v.clics).padStart(7)}  ${"█".repeat(Math.round((v.clics / maxClics) * 40)).padEnd(40)} ${marca ? "← " + marca : ""}`);
  }

  // 2. Páginas
  const paginas = await compare("page");
  writeCSV("gsc_paginas_comparacion.csv",
    ["clave", "clics_antes", "clics_despues", "dif_clics", "impr_antes", "impr_despues", "dif_impr", "pos_antes", "pos_despues"],
    paginas.map(p => ({ ...p, pos_antes: r2(p.pos_antes), pos_despues: r2(p.pos_despues) })));

  // 3. Consultas
  const consultas = await compare("query");
  writeCSV("gsc_consultas_comparacion.csv",
    ["clave", "clics_antes", "clics_despues", "dif_clics", "impr_antes", "impr_despues", "dif_impr", "pos_antes", "pos_despues"],
    consultas.map(q => ({ ...q, pos_antes: r2(q.pos_antes), pos_despues: r2(q.pos_despues) })));

  // Resúmenes
  console.log("\n   Por tipo de URL (clics antes → después):");
  for (const [k, v] of Object.entries(sumar(paginas, tipoURL)).sort((a, b) => b[1].clics_antes - a[1].clics_antes))
    console.log(`   ${k.padEnd(12)} ${String(v.clics_antes).padStart(6)} → ${String(v.clics_despues).padEnd(6)} ${pct(v.clics_antes, v.clics_despues).padStart(5)}   impresiones ${pct(v.impr_antes, v.impr_despues)}`);

  console.log("\n   Marca vs genéricas (clics antes → después):");
  for (const [k, v] of Object.entries(sumar(consultas, q => (esMarca(q) ? "con 'vitahub'" : "genéricas"))))
    console.log(`   ${k.padEnd(14)} ${String(v.clics_antes).padStart(6)} → ${String(v.clics_despues).padEnd(6)} ${pct(v.clics_antes, v.clics_despues).padStart(5)}   impresiones ${pct(v.impr_antes, v.impr_despues)}`);

  console.log("\n   Páginas que más clics perdieron:");
  paginas.slice(0, 15).forEach(p => console.log(`   ${String(p.dif_clics).padStart(6)}  ${new URL(p.clave).pathname.slice(0, 80)}`));

  console.log("\n   Búsquedas que más clics perdieron:");
  consultas.slice(0, 15).forEach(q => console.log(`   ${String(q.dif_clics).padStart(6)}  ${q.clave.slice(0, 80)}`));
  console.log();
})().catch(e => { console.error("\n❌ ", e.message); process.exit(1); });
