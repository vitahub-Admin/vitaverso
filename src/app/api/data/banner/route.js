import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { readFile, writeFile } from "fs/promises";
import path from "path";

const FILE = path.join(process.cwd(), "data", "banners.json");
const DEFAULT = { url: "/BANNER.webp", description: "Default banner" };

// GET - Último banner
export async function GET() {
  try {
    // Intentar con Supabase primero
    try {
      const { data, error } = await supabase
        .from('banners')
        .select('*')
        .order('display_order', { ascending: false })
        .limit(1)
        .single();

      if (!error && data) {
        return NextResponse.json(data);
      }
      console.log("Supabase GET falló, usando archivo local:", error?.message);
    } catch (supabaseError) {
      console.log("Error conexión Supabase:", supabaseError.message);
    }

    // Fallback: archivo local
    let json;
    try {
      const raw = await readFile(FILE, "utf8");
      json = JSON.parse(raw);
    } catch {
      // archivo no existe o está roto → crear con default
      json = { banners: [DEFAULT] };
      await writeFile(FILE, JSON.stringify(json, null, 2), "utf8");
    }

    // Si está vacío → restaurar default
    if (!json.banners || json.banners.length === 0) {
      json.banners = [DEFAULT];
      await writeFile(FILE, JSON.stringify(json, null, 2), "utf8");
    }

    const last = json.banners[json.banners.length - 1];
    return NextResponse.json(last);
    
  } catch (e) {
    console.error("Error general en GET /api/data/banner:", e);
    return NextResponse.json(DEFAULT);
  }
}

// POST - Agregar nuevo banner
export async function POST(req) {
  try {
    const body = await req.json();

    if (!body.url) {
      return NextResponse.json({ error: "url requerida" }, { status: 400 });
    }

    // Intentar guardar en Supabase primero
    let savedToSupabase = false;
    try {
      // Obtener el máximo orden actual
      const { data: maxOrderData } = await supabase
        .from('banners')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1)
        .single();

      const newOrder = maxOrderData ? maxOrderData.display_order + 1 : 0;

      const { data, error } = await supabase
        .from('banners')
        .insert({
          url: body.url,
          description: body.description || "",
          display_order: newOrder
        })
        .select()
        .single();

      if (!error) {
        savedToSupabase = true;
        console.log("Banner guardado en Supabase");
      } else {
        console.log("Error guardando en Supabase:", error.message);
      }
    } catch (supabaseError) {
      console.log("Error con Supabase:", supabaseError.message);
    }

    // Siempre guardar en archivo local también (para consistencia)
    const raw = await readFile(FILE, "utf8");
    const json = JSON.parse(raw);

    json.banners.push({
      url: body.url,
      description: body.description || ""
    });

    await writeFile(FILE, JSON.stringify(json, null, 2), "utf8");
    console.log("Banner guardado en archivo local");

    return NextResponse.json({ 
      ok: true, 
      savedToSupabase,
      message: savedToSupabase 
        ? "Banner guardado en Supabase y local" 
        : "Banner guardado en archivo local (Supabase falló)"
    });

  } catch (error) {
    console.error("Error en POST /api/data/banner:", error);
    return NextResponse.json({ 
      error: "Error interno del servidor",
      details: error.message
    }, { status: 500 });
  }
}

// DELETE - Eliminar banner (compatibilidad)
export async function DELETE() {
  try {
    // Intentar con Supabase
    try {
      const { data: banners } = await supabase
        .from('banners')
        .select('*')
        .order('display_order', { ascending: false });

      if (banners && banners.length > 0) {
        const { error } = await supabase
          .from('banners')
          .delete()
          .eq('id', banners[0].id);

        if (!error) {
          console.log("Último banner eliminado de Supabase");
        }
      }
    } catch (supabaseError) {
      console.log("Error eliminando de Supabase:", supabaseError.message);
    }

    // Eliminar del archivo local también
    const raw = await readFile(FILE, "utf8");
    const json = JSON.parse(raw);

    if (json.banners.length > 0) json.banners.pop();

    // nunca permitir vacío → restaurar default
    if (json.banners.length === 0) {
      json.banners = [DEFAULT];
    }

    await writeFile(FILE, JSON.stringify(json, null, 2), "utf8");
    console.log("Banner eliminado del archivo local");

    return NextResponse.json({ ok: true });
    
  } catch (error) {
    console.error("Error en DELETE /api/data/banner:", error);
    return NextResponse.json({ 
      error: "Error interno del servidor" 
    }, { status: 500 });
  }
}

// PUT - Actualizar lista completa
export async function PUT(req) {
  try {
    const body = await req.json();

    if (!Array.isArray(body.banners)) {
      return NextResponse.json({ error: "banners debe ser un array" }, { status: 400 });
    }

    // Intentar actualizar Supabase
    try {
      if (body.banners.length > 0 && body.banners[0].id) {
        // Los banners tienen IDs (probablemente de Supabase)
        const updates = body.banners.map((banner, index) => ({
          id: banner.id,
          url: banner.url,
          description: banner.description,
          display_order: index
        }));

        const { error } = await supabase
          .from('banners')
          .upsert(updates);

        if (!error) {
          console.log("Orden guardado en Supabase");
        }
      }
    } catch (supabaseError) {
      console.log("Error actualizando Supabase:", supabaseError.message);
    }

    // Si viene vacío → usamos default
    const newList = body.banners.length > 0 ? body.banners : [DEFAULT];

    // Actualizar archivo local
    await writeFile(
      FILE,
      JSON.stringify({ banners: newList }, null, 2),
      "utf8"
    );

    console.log("Orden guardado en archivo local");

    return NextResponse.json({ ok: true });
    
  } catch (error) {
    console.error("Error en PUT /api/data/banner:", error);
    return NextResponse.json({ 
      error: "Error interno del servidor" 
    }, { status: 500 });
  }
}