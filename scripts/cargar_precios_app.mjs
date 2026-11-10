// Carga masiva de precios exclusivos de la app (metafields de variante app.precio / app.hasta).
//
// Uso (desde vitaverse/):
//   node --env-file=.env --env-file=.env.local scripts/cargar_precios_app.mjs precios.csv            → simulación
//   node --env-file=.env --env-file=.env.local scripts/cargar_precios_app.mjs precios.csv --aplicar  → carga en Shopify
//
// CSV (separado por coma o punto y coma, con encabezado):
//   sku | variant_id | handle   (una de las tres: identifica la variante)
//   precio_app                  (vacío o "borrar" = quita el precio de app de esa variante)
//   hasta                       (opcional, AAAA-MM-DD: último día inclusive)
// Con handle y sin más datos se toma la primera variante del producto.
import fs from "fs";

const STORE = process.env.SHOPIFY_STORE;
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const DESCUENTO_SOSPECHOSO = 70; // % sobre el precio web: se avisa, no se bloquea

async function gql(query, variables = {}) {
  const res = await fetch(`https://${STORE}/admin/api/2025-01/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": TOKEN },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

function leerCsv(ruta) {
  const texto = fs.readFileSync(ruta, "utf8").replace(/^﻿/, "");
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  const sep = lineas[0].includes(";") ? ";" : ",";
  const cab = lineas[0].split(sep).map((c) => c.trim().toLowerCase());
  return lineas.slice(1).map((l, i) => {
    const celdas = l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    const fila = Object.fromEntries(cab.map((c, j) => [c, celdas[j] ?? ""]));
    fila._linea = i + 2;
    return fila;
  });
}

const CAMPOS = `id sku title price compareAtPrice product { title handle status }
  precioApp: metafield(namespace: "app", key: "precio") { id value }`;

async function buscarVariante(f) {
  if (f.variant_id && /^\d+$/.test(f.variant_id)) {
    const d = await gql(`query v($id: ID!) { productVariant(id: $id) { ${CAMPOS} } }`, { id: `gid://shopify/ProductVariant/${f.variant_id}` });
    return d.productVariant ? [d.productVariant] : [];
  }
  if (f.sku) {
    if (porSku.has(f.sku.toLowerCase())) return porSku.get(f.sku.toLowerCase());
    const d = await gql(`query v($q: String!) { productVariants(first: 3, query: $q) { nodes { ${CAMPOS} } } }`, { q: `sku:"${f.sku.replace(/"/g, "")}"` });
    return d.productVariants.nodes.filter((v) => (v.sku ?? "").toLowerCase() === f.sku.toLowerCase());
  }
  if (f.handle) {
    const handle = f.handle.split("/products/").pop().split(/[?#]/)[0];
    const d = await gql(`query p($h: String!) { productByIdentifier(identifier: { handle: $h }) { variants(first: 1) { nodes { ${CAMPOS} } } } }`, { h: handle });
    return d.productByIdentifier?.variants?.nodes ?? [];
  }
  return [];
}

const ruta = process.argv[2];
const aplicar = process.argv.includes("--aplicar");
if (!ruta) throw new Error("Falta el CSV");
const filas = leerCsv(ruta);

// SKU repetidos en la hoja: se usa la última fila y se avisa
const ultimaPorSku = new Map();
for (const f of filas) if (f.sku) ultimaPorSku.set(f.sku.toLowerCase(), f._linea);
for (const f of filas) {
  if (f.sku && ultimaPorSku.get(f.sku.toLowerCase()) !== f._linea) {
    console.log(`· línea ${f._linea} ${f.sku}: repetido, se usa la línea ${ultimaPorSku.get(f.sku.toLowerCase())}`);
    f._repetido = true;
  }
}

// Variantes por SKU, de a 50 por consulta (con miles de filas, una por una tarda mucho)
const porSku = new Map();
const skus = [...ultimaPorSku.keys()];
for (let i = 0; i < skus.length; i += 50) {
  const q = skus.slice(i, i + 50).map((s) => `sku:"${s.replace(/"/g, "")}"`).join(" OR ");
  const d = await gql(`query v($q: String!) { productVariants(first: 150, query: $q) { nodes { ${CAMPOS} } } }`, { q });
  for (const v of d.productVariants.nodes) {
    const k = (v.sku ?? "").toLowerCase();
    if (!ultimaPorSku.has(k)) continue;
    porSku.set(k, [...(porSku.get(k) ?? []), v]);
  }
}

const cargar = [];
const borrar = [];
let errores = 0;
const hoy = new Date().toISOString().slice(0, 10);

for (const f of filas) {
  if (f._repetido) continue;
  const ref = f.sku || f.variant_id || f.handle || "(vacío)";
  let vs = await buscarVariante(f);
  // SKU repetido en Shopify (copias archivadas o en borrador): solo cuentan las activas
  if (vs.length > 1) vs = vs.filter((x) => x.product.status === "ACTIVE");
  if (!vs.length) {
    console.log(`✗ línea ${f._linea} ${ref}: no existe (o no hay variante activa)`);
    errores++;
    continue;
  }
  for (const v of vs) procesar(f, v);
}

function procesar(f, v) {
  const nombre = `${v.product.title.split("|")[0].trim()}${v.title !== "Default Title" ? ` (${v.title})` : ""}`;
  const web = Number(v.price);

  if (!f.precio_app || f.precio_app.toLowerCase() === "borrar") {
    if (v.precioApp) { borrar.push(v.id); console.log(`– ${nombre}: se quita el precio de app`); }
    else console.log(`· ${nombre}: no tenía precio de app`);
    return;
  }
  const app = Math.round(Number(String(f.precio_app).replace(/[$\s,]/g, "")) * 100) / 100;
  // Columna opcional precio_actual: avisa si la hoja se armó con un precio web distinto al de hoy
  const actualHoja = Number(String(f.precio_actual ?? "").replace(/[$\s,]/g, ""));
  const difiere = actualHoja > 0 && Math.abs(actualHoja - web) > 0.5 ? `  ⚠ en la hoja el precio web era $${actualHoja}` : "";
  const hasta = (f.hasta ?? "").trim();
  const problemas = [];
  if (!(app > 0)) problemas.push("precio_app inválido");
  // Igual al web (o centavos arriba) vale si es menor al regular: la app cobra el de la web
  else if (app >= web && (app - web > 1 || !(Number(v.compareAtPrice) > web)))
    problemas.push(`precio app $${app} no es menor al precio web $${web}`);
  if (hasta && !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) problemas.push(`fecha "${hasta}" inválida (AAAA-MM-DD)`);
  if (hasta && hasta < hoy) problemas.push(`fecha ${hasta} ya pasó`);
  if (v.product.status !== "ACTIVE") problemas.push(`producto ${v.product.status}`);
  // --omitir-diferencias: no carga las filas cuyo precio web en la hoja no coincide con el de hoy
  if (difiere && process.argv.includes("--omitir-diferencias")) {
    console.log(`⏸ línea ${f._linea} ${f.sku} ${nombre}: omitido, web hoy $${web} y en la hoja $${actualHoja} (app $${app})`);
    return;
  }
  if (problemas.length) {
    console.log(`✗ línea ${f._linea} ${nombre}: ${problemas.join("; ")}`);
    errores++;
    return;
  }
  const desc = Math.round((1 - app / web) * 100);
  const aviso = desc > DESCUENTO_SOSPECHOSO ? `  ⚠ descuento alto` : "";
  console.log(`✓ ${nombre}: web $${web} → app $${app} (-${desc}%)${hasta ? ` hasta ${hasta}` : ""}${aviso}${difiere}`);
  const owner = v.id;
  cargar.push({ ownerId: owner, namespace: "app", key: "precio", type: "money", value: JSON.stringify({ amount: app.toFixed(2), currency_code: "MXN" }) });
  if (hasta) cargar.push({ ownerId: owner, namespace: "app", key: "hasta", type: "date", value: hasta });
}

console.log(`\n${cargar.filter((m) => m.key === "precio").length} precios a cargar, ${borrar.length} a quitar, ${errores} con error.`);
if (!aplicar) {
  console.log("Simulación: no se cambió nada. Para cargar, repetir con --aplicar.");
  process.exit(0);
}

for (let i = 0; i < cargar.length; i += 25) {
  const d = await gql(
    `mutation s($m: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $m) { userErrors { field message } } }`,
    { m: cargar.slice(i, i + 25) }
  );
  if (d.metafieldsSet.userErrors.length) console.log("errores:", JSON.stringify(d.metafieldsSet.userErrors));
}
for (let i = 0; i < borrar.length; i += 25) {
  const m = borrar.slice(i, i + 25).flatMap((ownerId) => ["precio", "hasta"].map((key) => ({ ownerId, namespace: "app", key })));
  const d = await gql(
    `mutation d($m: [MetafieldIdentifierInput!]!) { metafieldsDelete(metafields: $m) { userErrors { field message } } }`,
    { m }
  );
  if (d.metafieldsDelete.userErrors.length) console.log("errores al quitar:", JSON.stringify(d.metafieldsDelete.userErrors));
}
console.log("Listo: cargado en Shopify.");
