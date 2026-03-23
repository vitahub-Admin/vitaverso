import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function PATCH(req, { params }) {
  const { id } = await params;

  try {
    const body = await req.json();

    const allowed = ['attended', 'notes'];
    const updateData = Object.fromEntries(
      Object.entries(body).filter(([key]) => allowed.includes(key))
    );

    if (!Object.keys(updateData).length) {
      return NextResponse.json(
        { success: false, error: 'No hay campos válidos' },
        { status: 400 }
      );
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('scheduled_call_invitees')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data });

  } catch (error) {
    console.error(`❌ PATCH /api/admin/calendar/invitee/${id}:`, error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}