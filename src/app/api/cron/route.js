// src/app/api/cron/route.js

import { NextResponse } from 'next/server';
import { syncCalendarEvents, syncCalendlyInvitees } from '@/app/services/googleCalendarService';
import { syncInviteesMatch } from '@/lib/syncInviteesMatch';

export const maxDuration = 300;

export async function GET(req) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = {};

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
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1); yesterday.setHours(0, 0, 0, 0);
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + (now.getDay() === 0 ? 0 : 7 - now.getDay()));
    sunday.setHours(23, 59, 59, 999);
    results.calendlyInvitees = await syncCalendlyInvitees({
      timeMin: yesterday.toISOString(),
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