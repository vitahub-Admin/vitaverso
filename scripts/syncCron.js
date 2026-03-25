// scripts/syncCron.js

import 'dotenv/config';
import { syncActiveStore } from '../src/lib/syncStore.js';
import { syncCalendarEvents, syncCalendlyInvitees } from '../src/app/services/googleCalendarService.js';
import { syncInviteesMatch } from '../src/lib/syncInviteesMatch.js';

async function run() {
  console.log('🚀 Corriendo sync manual...\n');


  console.log('\n─── Google Calendar ────────────────────');
  try {
    const result = await syncCalendarEvents();
    console.log('✅ calendar:', result);
  } catch (err) {
    console.error('❌ calendar failed:', err.message);
  }

  console.log('\n─── Calendly Invitees ──────────────────');
  try {
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + (now.getDay() === 0 ? 0 : 7 - now.getDay()));
    sunday.setHours(23, 59, 59, 999);
    const result = await syncCalendlyInvitees({ timeMin: today.toISOString(), timeMax: sunday.toISOString() });
    console.log('✅ calendlyInvitees:', result);
  } catch (err) {
    console.error('❌ calendlyInvitees failed:', err.message);
  }

  console.log('\n─── Re-match Invitees ──────────────────');
  try {
    const result = await syncInviteesMatch();
    console.log('✅ inviteesMatch:', result);
  } catch (err) {
    console.error('❌ inviteesMatch failed:', err.message);
  }

  console.log('\n🏁 Sync manual completado');
}


export async function cleanHttpResponses() {
  const { error } = await supabase.rpc('execute_sql', {
    sql: `DELETE FROM net._http_response WHERE created < now() - interval '3 days'`
  });

}

run();