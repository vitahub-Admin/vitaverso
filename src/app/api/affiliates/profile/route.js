
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;  



// Validar que tenemos las variables
if (!supabaseUrl) {
  console.error('❌ ERROR: NEXT_PUBLIC_SUPABASE_URL no está definida');
}
if (!supabaseKey) {
  console.error('❌ ERROR: SUPABASE_SECRET_KEY no está definida');
}

// Crear cliente Supabase con TUS variables
const supabase = createClient(supabaseUrl, supabaseKey);

// GET - Obtener perfil del afiliado
export async function GET(req) {
  try {
    const cookieStore = await cookies();
    const customerId = cookieStore.get('customerId')?.value;
    
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: 'No hay sesión activa' },
        { status: 401 }
      );
    }

    const customerIdNum = parseInt(customerId, 10);
    if (isNaN(customerIdNum)) {
      return NextResponse.json(
        { success: false, message: 'customerId inválido' },
        { status: 400 }
      );
    }

    // Buscar en Supabase
    const { data, error } = await supabase
      .from('affiliates')
      .select('first_name, last_name, email, phone, social_media, clabe_interbancaria')
      .eq('shopify_customer_id', customerIdNum)
      .single();

    if (error?.code === 'PGRST116') {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Afiliado no encontrado' 
        },
        { status: 404 }
      );
    }

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: {
        nombre: data.first_name || '',
        apellido: data.last_name || '',
        email: data.email || '',
        telefono: data.phone || '',
        red_social: data.social_media || '',
        clabe: data.clabe_interbancaria || ''
      }
    });

  } catch (error) {
    console.error('❌ Error en GET /api/affiliates/profile:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// PATCH - Actualizar perfil
export async function PATCH(req) {
  try {
    const cookieStore = await cookies();
    const customerId = cookieStore.get('customerId')?.value;
    
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: 'No hay sesión activa' },
        { status: 401 }
      );
    }

    const customerIdNum = parseInt(customerId, 10);
    const body = await req.json();
    const { updates } = body;
    
    // Validar updates
    if (!updates || Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, message: 'No hay datos para actualizar' },
        { status: 400 }
      );
    }
    
    // Mapeo de campos
    const fieldMapping = {
      'nombre': 'first_name',
      'apellido': 'last_name',
      'telefono': 'phone',
      'red_social': 'social_media',
      'clabe': 'clabe_interbancaria'
    };

    const supabaseUpdates = {};
    Object.entries(updates).forEach(([key, value]) => {
      if (fieldMapping[key]) {
        supabaseUpdates[fieldMapping[key]] = value;
      }
    });

    // Validar CLABE si se está actualizando
    if (supabaseUpdates.clabe_interbancaria) {
      const clabe = supabaseUpdates.clabe_interbancaria;
      if (!/^\d{18}$/.test(clabe)) {
        return NextResponse.json(
          { 
            success: false, 
            message: 'La CLABE debe tener exactamente 18 dígitos numéricos' 
          },
          { status: 400 }
        );
      }
    }

    // Actualizar
    const { data, error } = await supabase
      .from('affiliates')
      .update(supabaseUpdates)
      .eq('shopify_customer_id', customerIdNum)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: 'Perfil actualizado correctamente',
      data: {
        nombre: data.first_name,
        apellido: data.last_name,
        email: data.email,
        telefono: data.phone,
        red_social: data.social_media,
        clabe: data.clabe_interbancaria
      }
    });

  } catch (error) {
    console.error('❌ Error en PATCH /api/affiliates/profile:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}