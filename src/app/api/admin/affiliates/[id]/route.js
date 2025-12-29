import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';


const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY  // ← Esta es la correcta
);
// Helper para parsear el ID (puede ser número o string)
function parseId(id) {
  const num = Number(id);
  return isNaN(num) ? id : num;
}

// GET - Obtener un afiliado por ID
export async function GET(req, { params }) {
  try {
    const { id } = await params;
    const parsedId = parseId(id);
    
    const { data, error } = await supabase
      .from('affiliates')
      .select('*')
      .eq('id', parsedId)
      .single();
    
    if (error?.code === 'PGRST116') {
      return NextResponse.json(
        { success: false, error: 'Afiliado no encontrado' },
        { status: 404 }
      );
    }
    
    if (error) throw error;
    
    return NextResponse.json({ success: true, data });
    
  } catch (error) {
    console.error(`❌ GET /admin/affiliates/${params.id} error:`, error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PUT - Actualizar afiliado
export async function PUT(req, { params }) {
  try {
    const { id } = await params;
    const parsedId = parseId(id);
    const body = await req.json();
    
    // Verificar existencia
    const { data: existing } = await supabase
      .from('affiliates')
      .select('id')
      .eq('id', parsedId)
      .single();
    
    if (!existing) {
      return NextResponse.json(
        { success: false, error: 'Afiliado no encontrado' },
        { status: 404 }
      );
    }
    
    // Remover campos inmutables
    const { id: _, created_at: __, ...updateData } = body;
    
    // Agregar timestamp
    updateData.updated_at = new Date().toISOString();
    
    // Actualizar
    const { data, error } = await supabase
      .from('affiliates')
      .update(updateData)
      .eq('id', parsedId)
      .select()
      .single();
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      data,
      message: 'Afiliado actualizado'
    });
    
  } catch (error) {
    console.error(`❌ PUT /admin/affiliates/${params.id} error:`, error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Desactivar afiliado (soft delete)
export async function DELETE(req, { params }) {
  try {
    const { id } = await params;
    const parsedId = parseId(id);
    
    // Soft delete (cambiar status)
    const { data, error } = await supabase
      .from('affiliates')
      .update({ 
        status: 'inactive',
        updated_at: new Date().toISOString()
      })
      .eq('id', parsedId)
      .select()
      .single();
    
    if (error?.code === 'PGRST116') {
      return NextResponse.json(
        { success: false, error: 'Afiliado no encontrado' },
        { status: 404 }
      );
    }
    
    if (error) throw error;
    
    return NextResponse.json({
      success: true,
      data,
      message: 'Afiliado desactivado'
    });
    
  } catch (error) {
    console.error(`❌ DELETE /admin/affiliates/${params.id} error:`, error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}