/**
 * Revisa que las tablas de ventas en efectivo estén listas y cerradas al público, después de correr
 * scripts/create_ventas_efectivo_tables.sql. NO escribe nada: la función de registro se prueba con
 * un profesional sin stock, que debe rechazar la venta.
 *
 *   node scripts/verificar_ventas_efectivo.mjs
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config({ path: '.env' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const servicio = createClient(url, process.env.SUPABASE_SECRET_KEY);
const publico  = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

let fallos = 0;
const ok = (c, msg) => { console.log(`${c ? '✔' : '✘'} ${msg}`); if (!c) fallos++; };

const nuevas = ['ventas_efectivo', 'liquidaciones_efectivo', 'consignment_reservado'];

// 1. Las tablas y la vista existen para el servidor
for (const t of nuevas) {
  const { error } = await servicio.from(t).select('*', { head: true, count: 'exact' }).limit(1);
  ok(!error, `${t}: el servidor la puede consultar${error ? ' — ' + error.message : ''}`);
}

// 2. La función rechaza lo que no se puede vender
const base = { p_owner: 1, p_patient_name: null, p_patient_phone: null, p_patient_email: null, p_sharecart_token: null, p_total: 1, p_comision: 0 };
const { error: sinStock } = await servicio.rpc('crear_venta_efectivo', { ...base, p_items: [{ variant_id: 1, quantity: 1 }] });
ok(sinStock && /SIN_STOCK/.test(sinStock.message), `rechaza una venta sin stock (${sinStock?.message || 'no falló'})`);
const { error: vacio } = await servicio.rpc('crear_venta_efectivo', { ...base, p_items: [] });
ok(vacio && /SIN_PRODUCTOS/.test(vacio.message), `rechaza un paquete vacío (${vacio?.message || 'no falló'})`);
const { error: cero } = await servicio.rpc('crear_venta_efectivo', { ...base, p_items: [{ variant_id: 1, quantity: 0 }] });
ok(cero && /CANTIDAD_INVALIDA/.test(cero.message), `rechaza una cantidad de cero (${cero?.message || 'no falló'})`);

// 3. Con la llave pública (la del navegador) no se lee ni se escribe nada de lo nuevo
for (const t of nuevas) {
  const { data, error } = await publico.from(t).select('*').limit(1);
  const cerrada = Boolean(error) || (data || []).length === 0;
  ok(cerrada, `${t}: cerrada a la llave pública${cerrada ? '' : ' — ¡SE PUEDE LEER!'}`);
}
const { error: eIns } = await publico.from('ventas_efectivo').insert([{ owner_id: 1, items: [] }]);
ok(Boolean(eIns), 'ventas_efectivo: la llave pública no puede escribir');
const { error: eRpc } = await publico.rpc('crear_venta_efectivo', { ...base, p_items: [{ variant_id: 1, quantity: 1 }] });
ok(Boolean(eRpc) && !/SIN_STOCK/.test(eRpc.message), `la llave pública no puede llamar a la función (${eRpc?.message || 'pudo'})`);

console.log(fallos ? `\n${fallos} cosa(s) por revisar.` : '\nTodo en orden.');
process.exit(fallos ? 1 : 0);
