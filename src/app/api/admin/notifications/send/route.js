import { NextResponse } from 'next/server';
import { broadcastToAffiliates, sendPushToAffiliate } from '@/lib/affiliateNotifications';

export async function POST(req) {
  try {
    const { title, body, target } = await req.json();

    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ ok: false, error: 'Título y mensaje son requeridos' }, { status: 400 });
    }

    if (target && target !== 'all') {
      await sendPushToAffiliate(Number(target), title, body);
    } else {
      await broadcastToAffiliates(title, body);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('❌ POST /api/admin/notifications/send:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
