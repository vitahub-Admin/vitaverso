import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ─── AUTH ──────────────────────────────────────────────────────────────────

function getCalendarClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL_CALENDAR,
    key: process.env.GOOGLE_PRIVATE_KEY_CALENDAR?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    subject: process.env.GOOGLE_CALENDAR_ID, // impersonate la cuenta
  });

  return google.calendar({ version: 'v3', auth });
}

// ─── HELPERS ───────────────────────────────────────────────────────────────

function getEventType(eventName) {
  return 'onboarding';
}

function extractMeetLink(event) {
  // Link de Google Meet en conferenceData
  if (event.conferenceData?.entryPoints) {
    const meet = event.conferenceData.entryPoints.find(
      e => e.entryPointType === 'video'
    );
    if (meet) return meet.uri;
  }
  // Fallback en location
  if (event.location?.startsWith('https://meet.google.com')) {
    return event.location;
  }
  return null;
}

// ─── SYNC ──────────────────────────────────────────────────────────────────

export async function syncCalendarEvents() {
  console.log('🔹 Iniciando sync Google Calendar...');

  const calendar = getCalendarClient();

  // Rango: lunes de esta semana → domingo
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  const { data: eventsData } = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    timeMin: monday.toISOString(),
    timeMax: sunday.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 100,
  });

  const events = eventsData.items ?? [];
  console.log(`🔹 Eventos encontrados: ${events.length}`);

  let upserted = 0;
  let errors = 0;

  for (const event of events) {
    try {
      // Upsert evento principal
      const { data: call, error: callError } = await supabase
        .from('scheduled_calls')
        .upsert({
          google_event_id: event.id,
          event_name: event.summary,
          event_type: getEventType(event.summary),
          meet_link: extractMeetLink(event),
          starts_at: event.start?.dateTime ?? event.start?.date,
          ends_at: event.end?.dateTime ?? event.end?.date,
          status: event.status === 'cancelled' ? 'canceled' : 'active',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'google_event_id' })
        .select()
        .single();

      if (callError) throw callError;

      // Upsert invitados
      const attendees = event.attendees?.filter(
        a => a.email !== process.env.GOOGLE_CALENDAR_ID // excluir el host
      ) ?? [];

      for (const attendee of attendees) {
        // Buscar afiliado por email
        const { data: affiliate } = await supabase
          .from('affiliates')
          .select('id')
          .eq('email', attendee.email)
          .single();

        await supabase
          .from('scheduled_call_invitees')
          .upsert({
            call_id: call.id,
            google_attendee_email: attendee.email,
            email: attendee.email,
            name: attendee.displayName ?? null,
            affiliate_id: affiliate?.id ?? null,
            status: attendee.responseStatus === 'declined' ? 'canceled' : 'active',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'call_id,email' })
          .select();
      }

      upserted++;
    } catch (err) {
      console.error(`❌ Error evento ${event.id}:`, err.message);
      errors++;
    }
  }

  console.log('✅ Sync Calendar completado');
  return { total: events.length, upserted, errors };
}