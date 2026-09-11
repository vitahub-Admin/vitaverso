/**
 * unify-vocab.mjs
 * Lleva todos los `suggested_product_type` de un CSV al vocabulario de
 * vocabulario.json, y avisa si queda alguno fuera.
 *
 * Hace falta porque el CSV final mezcla dos fuentes: las filas que resolvió
 * classify-products.mjs (etiquetas de las reglas) y las que pasó por
 * classify-with-ai.mjs (etiquetas del vocabulario). Este script renombra las
 * primeras. No toca categorías, ni confianzas, ni nada más.
 *
 * Es un renombrado determinista: no llama a ninguna API y no cuesta nada.
 *
 * Uso:
 *   node scripts/unify-vocab.mjs --file clasificacion_final.csv            (seco)
 *   node scripts/unify-vocab.mjs --file clasificacion_final.csv --write
 *
 * Flags:
 *   --file <path>    CSV a unificar (obligatorio)
 *   --vocab <path>   Vocabulario   (default: vocabulario.json)
 *   --write          Escribe el archivo. Sin esto solo muestra el plan.
 *   --out <path>     Destino (default: sobrescribe --file)
 */

import { readFileSync, writeFileSync } from "fs";

// Etiquetas de las reglas → etiquetas del vocabulario.
// Cada línea es un renombrado 1:1 sin ambigüedad; nada se reinterpreta.
const MAP = {
  "Aminoácidos":            "Aminoácidos y BCAA",
  "BCAA":                   "Aminoácidos y BCAA",
  "Omega 3":                "Omega 3 y aceites de pescado",
  "Vitamina B":             "Complejo B y B12",
  "Vitamina D":             "Vitamina D y K",
  "Vitamina K":             "Vitamina D y K",
  "Vitamina A":             "Vitamina A y E",
  "Vitamina E":             "Vitamina A y E",
  "Multiminerales":         "Otros minerales y multiminerales",
  "Minerales":              "Otros minerales y multiminerales",
  "Proteína":               "Proteínas en polvo y barras",
  "CoQ10":                  "CoQ10 y energía celular",
  "Sueño y descanso":       "Sueño y relajación",
  "Carbón activado":        "Detox y apoyo hepático",
  "Aceites esenciales":     "Aceites esenciales y aromaterapia",
  "Aceite corporal":        "Cuidado de la piel y cosmética",
  "Cuidado de la piel":     "Cuidado de la piel y cosmética",
  "Salud de la piel":       "Belleza: cabello, piel y uñas",
  "Aceites y grasas":       "Control de peso y metabolismo",
  "Longevidad y metabolismo": "Longevidad: NAD+, NMN y resveratrol",
  "Suplementos herbales":   "Hierbas y extractos botánicos",
  "Salud digestiva":        "Digestivos y confort intestinal",
  "Limpieza de colon":      "Digestivos y confort intestinal",
  "Vitaminas":              "Multivitamínicos",
  "CBD":                    "Hierbas y extractos botánicos",
  "Suplementos":            "",   // sin señal: mejor vacío que una etiqueta falsa
};

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
  return { headers, rows: rows.filter(r => r.some(c => c.trim() !== ""))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}

const esc = v => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ── Main ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf(n); return i !== -1 && args[i + 1] ? args[i + 1] : null; };

const filePath = flag("--file");
if (!filePath) { console.error("❌  Falta --file <ruta.csv>"); process.exit(1); }

const vocabPath = flag("--vocab") || "vocabulario.json";
const write     = args.includes("--write");
const outPath   = flag("--out") || filePath;

const rawVocab = JSON.parse(readFileSync(vocabPath, "utf8"));
const VOCAB    = new Set((Array.isArray(rawVocab) ? rawVocab : rawVocab.tipos)
                   .map(t => (typeof t === "string" ? t : t.tipo)));

const { headers, rows } = parseCSV(readFileSync(filePath, "utf8"));

const changes = {};
let touched = 0;
const after  = rows.map(r => {
  const from = r.suggested_product_type;
  if (!from || VOCAB.has(from)) return r;
  if (!(from in MAP)) return r;              // desconocido: se reporta abajo
  const to = MAP[from];
  changes[`${from} → ${to || "(vacío)"}`] = (changes[`${from} → ${to || "(vacío)"}`] || 0) + 1;
  touched++;
  return { ...r, suggested_product_type: to };
});

// ── Verificación: nadie debe quedar fuera del vocabulario ────────────────────
const leftover = {};
for (const r of after) {
  const t = r.suggested_product_type;
  if (t && !VOCAB.has(t)) leftover[t] = (leftover[t] || 0) + 1;
}

process.stderr.write(`\n${write ? "🔧  UNIFICANDO" : "🧪  SECO — no se escribe"}\n`);
process.stderr.write(`   ${rows.length} filas · vocabulario de ${VOCAB.size} tipos\n\n`);

if (touched) {
  process.stderr.write(`   Renombrados (${touched} productos):\n`);
  Object.entries(changes).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => process.stderr.write(`   ${String(v).padStart(5)}  ${k}\n`));
} else {
  process.stderr.write(`   Nada que renombrar.\n`);
}

if (Object.keys(leftover).length) {
  process.stderr.write(`\n   ⚠️  Quedan fuera del vocabulario — agregalos a MAP o a vocabulario.json:\n`);
  Object.entries(leftover).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => process.stderr.write(`   ${String(v).padStart(5)}  ${k}\n`));
} else {
  process.stderr.write(`\n   ✅  Todos los product_type están dentro del vocabulario.\n`);
}

const usados = new Set(after.map(r => r.suggested_product_type).filter(Boolean));
process.stderr.write(`\n   ${usados.size} de ${VOCAB.size} tipos en uso`);
const sinUso = [...VOCAB].filter(t => !usados.has(t));
process.stderr.write(sinUso.length ? ` · sin uso: ${sinUso.join(", ")}\n` : `\n`);

if (write) {
  writeFileSync(outPath, "﻿" + [headers.join(","), ...after.map(r => headers.map(h => esc(r[h])).join(","))].join("\n"), "utf8");
  process.stderr.write(`\n✅  ${outPath}\n\n`);
} else {
  process.stderr.write(`\n   Agregá --write para aplicarlo.\n\n`);
}
