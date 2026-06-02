import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { broadcastToAffiliates } from "@/lib/affiliateNotifications";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function resolveCalendlyEventUri(link) {
  if (!link || !link.includes('calendly.com')) return null;
  try {
    const res = await fetch(
      `https://api.calendly.com/event_types?user=https://api.calendly.com/users/${process.env.CALENDLY_USER_UUID}`,
      { headers: { Authorization: `Bearer ${process.env.CALENDLY_API_TOKEN}` } }
    );
    const data = await res.json();
    const normalize = url => url?.toLowerCase().replace(/\/$/, '');
    const match = (data.collection || []).find(e => normalize(e.scheduling_url) === normalize(link));
    return match?.uri || null;
  } catch {
    return null;
  }
}

export async function GET() {
  const { data, error } = await supabase
    .from("capacitaciones")
    .select("*")
    .order("event_date", { ascending: false })
    .order("event_time", { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, data: data || [] });
}

export async function POST(req) {
  try {
    const { title, description, event_date, event_time, image_url, link } = await req.json();

    if (!title || !event_date || !event_time) {
      return NextResponse.json(
        { success: false, error: "Título, fecha y hora son obligatorios" },
        { status: 400 }
      );
    }

    const calendly_event_uri = await resolveCalendlyEventUri(link);

    const { data, error } = await supabase
      .from("capacitaciones")
      .insert({
        title,
        description:        description || null,
        event_date,
        event_time,
        image_url:          image_url || null,
        link:               link || null,
        calendly_event_uri: calendly_event_uri || null,
      })
      .select()
      .single();

    if (error) throw error;

    broadcastToAffiliates(
      'Nueva capacitación disponible 📚',
      title,
      { type: 'new_capacitacion', capacitacionId: data.id }
    ).catch(() => {});

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
