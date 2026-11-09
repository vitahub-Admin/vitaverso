/**
 * Ajuste de cuadre (9-nov-2026): las 11 unidades que el libro de Rosa descontó por ventas del
 * 20 y 26 de octubre y que BaseLinker nunca descontó (esas ventas se guardaron sin SKU y la
 * salida falló en silencio). Rosa confirmó que su conteo físico coincide con el libro.
 *
 *   node scripts/ajuste_baselinker_rosa_2026-11-09.mjs           -> simula
 *   node scripts/ajuste_baselinker_rosa_2026-11-09.mjs --aplicar -> crea la salida en Consultorios
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env', quiet: true });
const { moverStockConsultorios } = await import('../src/lib/baselinker.js');
const aplicar = process.argv.includes('--aplicar');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
const PLAN = { VHMX01949: 2, VHMX00941: 3, VHMX00938: 3, VHMX02121: 1, VHMX02639: 2 };
const { data: cat } = await s.from('product_catalog').select('product_id,sku').in('sku', Object.keys(PLAN));
const lineas = cat.map(c => ({ product_id: c.product_id, sku: c.sku, cantidad: PLAN[c.sku] }));
const r = await moverStockConsultorios('venta', lineas, 'ajuste cuadre libro · ventas del 20 y 26-oct sin salida (Rosa)', { simular: !aplicar });
console.log(aplicar ? 'APLICADO' : 'SIMULACIÓN', JSON.stringify({ ok: r.ok, documento: r.documento, motivo: r.motivo, unidades: (r.renglones || []).reduce((a, x) => a + x.quantity, 0) }));
process.exit(r.ok ? 0 : 1);
