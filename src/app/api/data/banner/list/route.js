import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { readFile } from "fs/promises";
import path from "path";

const FILE = path.join(process.cwd(), "data", "banners.json");

export async function GET() {
  try {
    // Intentar con Supabase primero
    try {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .order('display_order', { ascending: true });

      if (!error && data && data.length > 0) {
        return NextResponse.json(data);
      }
      
      // Si Supabase no tiene datos o hay error, usar archivo local
      console.log("Supabase vacío o error, usando archivo local:", error?.message);
    } catch (supabaseError) {
      console.log("Error de conexión Supabase:", supabaseError.message);
    }

    // Fallback: leer del archivo local
    try {
      const raw = await readFile(FILE, "utf8");
      const json = JSON.parse(raw);
      return NextResponse.json(json.banners || []);
    } catch (fileError) {
      console.log("Error leyendo archivo local:", fileError.message);
      return NextResponse.json([]);
    }
    
  } catch (error) {
    console.error("Error general en GET /api/data/banner/list:", error);
    return NextResponse.json([]);
  }
}