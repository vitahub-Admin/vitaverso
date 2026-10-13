import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

/**
 * GET /api/admin/notifications/envios?limit=40
 *
 * Historial de envíos de notificaciones a profesionales: quién las mandó, a cuántos
 * y si fue masivo o personalizado. Cada envío masivo guarda un aviso por destinatario;
 * aquí se agrupan por `envio_id` para verlos como uno solo.
 *
 * Solo salen los avisos que ya traen el registro (`data.envio_id`); los anteriores a
 * ese registro no dicen quién los mandó y no se listan.
 */
export async function GET(req) {
  try {
    const limite = Math.min(Math.max(Number(new URL(req.url).searchParams.get('limit')) || 40, 1), 100);

    // Un envío masivo son cientos de filas: se leen páginas de 1000, hasta 5.
    const filas = [];
    for (let p = 0; p < 5; p++) {
      const { data, error } = await supabase
        .from('affiliate_notifications')
        .select('customer_id, title, body, data, read_at, created_at')
        .not('data->>envio_id', 'is', null)
        .order('created_at', { ascending: false })
        .range(p * 1000, p * 1000 + 999);
      if (error) throw error;
      filas.push(...(data || []));
      if (!data || data.length < 1000) break;
    }

    const envios = new Map();
    for (const f of filas) {
      const d = f.data || {};
      const id = d.envio_id;
      let e = envios.get(id);
      if (!e) {
        e = {
          envio_id: id,
          creado:   f.created_at,
          title:    f.title,
          body:     f.body,
          tipo:     d.type || null,
          evento:   d.evento || null,
          origen:   d.origen || 'sistema',
          enviado_por: d.enviado_por || null,
          agente:   d.agente || null,
          alcance:  d.alcance || 'personalizado',
          destinatarios: Number(d.destinatarios) || 0,
          registrados: 0,
          leidos:   0,
          primer_destinatario: f.customer_id,
        };
        envios.set(id, e);
      }
      e.registrados += 1;
      if (f.read_at) e.leidos += 1;
    }

    const lista = [...envios.values()]
      .sort((a, b) => new Date(b.creado) - new Date(a.creado))
      .slice(0, limite);

    // Nombres: de quien lo mandó y, en los personalizados, de quien lo recibió
    const ids = [...new Set(lista.flatMap(e => [
      e.enviado_por,
      e.alcance === 'personalizado' ? e.primer_destinatario : null,
    ]).filter(Boolean).map(Number).filter(Boolean))];

    let nombres = {};
    if (ids.length) {
      const { data: afiliados } = await supabase
        .from('affiliates')
        .select('shopify_customer_id, first_name, last_name')
        .in('shopify_customer_id', ids);
      nombres = Object.fromEntries((afiliados || []).map(a => [
        String(a.shopify_customer_id),
        `${a.first_name || ''} ${a.last_name || ''}`.trim() || String(a.shopify_customer_id),
      ]));
    }

    return NextResponse.json({
      ok: true,
      envios: lista.map(e => ({
        ...e,
        enviado_por_nombre: e.enviado_por ? (nombres[String(e.enviado_por)] || String(e.enviado_por)) : null,
        destinatario_nombre: e.alcance === 'personalizado' ? (nombres[String(e.primer_destinatario)] || String(e.primer_destinatario)) : null,
      })),
    });
  } catch (err) {
    console.error('❌ GET /api/admin/notifications/envios:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
