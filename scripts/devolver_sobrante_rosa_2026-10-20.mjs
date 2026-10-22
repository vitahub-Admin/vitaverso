/**
 * Devuelve al central el sobrante de Rosa en el libro de consignación: unidades
 * que su hoja ya da por vendidas y el libro todavía tenía como disponibles.
 *
 *   node scripts/devolver_sobrante_rosa_2026-10-20.mjs            -> simula, no cambia nada
 *   node scripts/devolver_sobrante_rosa_2026-10-20.mjs --aplicar  -> mueve en BaseLinker y escribe el libro
 *
 * Es lo mismo que hace el botón de devolución de admin/consignacion:
 * traspaso Consultorios -> Central en BaseLinker + movimiento 'devolucion' en el libro.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env' });
const { moverStockConsultorios } = await import('../src/lib/baselinker.js');

const aplicar = process.argv.includes('--aplicar');
const OWNER = '9354844602689';
const MOTIVO = 'Sobrante del libro: su hoja ya da estas unidades por vendidas (cuadre 20-oct)';
const LINEAS = [
  { variant_id: 49836348768577, product_id: 9640249753921, sku: 'VHMX00938', cantidad: 1, nombre: 'Berberina 60 cáps' },
  { variant_id: 49836348932417, product_id: 9640302412097, sku: 'VHMX00941', cantidad: 1, nombre: 'Omega 3 60 cáps' },
  { variant_id: 50493803954497, product_id: 9942875046209, sku: 'VHMX01952', cantidad: 1, nombre: 'Whey Banana' },
  { variant_id: 50493804085569, product_id: 9942875046209, sku: 'VHMX01951', cantidad: 1, nombre: 'Whey Vainilla' },
];

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

// Libro antes
const ids = LINEAS.map(l => l.variant_id);
const { data: antes } = await s.from('consignment_stock').select('*').eq('owner_id', OWNER).in('variant_id', ids);
console.log('LIBRO ANTES');
for (const l of LINEAS) {
  const r = antes.find(x => x.variant_id === l.variant_id);
  console.log(`  ${l.nombre}: entregado ${r.entregado} · vendido ${r.vendido} · devuelto ${r.devuelto} · disponible ${r.disponible}`);
  if (r.disponible < l.cantidad) throw new Error(`${l.nombre}: no hay disponible para devolver`);
}

const bl = await moverStockConsultorios('devolucion', LINEAS.map(({ product_id, sku, cantidad }) => ({ product_id, sku, cantidad })), `${MOTIVO} · profesional ${OWNER}`, { simular: !aplicar });
console.log('\nBASELINKER', aplicar ? '(APLICADO)' : '(SIMULACIÓN)');
console.log(JSON.stringify(bl, null, 1));

if (!aplicar) { console.log('\nNo se cambió nada. Para aplicar: --aplicar'); process.exit(0); }
if (!bl?.ok) { console.log('\nBaseLinker no confirmó; no se escribe el libro.'); process.exit(1); }

for (const l of LINEAS) {
  const r = antes.find(x => x.variant_id === l.variant_id);
  const { error: e1 } = await s.from('consignment_stock').update({ devuelto: Number(r.devuelto) + l.cantidad, updated_at: new Date().toISOString() }).eq('id', r.id);
  if (e1) throw e1;
  const { error: e2 } = await s.from('consignment_movements').insert([{ owner_id: OWNER, variant_id: l.variant_id, tipo: 'devolucion', cantidad: l.cantidad, motivo: MOTIVO, creado_por: null }]);
  if (e2) throw e2;
}
const { data: despues } = await s.from('consignment_stock').select('*').eq('owner_id', OWNER).in('variant_id', ids);
console.log('\nLIBRO DESPUÉS');
for (const l of LINEAS) {
  const r = despues.find(x => x.variant_id === l.variant_id);
  console.log(`  ${l.nombre}: entregado ${r.entregado} · vendido ${r.vendido} · devuelto ${r.devuelto} · disponible ${r.disponible}`);
}
