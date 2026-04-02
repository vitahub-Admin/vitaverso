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

const EVENT_ID = '9dmvltrhc0rimagiaf3n2bb2oc';
const CALENDAR_ID = 'c_3c3a720e16513e8c493d69760af7e1ab491a28f9a9da0f0c64e1342c3f414872@group.calendar.google.com';

const { data: event } = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: EVENT_ID });

console.log('summary:', event.summary);
console.log('description:', event.description ?? '(vacía)');
console.log('attendees:', JSON.stringify(event.attendees, null, 2));
console.log('hangoutLink:', event.hangoutLink);
console.log('extendedProperties:', JSON.stringify(event.extendedProperties, null, 2));
