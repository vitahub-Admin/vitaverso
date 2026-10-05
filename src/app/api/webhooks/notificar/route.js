/**
 * POST /api/webhooks/notificar
 *
 * Notificaciones push disparadas desde afuera: una automatización escucha un
 * evento en otra plataforma y pega acá. A diferencia del envío del admin, que
 * lo aprieta una persona mirando la pantalla, del otro lado hay una máquina —
 * así que esta ruta devuelve a cuántos llegó, reintenta sin duplicar, y nunca
 * depende de una sesión de navegador.
 *
 * Autenticación: Authorization: Bearer <NOTIFY_WEBHOOK_SECRET>
 * Se usa un secreto propio y no CRON_SECRET: este lo tiene una plataforma de
 * terceros, y si hay que rotarlo no deberían caerse los crons.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { notificarAfiliados } from '@/lib/affiliateNotifications';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

/** Comparación de tiempo constante: un `!==` filtra el secreto carácter a carácter. */
function secretoValido(header) {
  const esperado = process.env.NOTIFY_WEBHOOK_SECRET;
  if (!esperado) return false;
  const recibido = (header || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req) {
  if (!secretoValido(req.headers.get('authorization'))) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: 'Body inválido' }, { status: 400 });
    }

    const titulo  = String(body.title || '').trim();
    const mensaje = String(body.body  || '').trim();
    if (!titulo || !mensaje) {
      return NextResponse.json({ ok: false, error: 'title y body son requeridos' }, { status: 400 });
    }

    // El link se abre con Linking.openURL dentro de la app: solo http(s), para
    // que un evento externo no pueda disparar un esquema arbitrario.
    let url = null;
    if (body.url) {
      try {
        const u = new URL(String(body.url).trim());
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error('protocolo');
        url = u.toString();
      } catch {
        return NextResponse.json({ ok: false, error: 'url debe empezar con https://' }, { status: 400 });
      }
    }

    const evento  = body.evento ? String(body.evento).slice(0, 60) : null;
    const eventId = body.event_id ? String(body.event_id).slice(0, 120) : null;

    // Idempotencia: las plataformas reintentan ante un timeout o un 500, y sin
    // esto el mismo evento llega dos veces al teléfono del profesional.
    if (eventId) {
      const { data: yaEsta } = await supabase
        .from('affiliate_notifications')
        .select('id')
        .filter('data->>event_id', 'eq', eventId)
        .limit(1);

      if (yaEsta?.length) {
        return NextResponse.json({ ok: true, duplicado: true, mensaje: 'Ese evento ya se había notificado' });
      }
    }

    // ── A quién ──────────────────────────────────────────────────────────────
    // `target` acepta "all", un shopify_customer_id, un email, o una lista de
    // cualquiera de los dos. El email está porque la plataforma de origen suele
    // conocer al profesional por su correo y no por su id de Shopify.
    const target = body.target ?? 'all';
    let ids = [];

    if (target === 'all') {
      const { data } = await supabase
        .from('affiliates')
        .select('shopify_customer_id')
        .not('push_token', 'is', null);
      ids = (data || []).map(a => a.shopify_customer_id);
    } else {
      const lista  = Array.isArray(target) ? target : [target];
      const emails = lista.filter(v => String(v).includes('@')).map(v => String(v).trim().toLowerCase());
      ids          = lista.filter(v => !String(v).includes('@')).map(Number).filter(Boolean);

      if (emails.length) {
        const { data } = await supabase
          .from('affiliates')
          .select('shopify_customer_id, email')
          .in('email', emails);

        ids.push(...(data || []).map(a => a.shopify_customer_id));

        // Avisar qué correos no existen: del otro lado nadie va a revisar logs,
        // y una automatización apuntando a un afiliado dado de baja fallaría en
        // silencio para siempre.
        const hallados = new Set((data || []).map(a => String(a.email).toLowerCase()));
        const faltan   = emails.filter(e => !hallados.has(e));
        if (faltan.length && !ids.length) {
          return NextResponse.json(
            { ok: false, error: `No hay afiliados con esos correos: ${faltan.join(', ')}` },
            { status: 404 }
          );
        }
      }
    }

    if (!ids.length) {
      return NextResponse.json({ ok: false, error: 'No se encontró ningún destinatario' }, { status: 404 });
    }

    const data = {
      type: 'admin_message',          // la app ya sabe mostrar este tipo
      ...(url     ? { url } : {}),
      ...(evento  ? { evento } : {}),
      ...(eventId ? { event_id: eventId } : {}),
    };

    const resumen = await notificarAfiliados({ customerIds: ids, title: titulo, body: mensaje, data });

    return NextResponse.json({ ok: true, ...resumen });
  } catch (err) {
    console.error('[webhook notificar]', err?.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
