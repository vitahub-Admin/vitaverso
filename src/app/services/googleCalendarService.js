// src/app/services/googleCalendarService.js

import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ─── AUTH GOOGLE ───────────────────────────────────────────────────────────

function getCalendarClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL_CALENDAR,
    key: process.env.GOOGLE_PRIVATE_KEY_CALENDAR?.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    subject: process.env.GOOGLE_CALENDAR_ID,
  });
  return google.calendar({ version: 'v3', auth });
}

// ─── HELPERS ───────────────────────────────────────────────────────────────

function getEventSource(event) {
  if (event.extendedProperties?.private?.createdVia === 'ai_function') return 'vambe';
  if (event.description?.includes('calendly.com')) return 'calendly';
  return 'manual';
}

function getEventType(eventName) {
  return 'onboarding';
}

function extractMeetLink(event) {
  if (event.conferenceData?.entryPoints) {
    const meet = event.conferenceData.entryPoints.find(
      e => e.entryPointType === 'video'
    );
    if (meet) return meet.uri;
  }
  const meetMatch = event.description?.match(/https:\/\/meet\.google\.com\/[a-z-]+/);
  if (meetMatch) return meetMatch[0];
  const calendlyMatch = event.description?.match(/https:\/\/calendly\.com\/events\/[^/\s]+\/google_meet/);
  if (calendlyMatch) return calendlyMatch[0];
  return null;
}

function extractCalendlyUuid(event) {
  const match = event.description?.match(
    /calendly\.com\/events\/([0-9a-f-]{36})\//
  );
  return match ? match[1] : null;
}

// ─── CALENDLY API ──────────────────────────────────────────────────────────

async function getCalendlyInvitees(eventUuid) {
  try {
    const res = await fetch(
      `https://api.calendly.com/scheduled_events/${eventUuid}/invitees`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CALENDLY_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!res.ok) {
      console.warn(`[Calendly] No se pudo obtener invitees para ${eventUuid} [${res.status}]`);
      return [];
    }

    const data = await res.json();
    return data.collection ?? [];
  } catch (err) {
    console.error(`[Calendly] Error obteniendo invitees:`, err.message);
    return [];
  }
}

// ─── UPSERT INVITEES ───────────────────────────────────────────────────────
async function upsertInvitees(callId, invitees) {
  for (const invitee of invitees) {
    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id')
      .eq('email', invitee.email)
      .single();

    const { error } = await supabase
      .from('scheduled_call_invitees')
      .upsert({
        call_id: callId,
        google_attendee_email: invitee.email,
        email: invitee.email,
        name: invitee.name ?? invitee.displayName ?? null,
        affiliate_id: affiliate?.id ?? null,
        status: invitee.responseStatus === 'declined' || invitee.status === 'canceled'
          ? 'canceled'
          : 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'call_id,email' })
      .select();

    // ← log del error
    if (error) {
      console.error(`❌ upsertInvitee error [${invitee.email}]:`, error);
    } else {
      console.log(`✅ Invitee guardado: ${invitee.email}`);
    }
  }
}

// ─── SYNC PRINCIPAL ────────────────────────────────────────────────────────

export async function syncCalendarEvents() {
  console.log('🔹 Iniciando sync Google Calendar...');

  const calendar = getCalendarClient();

  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  const dayOfWeek = now.getDay();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + (dayOfWeek === 0 ? 0 : 7 - dayOfWeek));
  sunday.setHours(23, 59, 59, 999);

  // ── Paginación ─────────────────────────────────────
  let allEvents = [];
  let pageToken = undefined;

  do {
    const { data: eventsData } = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      timeMin: today.toISOString(),
      timeMax: sunday.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 250,
      pageToken,
    });

    allEvents = [...allEvents, ...(eventsData.items ?? [])];
    pageToken = eventsData.nextPageToken;

  } while (pageToken);

  console.log(`🔹 Eventos encontrados: ${allEvents.length}`);

  let upserted = 0;
  let errors = 0;

  for (const event of allEvents) {
    try {
      const source = getEventSource(event);

      // Upsert evento principal
      const { data: call, error: callError } = await supabase
        .from('scheduled_calls')
        .upsert({
          google_event_id: event.id,
          event_name: event.summary,
          event_type: getEventType(event.summary),
          source,
          meet_link: extractMeetLink(event),
          starts_at: event.start?.dateTime ?? event.start?.date,
          ends_at: event.end?.dateTime ?? event.end?.date,
          status: event.status === 'cancelled' ? 'canceled' : 'active',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'google_event_id' })
        .select()
        .single();

      if (callError) throw callError;
      // Después de upsert evento principal, antes de los invitados
console.log(`📅 Evento: ${event.summary} | source: ${source}`);

if (source === 'vambe') {
  const attendees = event.attendees?.filter(
    a => a.email !== process.env.GOOGLE_CALENDAR_ID
  ) ?? [];
  console.log(`👥 Vambe attendees: ${attendees.length}`, attendees.map(a => a.email));
  await upsertInvitees(call.id, attendees);

} else if (source === 'calendly') {
  const uuid = extractCalendlyUuid(event);
  console.log(`🔗 Calendly UUID extraído: ${uuid}`);
  if (uuid) {
    const invitees = await getCalendlyInvitees(uuid);
    console.log(`👥 Calendly invitees: ${invitees.length}`, invitees.map(i => i.email));
    await upsertInvitees(call.id, invitees);
  }
}

   else {
        // Manual: usar attendees si existen
        const attendees = event.attendees?.filter(
          a => a.email !== process.env.GOOGLE_CALENDAR_ID
        ) ?? [];
        await upsertInvitees(call.id, attendees);
      }

      upserted++;
    } catch (err) {
      console.error(`❌ Error evento ${event.id}:`, err.message);
      errors++;
    }
  }

  console.log('✅ Sync Calendar completado');
  return { total: allEvents.length, upserted, errors };
}