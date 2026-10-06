/**
 * Carga `product_catalog.modo_de_uso` desde la descripción de cada producto en
 * Shopify.
 *
 *   node scripts/cargar_modo_de_uso.mjs            → simulacro: lee y reporta, NO escribe
 *   node scripts/cargar_modo_de_uso.mjs --aplicar  → escribe la columna
 *
 * Requiere haber corrido antes scripts/alter_product_catalog_modo_de_uso.sql.
 *
 * Solo toca la columna `modo_de_uso`, y solo en productos donde la descripción
 * trae el texto. No borra ni pisa nada más; un producto sin "Modo de uso" en su
 * descripción queda como estaba.
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { extraerModoDeUso } from '../src/lib/modoDeUso.js';

dotenv.config({ path: '.env' });

const APLICAR = process.argv.includes('--aplicar');

const GQL = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;
const H = {
  'Content-Type': 'application/json',
  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
};
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

// ── 1. Productos del catálogo (los únicos que importan) ─────────────────────
const enCatalogo = new Set();
for (let desde = 0; ; desde += 1000) {
  const { data, error } = await supabase
    .from('product_catalog').select('product_id').range(desde, desde + 999);
  if (error) throw error;
  data.forEach(r => enCatalogo.add(String(r.product_id)));
  if (data.length < 1000) break;
}
console.log(`Productos distintos en product_catalog: ${enCatalogo.size}`);

// ── 2. Descripciones en Shopify, paginadas ──────────────────────────────────
const resultados = [];   // { id, title, texto }
const conEncabezadoSinTexto = [];
let cursor = null, revisados = 0;

do {
  const q = `{ products(first: 50${cursor ? `, after: "${cursor}"` : ''}) {
    pageInfo { hasNextPage endCursor }
    nodes { id title descriptionHtml }
  } }`;
  const r = await (await fetch(GQL, { method: 'POST', headers: H, body: JSON.stringify({ query: q }) })).json();
  if (r.errors) throw new Error(JSON.stringify(r.errors));

  const { nodes, pageInfo } = r.data.products;
  for (const p of nodes) {
    const id = p.id.replace('gid://shopify/Product/', '');
    if (!enCatalogo.has(id)) continue;
    revisados++;

    const texto = extraerModoDeUso(p.descriptionHtml);
    if (texto) resultados.push({ id, title: p.title, texto });
    else if (/modo\s+de\s+uso/i.test(p.descriptionHtml || '')) conEncabezadoSinTexto.push({ id, title: p.title });
  }
  cursor = pageInfo.hasNextPage ? pageInfo.endCursor : null;
} while (cursor);

// ── 3. Reporte ──────────────────────────────────────────────────────────────
console.log(`\nRevisados en Shopify (del catálogo): ${revisados}`);
console.log(`  con Modo de uso extraído : ${resultados.length}`);
console.log(`  encabezado sin poder leer : ${conEncabezadoSinTexto.length}   ← revisar a mano`);
console.log(`  sin Modo de uso           : ${revisados - resultados.length - conEncabezadoSinTexto.length}`);

console.log('\nMuestra:');
for (const x of resultados.slice(0, 5)) console.log(`  · ${x.title.slice(0, 48)}\n      "${x.texto.slice(0, 140)}"`);

if (conEncabezadoSinTexto.length) {
  console.log('\nTienen el encabezado pero no se pudo leer (primeros 8):');
  conEncabezadoSinTexto.slice(0, 8).forEach(x => console.log(`  · ${x.id} ${x.title.slice(0, 55)}`));
}

if (!APLICAR) {
  console.log('\nSimulacro: no se escribió nada. Con --aplicar se carga la columna.');
  process.exit(0);
}

// ── 4. Escritura ────────────────────────────────────────────────────────────
let ok = 0, fallo = 0;
for (const x of resultados) {
  const { error } = await supabase
    .from('product_catalog').update({ modo_de_uso: x.texto }).eq('product_id', Number(x.id));
  if (error) { fallo++; if (fallo === 1) console.error('Primer error:', error.message); }
  else ok++;
}
console.log(`\nEscritos: ${ok} productos · fallidos: ${fallo}`);
