// src/app/api/cron/route.js

import { NextResponse } from 'next/server';
import { syncActiveStore } from '@/lib/syncStore';
import { syncCalendarEvents, syncCalendlyInvitees } from '@/app/services/googleCalendarService';
import { syncInviteesMatch } from '@/lib/syncInviteesMatch';

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

  // ── Sync Calendly invitees ─────────────────────────
  try {
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + (now.getDay() === 0 ? 0 : 7 - now.getDay()));
    sunday.setHours(23, 59, 59, 999);
    results.calendlyInvitees = await syncCalendlyInvitees({
      timeMin: today.toISOString(),
      timeMax: sunday.toISOString(),
    });
  } catch (err) {
    console.error('❌ Sync Calendly invitees failed:', err);
    results.calendlyInvitees = { error: err.message };
  }

  // ── Re-match invitees ──────────────────────────────
  try {
    results.inviteesMatch = await syncInviteesMatch();
  } catch (err) {
    console.error('❌ Re-match invitees failed:', err);
    results.inviteesMatch = { error: err.message };
  }

  return NextResponse.json({ success: true, results });
}