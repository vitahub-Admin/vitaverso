/**
 * Reintenta los movimientos de consultorios que BaseLinker no registró (tabla baselinker_fallas).
 *
 *   node scripts/reintentar_baselinker_fallas.mjs           -> solo lista y simula, no cambia nada
 *   node scripts/reintentar_baselinker_fallas.mjs --aplicar -> crea los documentos en BaseLinker y las marca resueltas
 *
 * Antes de aplicar, corre `node scripts/reconciliar_consultorios.mjs` para confirmar que la diferencia
 * es esa y no otra cosa (por ejemplo, algo que ya se corrigió a mano).
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env', quiet: true });
const { moverConsultorios } = await import('../src/lib/consultoriosStock.js');

const aplicar = process.argv.includes('--aplicar');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

const { data: fallas, error } = await s.from('baselinker_fallas').select('*').is('resuelta_at', null).order('created_at');
if (error) { console.error('No se pudo leer baselinker_fallas (¿ya se corrió scripts/create_baselinker_fallas.sql?):', error.message); process.exit(1); }
if (!fallas.length) { console.log('No hay fallas pendientes.'); process.exit(0); }

console.log(`${fallas.length} falla(s) pendiente(s)${aplicar ? '' : ' (simulación)'}:\n`);
for (const f of fallas) {
  const resumen = f.lineas.map((l) => `${l.sku || l.variant_id} × ${l.cantidad}`).join(', ');
  console.log(`• ${f.created_at.slice(0, 16)} · ${f.sentido} · ${resumen}\n    nota: ${f.nota || '—'}\n    error: ${f.motivo}`);
  const r = await moverConsultorios(f.sentido, f.lineas, `${f.nota || ''} · reintento`, { simular: !aplicar, sinAcuse: true });
  console.log(`    ${aplicar ? 'reintento' : 'simulación'}: ${r.ok ? 'OK' : 'FALLA — ' + r.motivo}${r.documento ? ` · documento ${r.documento}` : ''}`);
  if (aplicar && r.ok) {
    await s.from('baselinker_fallas').update({ resuelta_at: new Date().toISOString(), resuelta_nota: `reintentado${r.documento ? ` · documento ${r.documento}` : ''}` }).eq('id', f.id);
  }
}
process.exit(0);
