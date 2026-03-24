// scripts/syncHistorical.js
// Ejecutar una sola vez para traer todo el histórico del calendario.
// Uso: node --experimental-vm-modules scripts/syncHistorical.js

import 'dotenv/config';
import { syncCalendarEventsHistorical } from '../src/app/services/googleCalendarService.js';
import { syncInviteesMatch } from '../src/lib/syncInviteesMatch.js';

async function run() {
  console.log('🚀 Sync histórico iniciado\n');

  console.log('─── Google Calendar (histórico) ────────');
  try {
    const result = await syncCalendarEventsHistorical();
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

  console.log('\n🏁 Sync histórico completado');
}

run();
