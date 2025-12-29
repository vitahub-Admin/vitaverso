// app/api/data/banner/route.js
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const DEFAULT_BANNER = { 
  url: "/BANNER.webp", 
  description: "Default banner" 
};

// Helper para manejar errores de Supabase
async function handleSupabaseError(operation, error) {
  console.error(`❌ Supabase error in ${operation}:`, error.message);
  return { success: false, error };
}

// GET - Último banner
export async function GET() {
  try {
    if (!supabase) {
      console.error("❌ Supabase client not initialized");
      return NextResponse.json(DEFAULT_BANNER);
    }

    const { data, error } = await supabase
      .from('banners')
      .select('*')
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      console.error("Error fetching last banner:", error.message);
      return NextResponse.json(DEFAULT_BANNER);
    }

    if (!data) {
      // Si no hay banners, crear uno por defecto
      const { data: defaultBanner } = await supabase
        .from('banners')
        .insert(DEFAULT_BANNER)
        .select()
        .single();
      
      return NextResponse.json(defaultBanner || DEFAULT_BANNER);
    }

    return NextResponse.json(data);
    
  } catch (error) {
    console.error("Unexpected error in GET:", error);
    return NextResponse.json(DEFAULT_BANNER);
  }
}

// POST - Agregar nuevo banner
export async function POST(req) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: "Database service unavailable" },
        { status: 503 }
      );
    }

    const body = await req.json();

    if (!body.url || body.url.trim() === '') {
      return NextResponse.json(
        { error: "URL requerida" },
        { status: 400 }
      );
    }

    // 1. Obtener el máximo orden actual
    const { data: maxOrderData, error: maxError } = await supabase
      .from('banners')
      .select('display_order')
      .order('display_order', { ascending: false })
      .limit(1)
      .single();

    if (maxError && maxError.code !== 'PGRST116') {
      console.error("Error getting max order:", maxError);
    }

    const newOrder = maxOrderData ? maxOrderData.display_order + 1 : 0;

    // 2. Insertar nuevo banner
    const { data, error } = await supabase
      .from('banners')
      .insert({
        url: body.url.trim(),
        description: (body.description || "").trim(),
        display_order: newOrder
      })
      .select()
      .single();

    if (error) {
      console.error("Error inserting banner:", error);
      return NextResponse.json(
        { error: "Error al guardar el banner", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      data,
      message: "Banner agregado exitosamente"
    });

  } catch (error) {
    console.error("Unexpected error in POST:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}

// PUT - Actualizar orden (reordenar)
export async function PUT(req) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: "Database service unavailable" },
        { status: 503 }
      );
    }

    const body = await req.json();

    if (!Array.isArray(body.banners)) {
      return NextResponse.json(
        { error: "banners debe ser un array" },
        { status: 400 }
      );
    }

    console.log(`🔄 Reordenando ${body.banners.length} banners`);

    // Preparar updates para Supabase
    const updates = body.banners.map((banner, index) => ({
      id: banner.id,
      url: banner.url,
      description: banner.description || "",
      display_order: index,
      updated_at: new Date().toISOString()
    }));

    // Actualizar todos los banners
    const { error } = await supabase
      .from('banners')
      .upsert(updates, {
        onConflict: 'id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error("Error updating banners order:", error);
      return NextResponse.json(
        { 
          error: "Error al guardar el orden",
          details: error.message,
          code: error.code
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: `Orden de ${updates.length} banners guardado exitosamente`,
      updatedCount: updates.length
    });

  } catch (error) {
    console.error("Unexpected error in PUT:", error);
    return NextResponse.json(
      { error: "Error interno del servidor", details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Eliminar banner
export async function DELETE(req) {
  try {
    if (!supabase) {
      return NextResponse.json(
        { error: "Database service unavailable" },
        { status: 503 }
      );
    }

    const body = await req.json();

    // Validar que tenemos un ID para eliminar
    if (!body.id && typeof body.index !== 'number') {
      return NextResponse.json(
        { error: "Se requiere 'id' o 'index' del banner" },
        { status: 400 }
      );
    }

    // Si se envía ID, eliminar por ID
    if (body.id) {
      const { error } = await supabase
        .from('banners')
        .delete()
        .eq('id', body.id);

      if (error) {
        console.error("Error deleting banner by ID:", error);
        return NextResponse.json(
          { error: "Error al eliminar el banner", details: error.message },
          { status: 500 }
        );
      }
    } 
    // Si se envía índice, primero obtener todos y luego eliminar el correcto
    else if (typeof body.index === 'number') {
      const { data: allBanners, error: fetchError } = await supabase
        .from('banners')
        .select('*')
        .order('display_order', { ascending: true });

      if (fetchError) {
        console.error("Error fetching banners for deletion:", fetchError);
        return NextResponse.json(
          { error: "Error al obtener banners", details: fetchError.message },
          { status: 500 }
        );
      }

      if (body.index >= 0 && body.index < allBanners.length) {
        const bannerToDelete = allBanners[body.index];
        
        const { error: deleteError } = await supabase
          .from('banners')
          .delete()
          .eq('id', bannerToDelete.id);

        if (deleteError) {
          console.error("Error deleting banner by index:", deleteError);
          return NextResponse.json(
            { error: "Error al eliminar el banner", details: deleteError.message },
            { status: 500 }
          );
        }
      } else {
        return NextResponse.json(
          { error: "Índice inválido" },
          { status: 400 }
        );
      }
    }

    // Verificar si quedan banners, si no, crear uno por defecto
    const { data: remainingBanners, error: countError } = await supabase
      .from('banners')
      .select('id')
      .limit(1);

    if (countError) {
      console.error("Error checking remaining banners:", countError);
    }

    if (!remainingBanners || remainingBanners.length === 0) {
      await supabase
        .from('banners')
        .insert([DEFAULT_BANNER]);
      console.log("✅ Banner por defecto creado (tabla estaba vacía)");
    }

    return NextResponse.json({
      ok: true,
      message: "Banner eliminado exitosamente"
    });

  } catch (error) {
    console.error("Unexpected error in DELETE:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    );
  }
}