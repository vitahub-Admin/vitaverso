import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

function monthRange(year, month) {
  const from = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const to   = new Date(Date.UTC(year, month, 1)).toISOString();
  return { from, to };
}

function aggregate(exchanges) {
  let cashTotal = 0, cashCount = 0;
  let creditTotal = 0, creditCount = 0;

  for (const ex of exchanges) {
    const amt = Number(ex.points_requested);
    if (ex.exchange_type === 'cash') {
      cashTotal += amt; cashCount++;
    } else {
      creditTotal += amt; creditCount++;
    }
  }

  const total = cashTotal + creditTotal;
  const count = cashCount + creditCount;
  return {
    total,
    count,
    cash:         { amount: cashTotal,   count: cashCount },
    store_credit: { amount: creditTotal, count: creditCount },
    credit_pct:   total > 0 ? Math.round((creditTotal / total) * 100) : 0,
  };
}

export async function GET() {
  try {
    const now  = new Date();
    const thisYear  = now.getUTCFullYear();
    const thisMonth = now.getUTCMonth() + 1;
    const lastMonth = thisMonth === 1 ? 12 : thisMonth - 1;
    const lastYear  = thisMonth === 1 ? thisYear - 1 : thisYear;

    const thisRange = monthRange(thisYear, thisMonth);
    const lastRange = monthRange(lastYear, lastMonth);

    const [thisRes, lastRes] = await Promise.all([
      supabase
        .from('point_exchanges')
        .select('points_requested, exchange_type')
        .eq('status', 'approved')
        .gte('requested_at', thisRange.from)
        .lt('requested_at', thisRange.to),
      supabase
        .from('point_exchanges')
        .select('points_requested, exchange_type')
        .eq('status', 'approved')
        .gte('requested_at', lastRange.from)
        .lt('requested_at', lastRange.to),
    ]);

    if (thisRes.error) throw thisRes.error;
    if (lastRes.error) throw lastRes.error;

    const thisMo = aggregate(thisRes.data || []);
    const lastMo = aggregate(lastRes.data || []);

    const growth = lastMo.total > 0
      ? Math.round(((thisMo.total - lastMo.total) / lastMo.total) * 100)
      : null;

    return NextResponse.json({
      success: true,
      thisMonth: { ...thisMo, label: `${thisYear}-${String(thisMonth).padStart(2, '0')}` },
      lastMonth: { ...lastMo, label: `${lastYear}-${String(lastMonth).padStart(2, '0')}` },
      growth_pct: growth,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
