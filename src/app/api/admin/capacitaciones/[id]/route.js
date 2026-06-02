import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function DELETE(req, { params }) {
  const { id } = await params;
  const { error } = await supabase.from("capacitaciones").delete().eq("id", id);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function PUT(req, { params }) {
  const { id } = await params;
  try {
    const body    = await req.json();
    const allowed = ["title", "description", "event_date", "event_time", "image_url", "link"];
    const updates = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

    // Auto-resolver el event_uri si viene link de Calendly
    if (updates.link !== undefined) {
      updates.calendly_event_uri = await resolveCalendlyEventUri(updates.link);
    }

    const { data, error } = await supabase
      .from("capacitaciones")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
