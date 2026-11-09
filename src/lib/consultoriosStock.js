/**
 * Movimientos del almacén "Consultorios" de BaseLinker con red de seguridad.
 *
 * Envuelve moverStockConsultorios (src/lib/baselinker.js) y le agrega lo que faltó el 20 y 26 de
 * octubre, cuando 11 unidades vendidas descontaron del libro pero no de BaseLinker y nadie se enteró:
 *
 *  1. Completa el SKU. Los renglones de una venta de consultorio se guardan sin SKU (son líneas libres
 *     de Shopify); BaseLinker busca la variante por SKU, no la encontraba y el descuento fallaba.
 *  2. Reintenta una vez si el error parece de red o de BaseLinker (no si son datos: producto no
 *     encontrado o unidades que no alcanzan, porque reintentar no lo arregla).
 *  3. Si sigue fallando, deja el ACUSE: una fila en `baselinker_fallas` y, si está puesta la variable
 *     BASELINKER_ALERTA_EMAIL, un correo. Después se reintenta con
 *     `node scripts/reintentar_baselinker_fallas.mjs`.
 *
 * Nunca lanza error ni frena la venta: el cobro y el libro ya quedaron bien, igual que antes.
 * Imports relativos con extensión a propósito: lo cargan igual Next que Node directo.
 */

import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { moverStockConsultorios } from './baselinker.js';

const INTENTOS = 2;
const ESPERA_MS = 1500;
// Errores que son de datos: reintentar no los arregla (y "borrador" dejaría otro documento a medias)
const NO_REINTENTAR = /no alcanzan|no encontrado|movimiento desconocido|borrador/i;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const supabase = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

/** Rellena sku (y product_id) de las líneas que llegaron sin ellos, desde el catálogo por variant_id. */
async function completarSku(lineas) {
  const faltan = lineas.filter((l) => !l.sku && l.variant_id);
  if (!faltan.length) return lineas;
  try {
    const { data } = await supabase()
      .from('product_catalog')
      .select('variant_id, sku, product_id')
      .in('variant_id', faltan.map((l) => Number(l.variant_id)));
    const por = Object.fromEntries((data || []).map((r) => [String(r.variant_id), r]));
    return lineas.map((l) => {
      const c = por[String(l.variant_id)];
      return !l.sku && c ? { ...l, sku: c.sku, product_id: l.product_id ?? c.product_id } : l;
    });
  } catch (e) {
    console.error('[consultorios] no se pudo completar el SKU:', e.message);
    return lineas;
  }
}

async function acusarFalla({ sentido, lineas, nota, motivo, intentos }) {
  const resumen = lineas.map((l) => `${l.sku || l.variant_id || l.product_id} × ${l.cantidad}`).join(', ');
  console.error(`[consultorios] FALLA DE BASELINKER · ${sentido} · ${resumen} · ${motivo}`);

  try {
    const { error } = await supabase().from('baselinker_fallas').insert([{ sentido, lineas, nota: nota || null, motivo, intentos }]);
    if (error) console.error('[consultorios] no se pudo guardar el acuse (¿falta crear la tabla baselinker_fallas?):', error.message);
  } catch (e) {
    console.error('[consultorios] no se pudo guardar el acuse:', e.message);
  }

  const para = (process.env.BASELINKER_ALERTA_EMAIL || '').trim();
  if (!para) return;
  try {
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'Vitahub Pro <noreply@pro.vitahub.mx>',
      to: para.split(',').map((s) => s.trim()).filter(Boolean),
      subject: 'BaseLinker no registró un movimiento de Consultorios',
      html: `<p>Un movimiento de inventario de consultorios <strong>no quedó en BaseLinker</strong>. La venta o la entrega sí se guardó en el libro, así que el libro y BaseLinker ya no coinciden.</p>
<ul>
  <li><strong>Movimiento:</strong> ${sentido}</li>
  <li><strong>Productos:</strong> ${resumen}</li>
  <li><strong>Nota:</strong> ${nota || '—'}</li>
  <li><strong>Error:</strong> ${motivo}</li>
</ul>
<p>Para reintentarlo: <code>node scripts/reintentar_baselinker_fallas.mjs --aplicar</code></p>`,
      tags: [{ name: 'flujo', value: 'alerta_baselinker' }],
    });
  } catch (e) {
    console.error('[consultorios] no se pudo enviar el aviso por correo:', e.message);
  }
}

/**
 * @param {'entrega'|'devolucion'|'venta'|'reversa'} sentido
 * @param {Array<{product_id?, sku?, variant_id?, cantidad}>} lineas
 * @param {string} nota
 * @param {{simular?: boolean, sinAcuse?: boolean}} [opciones]  sinAcuse: para reintentos, no deja otro acuse
 */
export async function moverConsultorios(sentido, lineas = [], nota = '', opciones = {}) {
  let r = { ok: false, motivo: 'sin intentos' };
  let intentos = 0;
  try {
    const completas = await completarSku(lineas);
    for (let i = 1; i <= INTENTOS; i++) {
      intentos = i;
      r = await moverStockConsultorios(sentido, completas, nota, opciones);
      if (r.ok || NO_REINTENTAR.test(r.motivo || '')) break;
      if (i < INTENTOS) await esperar(ESPERA_MS * i);
    }
    if (!r.ok && !opciones.simular && !opciones.sinAcuse) {
      await acusarFalla({ sentido, lineas: completas, nota, motivo: r.motivo || 'error desconocido', intentos });
    }
  } catch (e) {
    r = { ok: false, motivo: e.message };
    console.error('[consultorios] error inesperado:', e.message);
  }
  return r;
}
