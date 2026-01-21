// pages/api/admin/affiliates/analytics.js
import { NextResponse } from "next/server";
import { getCombinedAnalyticsData } from "@/lib/analyticsData";

export async function GET() {
  try {
    const { data, stats, meta } = await getCombinedAnalyticsData();

    return NextResponse.json({ 
      success: true, 
      data,
      meta: { 
        count: data.length,
        stats,
        ...meta
      } 
    });

  } catch (err) {
    console.error("❌ Admin analytics error:", err);
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    }, { status: 500 });
  }
}