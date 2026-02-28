import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl) {
  console.error('❌ ERROR: NEXT_PUBLIC_SUPABASE_URL no está definida');
}
if (!supabaseKey) {
  console.error('❌ ERROR: SUPABASE_SECRET_KEY no está definida');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
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

    // 🔥 Query ultra liviana: SOLO clabe
    const { data, error } = await supabase
      .from('affiliates')
      .select('clabe_interbancaria')
      .eq('shopify_customer_id', customerIdNum)
      .single();

    if (error?.code === 'PGRST116') {
      return NextResponse.json(
        { success: false, message: 'Afiliado no encontrado' },
        { status: 404 }
      );
    }

    if (error) throw error;

    return NextResponse.json({
      success: true,
      clabe_interbancaria: data?.clabe_interbancaria || null
    });

  } catch (error) {
    console.error('❌ Error en GET /api/affiliates/clabe:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}