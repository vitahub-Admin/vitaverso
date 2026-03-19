
import { NextResponse } from 'next/server';
import { syncCalendarEvents } from '@/app/services/googleCalendarService';

export async function GET(req) {
  try {
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await syncCalendarEvents();
    return NextResponse.json({ success: true, ...result });

  } catch (err) {
    console.error('❌ Calendar sync failed:', err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}