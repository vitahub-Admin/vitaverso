import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const direction = searchParams.get("direction"); // IN | OUT
    const category = searchParams.get("category");   // earning | manual | bonus | exchange | refund
    const status = searchParams.get("status");       // pending | confirmed | cancelled
    const period = searchParams.get("period");       // week
    const customerId = searchParams.get("customer_id");

    const page = Math.max(parseInt(searchParams.get("page") || "1"), 1);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const offset = (page - 1) * limit;

let query = supabase
  .from("point_transactions")
  .select(`
    id,
    customer_id,
    amount,
    direction,
    category,
    status,
    reference_id,
    description,
    actor_type,
    created_at
  `, { count: "exact" });



    if (direction) query = query.eq("direction", direction);
    if (category) query = query.eq("category", category);
    if (status) query = query.eq("status", status);
    if (customerId) query = query.eq("customer_id", customerId);

    // Última semana
    if (period === "week") {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      query = query.gte("created_at", oneWeekAgo.toISOString());
    }

    

    const { data, error, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
      meta: {
        pagination: {
          page,
          limit,
          total: count,
          totalPages: Math.ceil(count / limit),
          hasNextPage: offset + limit < count,
          hasPrevPage: page > 1,
        },
      },
    });

  } catch (err) {
    console.error("❌ Admin GET point_transactions:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
