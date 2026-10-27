/**
 * Liga cada venta de consultorio PAGADA que quedó sin protocolo con el protocolo de su paciente, y cancela
 * la venta pendiente duplicada que nació al enviar ese protocolo (el paciente ya pagó: esa venta nunca se
 * debe cobrar, y su enlace de pago podía cobrarle dos veces).
 *
 *   node scripts/ligar_ventas_consultorio_2026-10-27.mjs            -> muestra qué haría
 *   node scripts/ligar_ventas_consultorio_2026-10-27.mjs --aplicar  -> lo hace (con respaldo en scripts/)
 *
 * Una pagada sin protocolo se liga solo si hay UNA pendiente del mismo profesional, mismo paciente, mismo
 * monto y mismos productos, con protocolo, creada hasta 2 horas después. Lo demás se deja y se reporta.
 */
import dotenv from 'dotenv';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env' });
const aplicar = process.argv.includes('--aplicar');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const norm = (x) => String(x || '').trim().toLowerCase();
const huella = (items) => (items || []).filter(i => i.quantity > 0).map(i => `${i.variant_id}x${i.quantity}`).sort().join(',');

const { data: todas } = await s.from('local_orders').select('*').order('created_at');
const pagadasSinLiga = todas.filter(l => l.estado === 'pagado' && !l.sharecart_token);
const pendientesLigadas = todas.filter(l => l.estado === 'pendiente' && l.sharecart_token);

const nombres = {};
const { data: afs } = await s.from('affiliates').select('shopify_customer_id, first_name, last_name').in('shopify_customer_id', [...new Set(todas.map(l => Number(l.owner_id)))]);
for (const a of afs || []) nombres[String(a.shopify_customer_id)] = `${a.first_name || ''} ${a.last_name || ''}`.trim();

const plan = [], sinPar = [];
for (const p of pagadasSinLiga) {
  const cand = pendientesLigadas.filter(d =>
    String(d.owner_id) === String(p.owner_id) && norm(d.patient_name) === norm(p.patient_name) &&
    Number(d.total) === Number(p.total) && huella(d.items) === huella(p.items) &&
    new Date(d.created_at) >= new Date(p.created_at) && new Date(d.created_at) - new Date(p.created_at) <= 2 * 3600 * 1000);
  if (cand.length === 1) plan.push({ pagada: p, duplicada: cand[0] });
  else sinPar.push({ p, n: cand.length });
}

console.log(`Ventas de consultorio: ${todas.length} · pagadas sin protocolo: ${pagadasSinLiga.length}`);
console.log(`Se pueden ligar con seguridad: ${plan.length} · quedan sin resolver: ${sinPar.length}\n`);
for (const x of plan) console.log(`  ${(nombres[String(x.pagada.owner_id)] || x.pagada.owner_id).padEnd(26)} ${String(x.pagada.patient_name).padEnd(18)} $${String(x.pagada.total).padEnd(8)} pagada ${x.pagada.created_at.slice(5, 16)} → protocolo ${x.duplicada.sharecart_token} · cancela duplicada ${x.duplicada.created_at.slice(5, 16)}`);
if (sinPar.length) {
  console.log('\nSin resolver (no se tocan):');
  for (const { p, n } of sinPar) console.log(`  ${(nombres[String(p.owner_id)] || p.owner_id).padEnd(26)} ${String(p.patient_name).padEnd(18)} $${p.total} · ${p.created_at.slice(0, 10)} · candidatas: ${n}`);
}

if (!aplicar) { console.log('\nNo se cambió nada. Para aplicar: --aplicar'); process.exit(0); }

fs.writeFileSync('scripts/backup_ligar_ventas_consultorio_2026-10-27.json', JSON.stringify({
  nota: 'Filas de local_orders antes de ligar las pagadas a su protocolo y cancelar las pendientes duplicadas. Para deshacer: volver a poner sharecart_token=null en las pagadas y estado=pendiente en las duplicadas.',
  pagadas: plan.map(x => ({ id: x.pagada.id, sharecart_token: x.pagada.sharecart_token, estado: x.pagada.estado })),
  duplicadas: plan.map(x => ({ id: x.duplicada.id, sharecart_token: x.duplicada.sharecart_token, estado: x.duplicada.estado })),
}, null, 1));

const ahora = new Date().toISOString();
for (const x of plan) {
  const a = await s.from('local_orders').update({ sharecart_token: x.duplicada.sharecart_token, updated_at: ahora }).eq('id', x.pagada.id).is('sharecart_token', null);
  if (a.error) throw a.error;
  const b = await s.from('local_orders').update({ estado: 'cancelado', updated_at: ahora }).eq('id', x.duplicada.id).eq('estado', 'pendiente');
  if (b.error) throw b.error;
}
console.log(`\nListo: ${plan.length} ventas ligadas y ${plan.length} duplicadas canceladas. Respaldo en scripts/backup_ligar_ventas_consultorio_2026-10-27.json`);
