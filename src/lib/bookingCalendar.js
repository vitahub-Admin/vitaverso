// Google Calendar OAuth helpers para afiliados individuales.
// Distinto del googleCalendarService.js (que usa service account).
import { google } from "googleapis";

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL}/api/booking/calendar/callback`;

export function createOAuthClient() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

export function getAuthUrl(affiliateId) {
  const client = createOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    state: affiliateId,
  });
}

/**
 * Intercambia code por tokens OAuth y los devuelve.
 */
export async function exchangeCode(code) {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

/**
 * Devuelve los busy times del afiliado para un rango de fechas.
 * @param {object} storedToken - { access_token, refresh_token, expiry_date }
 * @param {string} calendarId - "primary" o ID del calendario
 * @param {string} timeMin - ISO string
 * @param {string} timeMax - ISO string
 * @returns {Array<{start, end}>}
 */
export async function getCalendarBusy(storedToken, calendarId, timeMin, timeMax) {
  const client = createOAuthClient();
  client.setCredentials(storedToken);

  const calendar = google.calendar({ version: "v3", auth: client });
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items: [{ id: calendarId || "primary" }],
    },
  });

  return res.data.calendars?.[calendarId || "primary"]?.busy || [];
}

/**
 * Crea un evento en el calendario del afiliado para una cita confirmada.
 */
export async function createCalendarEvent(storedToken, calendarId, event) {
  const client = createOAuthClient();
  client.setCredentials(storedToken);

  const calendar = google.calendar({ version: "v3", auth: client });
  const res = await calendar.events.insert({
    calendarId: calendarId || "primary",
    conferenceDataVersion: 1,
    requestBody: {
      ...event,
      conferenceData: {
        createRequest: { requestId: `vhb-${Date.now()}` },
      },
    },
  });
  return res.data;
}
