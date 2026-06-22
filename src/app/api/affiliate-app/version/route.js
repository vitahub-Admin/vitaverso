import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  try {
    const platform = req.nextUrl.searchParams.get('platform') ?? 'android';

    const { data, error } = await supabase
      .from('app_config')
      .select('android_min_version, ios_min_version, forced, update_message')
      .eq('id', 1)
      .single();

    if (error) throw error;

    const min_version = platform === 'ios' ? data.ios_min_version : data.android_min_version;

    return NextResponse.json({
      ok: true,
      min_version,
      forced: data.forced,
      message: data.update_message,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
