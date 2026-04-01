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
  if (!eventName) return 'otros';
  if (/onboarding/i.test(eventName) || /<> vitahub/i.test(eventName)) return 'onboarding';
  return 'otros';
}

function extractMeetLink(event) {
  if (event.conferenceData?.entryPoints) {
    const meet = event.conferenceData.entryPoints.find(
      e => e.entryPointType === 'video'
    );
    if (meet) return meet.uri;
  }
  if (event.hangoutLink) return event.hangoutLink;
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

    if (error) console.error(`❌ upsertInvitee error [${invitee.email}]:`, error);
  }
}

// ─── CORE SYNC ─────────────────────────────────────────────────────────────

async function syncEvents({ timeMin, timeMax } = {}) {
  const calendar = getCalendarClient();

  const calendarIds = process.env.GOOGLE_CALENDAR_IDS
    ? process.env.GOOGLE_CALENDAR_IDS.split(',').map(s => s.trim()).filter(Boolean)
    : [process.env.GOOGLE_CALENDAR_ID];

  console.log(`📅 Sincronizando ${calendarIds.length} calendario(s):`, calendarIds);

  let allEvents = [];

  for (const calendarId of calendarIds) {
    let pageToken = undefined;
    do {
      const params = {
        calendarId,
        singleEvents:         true,
        orderBy:              'startTime',
        maxResults:           250,
        conferenceDataVersion: 1,
        pageToken,
        ...(timeMin && { timeMin }),
        ...(timeMax && { timeMax }),
      };

      const { data: eventsData } = await calendar.events.list(params);
      const items = (eventsData.items ?? []).map(e => ({ _calendarId: calendarId, _raw: e }));
      allEvents = [...allEvents, ...items];
      pageToken = eventsData.nextPageToken;
    } while (pageToken);
  }

  // Deduplicar por event.id
  const seen = new Set();
  allEvents = allEvents.filter(({ _raw }) => {
    if (seen.has(_raw.id)) return false;
    seen.add(_raw.id);
    return true;
  });

  console.log(`🔹 Eventos encontrados: ${allEvents.length}`);

  let upserted = 0;
  let errors   = 0;

  for (const { _calendarId, _raw: event } of allEvents) {
    try {
      const source = getEventSource(event);

      const { data: call, error: callError } = await supabase
        .from('scheduled_calls')
        .upsert({
          google_event_id: event.id,
          event_name:      event.summary,
          event_type:      getEventType(event.summary),
          source,
          calendar_id:     _calendarId,
          meet_link:       extractMeetLink(event),
          starts_at:       event.start?.dateTime ?? event.start?.date,
          ends_at:         event.end?.dateTime   ?? event.end?.date,
          status:          event.status === 'cancelled' ? 'canceled' : 'active',
          updated_at:      new Date().toISOString(),
        }, { onConflict: 'google_event_id' })
        .select()
        .single();

      if (callError) throw callError;

      if (source === 'vambe') {
        const attendees = event.attendees?.filter(
          a => !calendarIds.includes(a.email)
        ) ?? [];
        await upsertInvitees(call.id, attendees);

      } else if (source === 'calendly') {
        const uuid = extractCalendlyUuid(event);
        if (uuid) {
          const invitees = await getCalendlyInvitees(uuid);
          await upsertInvitees(call.id, invitees);
        }

      } else {
        const attendees = event.attendees?.filter(
          a => !calendarIds.includes(a.email)
        ) ?? [];
        await upsertInvitees(call.id, attendees);
      }

      upserted++;
    } catch (err) {
      console.error(`❌ Error evento ${event.id}:`, err.message);
      errors++;
    }
  }

  return { total: allEvents.length, upserted, errors };
}

// ─── EXPORTS ───────────────────────────────────────────────────────────────

// Sync semanal (hoy → próximo domingo) — usado por el cron
export async function syncCalendarEvents() {
  console.log('🔹 Iniciando sync Google Calendar (semana actual)...');

  const now       = new Date();
  const today     = new Date(now);
  today.setHours(0, 0, 0, 0);

  const sunday = new Date(now);
  sunday.setDate(now.getDate() + (now.getDay() === 0 ? 0 : 7 - now.getDay()));
  sunday.setHours(23, 59, 59, 999);

  const result = await syncEvents({
    timeMin: today.toISOString(),
    timeMax: sunday.toISOString(),
  });

  console.log('✅ Sync Calendar completado');
  return result;
}

// Sync histórico completo (desde 2023-01-01 sin límite superior) — one-shot
export async function syncCalendarEventsHistorical() {
  console.log('🔹 Iniciando sync histórico Google Calendar...');

  const result = await syncEvents({
    timeMin: '2023-01-01T00:00:00Z',
  });

  console.log('✅ Sync histórico completado');
  return result;
}

// Re-sync Calendly invitees for events in a time range — used by cron
export async function syncCalendlyInvitees({ timeMin, timeMax } = {}) {
  console.log('🔹 Iniciando sync Calendly invitees...');

  let query = supabase
    .from('scheduled_calls')
    .select('id, google_event_id, source')
    .eq('source', 'calendly')
    .gte('starts_at', timeMin ?? '2023-01-01T00:00:00Z');

  if (timeMax) query = query.lte('starts_at', timeMax);

  const { data: calls, error } = await query;

  if (error) throw error;

  const calendar = getCalendarClient();
  const calendarIds = process.env.GOOGLE_CALENDAR_IDS
    ? process.env.GOOGLE_CALENDAR_IDS.split(',').map(s => s.trim()).filter(Boolean)
    : [process.env.GOOGLE_CALENDAR_ID];

  let updated = 0;
  let errors  = 0;

  for (const call of calls ?? []) {
    try {
      let event = null;
      for (const calendarId of calendarIds) {
        try {
          const { data } = await calendar.events.get({ calendarId, eventId: call.google_event_id });
          event = data;
          break;
        } catch (_) { /* try next */ }
      }
      if (!event) { errors++; continue; }

      const uuid = extractCalendlyUuid(event);
      if (!uuid) continue;

      const invitees = await getCalendlyInvitees(uuid);
      await upsertInvitees(call.id, invitees);
      updated++;
    } catch (err) {
      console.error(`❌ syncCalendlyInvitees [${call.google_event_id}]:`, err.message);
      errors++;
    }
  }

  console.log('✅ syncCalendlyInvitees completado');
  return { total: calls?.length ?? 0, updated, errors };
}
