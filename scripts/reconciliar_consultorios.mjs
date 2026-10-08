/**
 * Compara el libro de consignación (Supabase) con el almacén "Consultorios" de
 * BaseLinker, producto por producto. SOLO LEE: no cambia nada en ningún lado.
 *
 *   node scripts/reconciliar_consultorios.mjs
 *
 * Una diferencia significa que algún movimiento no se reflejó en BaseLinker
 * (falló la llamada, o es anterior a la integración).
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env' });

const INVENTARIO = Number(process.env.BASELINKER_INVENTORY_ID || 50176);
const CONSULTORIOS = Number(process.env.BASELINKER_ALMACEN_CONSULTORIOS || 76352);
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const bl = async (method, parameters = {}) => (await (await fetch('https://api.baselinker.com/connector.php', {
  method: 'POST',
  headers: { 'X-BLToken': process.env.BASELINKER_TOKEN, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ method, parameters: JSON.stringify(parameters) }),
})).json());

const { data: libro } = await s.from('consignment_stock').select('variant_id, product_id, disponible, title, variant_title');
const porVariante = new Map();
for (const r of libro || []) {
  const k = String(r.variant_id);
  const x = porVariante.get(k) || { ...r, disponible: 0 };
  x.disponible += Number(r.disponible || 0);
  porVariante.set(k, x);
}

const { data: cat } = await s.from('product_catalog').select('variant_id, sku').in('variant_id', [...porVariante.keys()].map(Number));
const skuDe = Object.fromEntries((cat || []).map(c => [String(c.variant_id), c.sku]));

let diferencias = 0;
for (const [variante, r] of porVariante) {
  const sku = skuDe[variante];
  const l = await bl('getInventoryProductsList', { inventory_id: INVENTARIO, filter_sku: String(r.product_id) });
  const padre = Object.values(l.products || {})[0];
  let idBL = null;
  if (padre) {
    const d = (await bl('getInventoryProductsData', { inventory_id: INVENTARIO, products: [padre.id] })).products?.[padre.id];
    const hijo = Object.entries(d?.variants || {}).find(([, v]) => v.sku === sku);
    idBL = hijo ? Number(hijo[0]) : padre.id;
  }
  const enBL = idBL ? (await bl('getInventoryProductsData', { inventory_id: INVENTARIO, products: [idBL] })).products?.[idBL]?.stock?.[`bl_${CONSULTORIOS}`] : null;
  const marca = enBL == null ? '? sin producto en BL' : Number(enBL) === r.disponible ? 'ok' : `DIFERENCIA ${Number(enBL) - r.disponible > 0 ? '+' : ''}${Number(enBL) - r.disponible}`;
  if (marca !== 'ok') diferencias++;
  console.log(`${String(sku || variante).padEnd(12)} libro ${String(r.disponible).padStart(3)} · BaseLinker ${String(enBL ?? '—').padStart(3)}  ${marca}  ${String(r.title).slice(0, 40)}`);
}
console.log(diferencias ? `\n${diferencias} producto(s) con diferencia.` : '\nTodo cuadra.');
