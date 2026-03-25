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
  const meetMatch = event.description?.match(/https:\/\/meet\.google\.com\/[a-z-]+/);
  if (meetMatch) return meetMatch[0];
  const calendlyMatch = event.description?.match(/https:\/\/calendly\.com\/events\/[^/\s]+\/google_meet/);
  if (calendlyMatch) return calendlyMatch[0];
  return null;
}

function extractCalendlyUuid(event) {
  const match = event.description?.match(
    /calendly\.com\/events\/([0-9a-f-]{36})\/?/
  );
  if (!match) {
    console.warn(`[Calendly] UUID no encontrado en descripción. Preview: "${event.description?.slice(0, 300)}"`);
  }
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
      const body = await res.text();
      console.error(`[Calendly] Error ${res.status} para UUID ${eventUuid}: ${body}`);
      return [];
    }

    const data = await res.json();
    console.log(`[Calendly] Invitees recibidos para ${eventUuid}: ${data.collection?.length ?? 0}`);
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

  let allEvents = [];
  let pageToken  = undefined;

  do {
    const params = {
      calendarId:    process.env.GOOGLE_CALENDAR_ID,
      singleEvents:  true,
      orderBy:       'startTime',
      maxResults:    250,
      pageToken,
      ...(timeMin && { timeMin }),
      ...(timeMax && { timeMax }),
    };

    const { data: eventsData } = await calendar.events.list(params);
    allEvents = [...allEvents, ...(eventsData.items ?? [])];
    pageToken = eventsData.nextPageToken;

  } while (pageToken);

  console.log(`🔹 Eventos encontrados: ${allEvents.length}`);

  let upserted = 0;
  let errors   = 0;

  for (const event of allEvents) {
    try {
      const source = getEventSource(event);

      const { data: call, error: callError } = await supabase
        .from('scheduled_calls')
        .upsert({
          google_event_id: event.id,
          event_name:      event.summary,
          event_type:      getEventType(event.summary),
          source,
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
          a => a.email !== process.env.GOOGLE_CALENDAR_ID
        ) ?? [];
        await upsertInvitees(call.id, attendees);

      } else if (source === 'calendly') {
        const uuid = extractCalendlyUuid(event);
        if (uuid) {
          const invitees = await getCalendlyInvitees(uuid);
          console.log(`[Calendly] Upserting ${invitees.length} invitees para call ${call.id} (evento: ${event.summary})`);
          await upsertInvitees(call.id, invitees);
        } else {
          console.warn(`[Calendly] Evento sin UUID válido, se omiten invitees: ${event.id} - ${event.summary}`);
        }

      } else {
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

  return { total: allEvents.length, upserted, errors };
}

// ─── CALENDLY SYNC ─────────────────────────────────────────────────────────

async function fetchCalendlyEvents({ timeMin, timeMax } = {}) {
  const userUri = `https://api.calendly.com/users/${process.env.CALENDLY_USER_UUID}`;
  const headers = {
    Authorization: `Bearer ${process.env.CALENDLY_API_TOKEN}`,
    'Content-Type': 'application/json',
  };

  let allEvents = [];
  let pageToken  = undefined;

  do {
    const params = new URLSearchParams({ user: userUri, count: '100' });
    if (timeMin) params.set('min_start_time', timeMin);
    if (timeMax) params.set('max_start_time', timeMax);
    if (pageToken) params.set('page_token', pageToken);

    const res = await fetch(`https://api.calendly.com/scheduled_events?${params}`, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`[Calendly] Error ${res.status} al listar eventos: ${body}`);
    }

    const data = await res.json();
    allEvents = [...allEvents, ...(data.collection ?? [])];
    pageToken = data.pagination?.next_page_token ?? undefined;
  } while (pageToken);

  return allEvents;
}

export async function syncCalendlyInvitees({ timeMin, timeMax } = {}) {
  console.log('🔹 Iniciando sync Calendly invitees...');

  const events = await fetchCalendlyEvents({ timeMin, timeMax });
  console.log(`🔹 Eventos Calendly encontrados: ${events.length}`);

  let synced = 0;
  let errors = 0;

  for (const event of events) {
    try {
      const googleEventId = event.calendar_event?.external_id;
      if (!googleEventId) continue;

      const { data: call } = await supabase
        .from('scheduled_calls')
        .select('id')
        .eq('google_event_id', googleEventId)
        .single();

      if (!call) {
        console.warn(`[Calendly] No se encontró scheduled_call para google_event_id: ${googleEventId}`);
        continue;
      }

      const uuid = event.uri.split('/').pop();
      const invitees = await getCalendlyInvitees(uuid);
      await upsertInvitees(call.id, invitees);
      synced++;
    } catch (err) {
      console.error(`❌ Error Calendly evento ${event.uri}:`, err.message);
      errors++;
    }
  }

  console.log('✅ Sync Calendly invitees completado');
  return { total: events.length, synced, errors };
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
