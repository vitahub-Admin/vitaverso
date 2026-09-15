import { NextResponse } from 'next/server';
import { broadcastToAffiliates, sendPushToAffiliate } from '@/lib/affiliateNotifications';

export async function POST(req) {
  try {
    const { title, body, target, url } = await req.json();

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ ok: false, error: 'Título y mensaje son requeridos' }, { status: 400 });
    }

    // Link opcional. Solo http(s): el valor termina en Linking.openURL dentro
    // de la app, y no debería poder colarse un esquema arbitrario.
    let link = null;
    if (url?.trim()) {
      try {
        const parsed = new URL(url.trim());
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocolo');
        link = parsed.toString();
      } catch {
        return NextResponse.json(
          { ok: false, error: 'El link debe ser una URL válida que empiece con https://' },
          { status: 400 }
        );
      }
    }

    // `type` permite que la app distinga estos mensajes; sin él caían igual en
    // la pestaña de Inicio, así que el comportamiento previo no cambia.
    const data = { type: 'admin_message', ...(link ? { url: link } : {}) };

    if (target && target !== 'all') {
      await sendPushToAffiliate(Number(target), title, body, data);
    } else {
      await broadcastToAffiliates(title, body, data);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('❌ POST /api/admin/notifications/send:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
