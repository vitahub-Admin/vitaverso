// src/app/api/cron/route.js

import { NextResponse } from 'next/server';
import { syncActiveStore } from '@/lib/syncStore';
import { syncCalendarEvents } from '@/app/services/googleCalendarService';

export async function GET(req) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {};

  // ── Sync active_store ──────────────────────────────
  try {
    results.activeStore = await syncActiveStore();
  } catch (err) {
    console.error('❌ Sync active_store failed:', err);
    results.activeStore = { error: err.message };
  }

  // ── Sync Google Calendar ───────────────────────────
  try {
    results.calendar = await syncCalendarEvents();
  } catch (err) {
    console.error('❌ Sync calendar failed:', err);
    results.calendar = { error: err.message };
  }

  return NextResponse.json({ success: true, results });
}