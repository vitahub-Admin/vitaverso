import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 🔐 SUPABASE ADMIN CLIENT
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// Campos permitidos para update (admin)
const ALLOWED_UPDATE_FIELDS = [
  'first_name',
  'last_name',
  'phone',
  'profession',
  'patient_count',
  'social_media',
  'status',
  'clabe_interbancaria'
];

// Helper ID
function parseId(id) {
  const num = Number(id);
  return isNaN(num) ? id : num;
}

// ==============================
// GET - Afiliado por ID
// ==============================
export async function GET(req, { params }) {
  const { id } = await params;
  const affiliateId = parseId(id);

  try {
    const { data, error } = await supabase
      .from('affiliates')
      .select('*')
      .eq('id', affiliateId)
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
    console.error(`❌ GET /admin/affiliates/${affiliateId}:`, error.message);
    return NextResponse.json(
      { success: false, error: 'Error obteniendo afiliado' },
      { status: 500 }
    );
  }
}

// ==============================
// PUT - Actualizar afiliado
// ==============================
export async function PUT(req, { params }) {
  const { id } = await params;
  const affiliateId = parseId(id);

  try {
    const body = await req.json();

    const { data: existing, error: findError } = await supabase
      .from('affiliates')
      .select('id')
      .eq('id', affiliateId)
      .single();

    if (findError?.code === 'PGRST116' || !existing) {
      return NextResponse.json(
        { success: false, error: 'Afiliado no encontrado' },
        { status: 404 }
      );
    }

    const updateData = Object.fromEntries(
      Object.entries(body).filter(([key]) =>
        ALLOWED_UPDATE_FIELDS.includes(key)
      )
    );

    if (!Object.keys(updateData).length) {
      return NextResponse.json(
        { success: false, error: 'No hay campos válidos para actualizar' },
        { status: 400 }
      );
    }

    updateData.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('affiliates')
      .update(updateData)
      .eq('id', affiliateId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data,
      message: 'Afiliado actualizado'
    });

  } catch (error) {
    console.error(`❌ PUT /admin/affiliates/${affiliateId}:`, error.message);
    return NextResponse.json(
      { success: false, error: 'Error actualizando afiliado' },
      { status: 500 }
    );
  }
}

// ==============================
// PATCH - Cambiar estado
// ==============================
export async function PATCH(req, { params }) {
  const { id } = await params;
  const affiliateId = parseId(id);

  try {
    const { status } = await req.json();

    const ALLOWED_STATUS = ['active', 'inactive', 'pending', 'blocked'];

    if (!ALLOWED_STATUS.includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Estado inválido' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('affiliates')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', affiliateId)
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
      message: 'Estado actualizado'
    });

  } catch (error) {
    console.error(`❌ PATCH /admin/affiliates/${affiliateId}:`, error.message);
    return NextResponse.json(
      { success: false, error: 'Error cambiando estado' },
      { status: 500 }
    );
  }
}