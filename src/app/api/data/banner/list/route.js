// app/api/data/banner/list/route.js
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    if (!supabase) {
      console.error("❌ Supabase client not initialized");
      return NextResponse.json([]);
    }

    const { data, error } = await supabase
      .from('banners')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) {
      console.error("Error fetching banners list:", error.message);
      return NextResponse.json([]);
    }

    return NextResponse.json(data || []);
    
  } catch (error) {
    console.error("Unexpected error in GET list:", error);
    return NextResponse.json([]);
  }
}