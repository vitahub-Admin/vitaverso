import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  try {
    const body = await req.json();
    const { affiliateId, amount, note, adminId } = body;

    if (!affiliateId || typeof amount !== 'number' || amount === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid payload' },
        { status: 400 }
      );
    }

    const direction = amount > 0 ? 'IN' : 'OUT';
    const absolutePoints = Math.abs(amount);

    // 🔎 Obtener balance actual
    const { data: transactions, error: fetchError } = await supabase
      .from('point_transactions')
      .select('points, direction')
      .eq('customer_id', affiliateId)
      .eq('status', 'confirmed');

    if (fetchError) throw fetchError;

    const currentBalance = transactions.reduce((sum, t) => {
      return t.direction === 'IN'
        ? sum + Number(t.points)
        : sum - Number(t.points);
    }, 0);

    const newBalance =
      direction === 'IN'
        ? currentBalance + absolutePoints
        : currentBalance - absolutePoints;

    if (newBalance < 0) {
      return NextResponse.json(
        { success: false, error: 'Insufficient balance' },
        { status: 400 }
      );
    }

    // 💾 Insert manual transaction
    const { error: insertError } = await supabase
      .from('point_transactions')
      .insert({
        customer_id: affiliateId,
        points: absolutePoints,
        direction,
        category: 'manual',
        status: 'confirmed',
        reference_id: null,
        reference_type: 'manual_adjustment',
        description: note || 'Manual admin adjustment',
        actor_type: 'admin',
        actor_id: adminId || null,
        processed_at: new Date().toISOString(),
      });

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      newBalance
    });

  } catch (err) {
    console.error('Manual wallet adjust error:', err);

    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
