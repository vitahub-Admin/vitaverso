// scripts/syncCron.js

import 'dotenv/config';
import { syncActiveStore } from '../src/lib/syncStore.js';
import { syncCalendarEvents } from '../src/app/services/googleCalendarService.js';
import { syncInviteesMatch } from '../src/lib/syncInviteesMatch.js';

async function run() {
  console.log('🚀 Corriendo sync manual...\n');

  console.log('─── Active Store ───────────────────────');
  try {
    const result = await syncActiveStore();
    console.log('✅ activeStore:', result);
  } catch (err) {
    console.error('❌ activeStore failed:', err.message);
  }

  console.log('\n─── Google Calendar ────────────────────');
  try {
    const result = await syncCalendarEvents();
    console.log('✅ calendar:', result);
  } catch (err) {
    console.error('❌ calendar failed:', err.message);
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

run();