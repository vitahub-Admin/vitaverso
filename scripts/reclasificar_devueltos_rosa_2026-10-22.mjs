/**
 * Las 4 unidades que el 20-oct se devolvieron al central (Berberina, Omega 3, Banana,
 * Vainilla) pasan de "devuelto" a "vendido" en el libro de Rosa, que es lo que dice su
 * hoja. El saldo disponible NO cambia (vendido +1 y devuelto -1 se compensan) y no se
 * toca BaseLinker: el traspaso al central ya se hizo y ahí queda tal cual.
 *
 *   node scripts/reclasificar_devueltos_rosa_2026-10-22.mjs            -> muestra qué cambiaría
 *   node scripts/reclasificar_devueltos_rosa_2026-10-22.mjs --aplicar  -> lo hace
 */
import dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env' });

const aplicar = process.argv.includes('--aplicar');
const OWNER = 9354844602689;
const VARIANTES = [49836348768577, 49836348932417, 50493803954497, 50493804085569]; // Berberina, Omega 3, Banana, Vainilla
const MOTIVO = 'Ventas de su hoja que no estaban en el libro (cuadre 20-oct) · ya descontadas del central';

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const { data: stock } = await s.from('consignment_stock').select('*').eq('owner_id', OWNER).in('variant_id', VARIANTES);
const { data: movs } = await s.from('consignment_movements').select('*')
  .eq('owner_id', OWNER).in('variant_id', VARIANTES).eq('tipo', 'devolucion')
  .like('motivo', 'Sobrante del libro%');

console.log('SALDOS ANTES');
for (const r of stock) console.log(`  ${r.variant_id}: entregado ${r.entregado} · vendido ${r.vendido} · devuelto ${r.devuelto} · disponible ${r.disponible}`);
console.log(`Movimientos de devolución a reclasificar: ${movs.length} (se esperan 4)`);
if (stock.length !== 4 || movs.length !== 4 || stock.some(r => r.devuelto < 1)) {
  console.log('Algo no coincide con lo esperado; no se toca nada.');
  process.exit(1);
}

if (!aplicar) { console.log('\nNo se cambió nada. Para aplicar: --aplicar'); process.exit(0); }

const respaldo = `scripts/backup_reclasificar_devueltos_rosa_2026-10-22.json`;
fs.writeFileSync(respaldo, JSON.stringify({
  nota: 'Estado antes de pasar 4 unidades de devuelto a vendido. Para deshacer: volver a poner devuelto/vendido de cada fila de stock y tipo/motivo de cada movimiento.',
  stock, movimientos: movs,
}, null, 1));

for (const r of stock) {
  const { error } = await s.from('consignment_stock')
    .update({ vendido: Number(r.vendido) + 1, devuelto: Number(r.devuelto) - 1, updated_at: new Date().toISOString() })
    .eq('id', r.id);
  if (error) throw error;
}
for (const m of movs) {
  const { error } = await s.from('consignment_movements').update({ tipo: 'venta', motivo: MOTIVO }).eq('id', m.id);
  if (error) throw error;
}

const { data: despues } = await s.from('consignment_stock').select('*').eq('owner_id', OWNER).in('variant_id', VARIANTES);
console.log('\nSALDOS DESPUÉS (respaldo en ' + respaldo + ')');
for (const r of despues) console.log(`  ${r.variant_id}: entregado ${r.entregado} · vendido ${r.vendido} · devuelto ${r.devuelto} · disponible ${r.disponible}`);
