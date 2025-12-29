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
      data: {
        id: data?.id,  // ← Incluir el ID generado
        url: body.url,
        description: body.description || ""
      }
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
// app/api/data/banner/route.js - Método PUT mejorado
export async function PUT(req) {
  let requestBody;
  
  try {
    requestBody = await req.json();
    console.log("📦 PUT Request recibido:", {
      bannersCount: requestBody.banners?.length || 0,
      firstBanner: requestBody.banners?.[0]
    });
  } catch (parseError) {
    console.error("❌ Error parseando JSON:", parseError);
    return NextResponse.json({ 
      error: "JSON inválido en el cuerpo de la solicitud" 
    }, { status: 400 });
  }

  if (!Array.isArray(requestBody.banners)) {
    return NextResponse.json({ 
      error: "El campo 'banners' debe ser un array",
      received: typeof requestBody.banners
    }, { status: 400 });
  }

  try {
    // 1. Procesar datos para Supabase
    const supabaseUpdates = [];
    const localBanners = [];
    
    requestBody.banners.forEach((banner, index) => {
      // Validar campos requeridos
      if (!banner.url) {
        throw new Error(`Banner en posición ${index} no tiene URL`);
      }
      
      // Para Supabase (si tiene ID)
      if (banner.id) {
        supabaseUpdates.push({
          id: banner.id,
          url: banner.url,
          description: banner.description || "",
          display_order: index,
          updated_at: new Date().toISOString()
        });
      }
      
      // Para archivo local
      localBanners.push({
        url: banner.url,
        description: banner.description || "",
        ...(banner.id && { id: banner.id })
      });
    });

    // 2. Actualizar Supabase (si hay datos con ID)
    if (supabaseUpdates.length > 0) {
      try {
        console.log("🔄 Actualizando Supabase con", supabaseUpdates.length, "registros");
        
        const { error, count } = await supabase
          .from('banners')
          .upsert(supabaseUpdates);
        
        if (error) {
          console.error("❌ Error en upsert de Supabase:", error);
          // Continuar con archivo local aunque falle Supabase
        } else {
          console.log(`✅ Supabase actualizado: ${supabaseUpdates.length} banners`);
        }
      } catch (supabaseError) {
        console.error("❌ Excepción en Supabase:", supabaseError.message);
        // Continuar con archivo local
      }
    }

    // 3. Actualizar archivo local (siempre)
    const finalBanners = localBanners.length > 0 ? localBanners : [DEFAULT];
    
    const { writeFile } = await import("fs/promises");
    const { join } = await import("path");
    
    const FILE = join(process.cwd(), "data", "banners.json");
    
    await writeFile(
      FILE,
      JSON.stringify({ banners: finalBanners }, null, 2),
      "utf8"
    );
    
    console.log("💾 Archivo local actualizado:", finalBanners.length, "banners");

    // 4. Responder éxito
    return NextResponse.json({ 
      ok: true, 
      message: "Orden guardado exitosamente",
      stats: {
        totalBanners: finalBanners.length,
        supabaseUpdated: supabaseUpdates.length,
        localUpdated: finalBanners.length
      }
    });

  } catch (error) {
    console.error("💥 Error crítico en PUT /api/data/banner:", error);
    console.error("Stack trace:", error.stack);
    
    return NextResponse.json({ 
      ok: false,
      error: "Error al procesar la solicitud",
      message: error.message,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    }, { status: 500 });
  }
}