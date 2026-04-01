// scripts/syncOneEvent.js
import 'dotenv/config';
import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const auth = new google.auth.JWT({
  email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL_CALENDAR,
  key: process.env.GOOGLE_PRIVATE_KEY_CALENDAR?.replace(/\\n/g, '\n'),
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  subject: process.env.GOOGLE_CALENDAR_ID,
});
const calendar = google.calendar({ version: 'v3', auth });

const EVENT_ID = 'e3fqo45lvv5ogir3cqt0amicfk';
const CALENDAR_ID = 'afiliados@vitahub.mx';

const { data: event } = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: EVENT_ID });

console.log('summary:', event.summary);
console.log('hangoutLink:', event.hangoutLink);
console.log('conferenceData:', JSON.stringify(event.conferenceData, null, 2));
console.log('description:', event.description?.slice(0, 200));
