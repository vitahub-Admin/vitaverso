/**
 * POST /api/webhooks/cupon
 *
 * Un agente crea un cupón de descuento en Shopify y se lo asigna a un profesional:
 * el cupón aparece en su wallet (y le llega un aviso al teléfono). Es de UN SOLO USO,
 * por monto fijo o por porcentaje.
 *
 * Es el mismo regalo que hace el admin desde Pagos (api/admin/store-credit), pero
 * disparado por una máquina: por eso devuelve el código, reintenta sin duplicar
 * (`event_id`) y nunca depende de una sesión de navegador.
 *
 * Autenticación: Authorization: Bearer <NOTIFY_WEBHOOK_SECRET>, el mismo secreto
 * que /api/webhooks/notificar.
 *
 * body: {
 *   target:        email o shopify_customer_id del profesional (uno solo),
 *   tipo:          "monto" | "porcentaje",
 *   valor:         monto en MXN (1–2000) o porcentaje (1–30),
 *   nota?:         texto corto que ve el profesional junto al cupón,
 *   vence_en_dias? entero 1–365; sin esto no vence,
 *   event_id?:     id del evento de origen, para que un reintento no cree otro cupón,
 *   avisar?:       false para no mandar el aviso al teléfono (por defecto sí),
 *   title?, body?: texto del aviso. Admite {codigo}, {descuento}, {valor} y {nota},
 *                  que se llenan con el cupón recién creado. Sin esto, mensaje estándar.
 * }
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { crearCuponDeCredito } from '@/lib/storeCredit';
import { sendPushToAffiliate } from '@/lib/affiliateNotifications';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const STORE_FRONT_URL = 'https://vitahub.mx/discount';

// Topes de seguridad: un agente que se equivoca (o un cero de más) no regala una fortuna.
// El monto es el mismo tope que el regalo manual del admin.
const MONTO_MAXIMO      = 2000;
const PORCENTAJE_MAXIMO = 30;

function secretoValido(header) {
  const esperado = process.env.NOTIFY_WEBHOOK_SECRET;
  if (!esperado) return false;
  const recibido = (header || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

const error = (mensaje, status) => NextResponse.json({ ok: false, error: mensaje }, { status });

export async function POST(req) {
  if (!secretoValido(req.headers.get('authorization'))) return error('No autorizado', 401);

  try {
    const body = await req.json().catch(() => null);
    if (!body) return error('Body inválido', 400);

    // ── Qué cupón ───────────────────────────────────────────────────────────
    const tipo  = String(body.tipo || '').trim().toLowerCase();
    const valor = Number(body.valor);
    if (!['monto', 'porcentaje'].includes(tipo)) return error('tipo debe ser "monto" o "porcentaje"', 400);
    if (!Number.isFinite(valor) || valor <= 0) return error('valor debe ser un número mayor a cero', 400);
    if (tipo === 'monto' && valor > MONTO_MAXIMO) {
      return error(`El máximo por cupón es $${MONTO_MAXIMO}`, 400);
    }
    if (tipo === 'porcentaje' && (valor > PORCENTAJE_MAXIMO || !Number.isInteger(valor))) {
      return error(`El porcentaje debe ser un entero de 1 a ${PORCENTAJE_MAXIMO}`, 400);
    }

    const nota = String(body.nota || '').trim().slice(0, 120);

    let venceEnDias = null;
    if (body.vence_en_dias != null) {
      venceEnDias = Number(body.vence_en_dias);
      if (!Number.isInteger(venceEnDias) || venceEnDias < 1 || venceEnDias > 365) {
        return error('vence_en_dias debe ser un entero de 1 a 365', 400);
      }
    }

    const tituloAviso  = String(body.title || '').trim().slice(0, 100);
    const mensajeAviso = String(body.body  || '').trim().slice(0, 300);
    if (Boolean(tituloAviso) !== Boolean(mensajeAviso)) {
      return error('title y body van juntos: manda los dos o ninguno', 400);
    }

    const eventId = body.event_id ? String(body.event_id).slice(0, 120) : null;

    // ── Idempotencia ────────────────────────────────────────────────────────
    // Un reintento tras un timeout no debe crear un segundo cupón: se devuelve el primero.
    if (eventId) {
      const { data: previo } = await supabase
        .from('point_exchanges')
        .select('id, customer_id, metadata')
        .eq('exchange_type', 'store_credit')
        .filter('metadata->>event_id', 'eq', eventId)
        .limit(1);

      if (previo?.length) {
        const m = previo[0].metadata || {};
        return NextResponse.json({
          ok: true,
          duplicado: true,
          code: m.discount_code,
          url: `${STORE_FRONT_URL}/${m.discount_code}`,
          mensaje: 'Ese evento ya había generado un cupón',
        });
      }
    }

    // ── A quién ─────────────────────────────────────────────────────────────
    // Uno solo: un cupón de un solo uso se asigna a una persona. Para varios, el agente
    // llama una vez por profesional (con su propio event_id).
    const target = Array.isArray(body.target) ? null : String(body.target ?? '').trim();
    if (!target) return error('target debe ser el email o el id de UN profesional', 400);

    const consulta = supabase.from('affiliates').select('shopify_customer_id, first_name, last_name, email');
    const { data: afiliado } = target.includes('@')
      ? await consulta.eq('email', target.toLowerCase()).maybeSingle()
      : await consulta.eq('shopify_customer_id', Number(target) || 0).maybeSingle();

    if (!afiliado) return error(`No hay un profesional con ${target.includes('@') ? 'ese correo' : 'ese id'}`, 404);

    const nombre = `${afiliado.first_name || ''} ${afiliado.last_name || ''}`.trim() || String(afiliado.shopify_customer_id);

    // ── El cupón en Shopify ─────────────────────────────────────────────────
    const etiqueta = tipo === 'porcentaje' ? `${valor}%` : `$${valor}`;
    const { code, priceRuleId } = await crearCuponDeCredito({
      ...(tipo === 'porcentaje' ? { porcentaje: valor } : { monto: valor }),
      venceEnDias,
      titulo: `Cupón ${etiqueta} · ${nombre}${nota ? ` · ${nota}` : ''}`,
    });

    // ── Queda en su wallet ──────────────────────────────────────────────────
    // Mismo registro que el crédito regalado por el admin: así lo lista la app, y el
    // webhook de órdenes lo marca como usado cuando se gasta.
    const { data: registro, error: regErr } = await supabase
      .from('point_exchanges')
      .insert([{
        customer_id:       afiliado.shopify_customer_id,
        points_requested:  tipo === 'monto' ? valor : 0,
        exchange_type:     'store_credit',
        status:            'approved',
        processed_at:      new Date().toISOString(),
        processed_by_type: 'admin',
        admin_note:        nota || 'Cupón otorgado por Vitahub',
        metadata: {
          source:        'agent',
          request_type:  'store_credit',
          discount_code: code,
          price_rule_id: priceRuleId,
          ...(tipo === 'monto' ? { credit_amount: valor } : { discount_percent: valor }),
          ...(nota ? { nota } : {}),
          ...(venceEnDias ? { vence_en_dias: venceEnDias } : {}),
          ...(eventId ? { event_id: eventId } : {}),
        },
      }])
      .select()
      .single();

    // Si esto falla el cupón ya existe en Shopify pero el profesional no lo ve: se
    // devuelve el código para que no se pierda y el agente pueda avisar.
    if (regErr) {
      console.error('[webhook cupon] cupón creado pero sin registrar:', code, regErr.message);
      return NextResponse.json({ ok: false, error: `El cupón ${code} se creó en Shopify pero no se pudo asignar: ${regErr.message}`, code }, { status: 500 });
    }

    // ── Aviso (no bloquea: el cupón ya está asignado) ───────────────────────
    if (body.avisar !== false) {
      const que = tipo === 'porcentaje' ? `${valor}% de descuento` : `$${valor} MXN de crédito`;
      // El texto del agente lleva huecos que se llenan con el cupón recién creado: el
      // agente no conoce el código hasta que existe, y así no hace falta una segunda llamada.
      const llenar = (s) => s
        .replaceAll('{codigo}', code)
        .replaceAll('{descuento}', que)
        .replaceAll('{valor}', String(valor))
        .replaceAll('{nota}', nota);
      sendPushToAffiliate(
        afiliado.shopify_customer_id,
        tituloAviso ? llenar(tituloAviso) : '¡Tienes un cupón! 🎁',
        tituloAviso ? llenar(mensajeAviso) : `Vitahub te regaló ${que}${nota ? ` (${nota})` : ''}. Código: ${code}`,
        { type: 'store_credit_ready', code, exchangeId: registro?.id }
      ).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      code,
      url: `${STORE_FRONT_URL}/${code}`,
      tipo,
      valor,
      profesional: { id: afiliado.shopify_customer_id, nombre },
      exchange_id: registro?.id,
    }, { status: 201 });
  } catch (err) {
    console.error('[webhook cupon]', err?.message);
    return error(err.message, 500);
  }
}
