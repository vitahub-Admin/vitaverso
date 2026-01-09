import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req) {
  try {
    const cookieStore = await cookies();
    const customerId = cookieStore.get('customerId')?.value;
    
    console.log('🍪 customerId desde cookies:', customerId);

    if (!customerId) {
      return NextResponse.json(
        { success: false, message: 'No hay sesión activa' },
        { status: 401 }
      );
    }

    const customerIdNum = parseInt(customerId, 10);
    
    if (isNaN(customerIdNum)) {
      return NextResponse.json(
        { success: false, message: 'CustomerId inválido en cookies' },
        { status: 400 }
      );
    }

    console.log('🔍 Buscando puntos para customer:', customerIdNum);

    // 1. Obtener o crear balance
    let { data: balance, error: balanceError } = await supabase
      .from('affiliate_points')
      .select('*')
      .eq('customer_id', customerIdNum)
      .single();

    // Crear si no existe
    if (balanceError?.code === 'PGRST116') {
      console.log('📝 Creando nuevo registro de puntos para:', customerIdNum);
      const { data: newBalance, error: createError } = await supabase
        .from('affiliate_points')
        .insert([
          {
            customer_id: customerIdNum,
            points_total: 0,
            last_sync_at: null,
            last_order_sync: null
          }
        ])
        .select()
        .single();
      
      if (createError) throw createError;
      balance = newBalance;
    } else if (balanceError) {
      throw balanceError;
    }

    // 2. Obtener últimas transacciones
    const { data: transactions, error: transError } = await supabase
      .from('point_transactions')
      .select('*')
      .eq('customer_id', customerIdNum)
      .order('processed_at', { ascending: false })
      .limit(20);

    if (transError) throw transError;

    // 3. Calcular resumen
    const totalEarned = transactions
      ?.filter(t => t.direction === 'IN')
      .reduce((sum, t) => sum + parseFloat(t.points), 0) || 0;
    
    const totalSpent = transactions
      ?.filter(t => t.direction === 'OUT')
      .reduce((sum, t) => sum + parseFloat(t.points), 0) || 0;

    // 4. Preparar respuesta
    return NextResponse.json({
      success: true,
      balance: {
        points_total: balance.points_total || 0,
        last_sync_at: balance.last_sync_at,
        last_order_sync: balance.last_order_sync,
        available: balance.points_total || 0
      },
      transactions: transactions || [],
      summary: {
        total_earned: totalEarned,
        total_spent: totalSpent,
        available: balance.points_total || 0,
        last_transaction: transactions?.[0]?.processed_at || null,
        transaction_count: transactions?.length || 0
      },
      conversion_rate: 0.1, // 10 puntos = $1 MXN
      currency: 'MXN'
    });

  } catch (error) {
    console.error('❌ Error en GET /api/affiliates/points:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.details : undefined
      },
      { status: 500 }
    );
  }
}

// POST - Para agregar puntos manualmente (si necesitas desde frontend)
export async function POST(req) {
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
    
    const { 
      points, 
      type = 'manual', 
      direction = 'IN', 
      description, 
      reference_id,
      metadata 
    } = body;

    // Validaciones
    if (!points || isNaN(points) || points <= 0) {
      return NextResponse.json(
        { success: false, message: 'Puntos inválidos' },
        { status: 400 }
      );
    }

    if (!['IN', 'OUT'].includes(direction)) {
      return NextResponse.json(
        { success: false, message: 'Dirección debe ser IN o OUT' },
        { status: 400 }
      );
    }

    if (!['sale', 'refund', 'bonus', 'manual', 'exchange'].includes(type)) {
      return NextResponse.json(
        { success: false, message: 'Tipo de transacción inválido' },
        { status: 400 }
      );
    }

    console.log('📝 Agregando puntos:', {
      customerId: customerIdNum,
      points,
      direction,
      type
    });

    // 1. Crear transacción
    const { data: transaction, error: transError } = await supabase
      .from('point_transactions')
      .insert([
        {
          customer_id: customerIdNum,
          points: direction === 'IN' ? points : -points,
          type,
          direction,
          reference_id,
          reference_type: type,
          description: description || `${type === 'manual' ? 'Ajuste' : type} ${direction === 'IN' ? '+' : '-'}${points} puntos`,
          responsable: 'user',
          metadata: metadata || {
            manual_adjustment: true,
            timestamp: new Date().toISOString()
          }
        }
      ])
      .select()
      .single();

    if (transError) throw transError;

    // 2. Actualizar balance
    const pointsToAdd = direction === 'IN' ? points : -points;
    
    // Obtener balance actual
    const { data: currentBalance } = await supabase
      .from('affiliate_points')
      .select('points_total')
      .eq('customer_id', customerIdNum)
      .single();

    let newBalance;
    
    if (currentBalance) {
      // Actualizar existente
      const { data: updated, error: updateError } = await supabase
        .from('affiliate_points')
        .update({
          points_total: (currentBalance.points_total || 0) + pointsToAdd,
          updated_at: new Date().toISOString()
        })
        .eq('customer_id', customerIdNum)
        .select()
        .single();
      
      if (updateError) throw updateError;
      newBalance = updated;
    } else {
      // Crear nuevo
      const { data: created, error: createError } = await supabase
        .from('affiliate_points')
        .insert([
          {
            customer_id: customerIdNum,
            points_total: pointsToAdd,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ])
        .select()
        .single();
      
      if (createError) throw createError;
      newBalance = created;
    }

    return NextResponse.json({
      success: true,
      message: `Puntos ${direction === 'IN' ? 'agregados' : 'descontados'} exitosamente`,
      data: {
        transaction,
        new_balance: newBalance.points_total,
        previous_balance: currentBalance?.points_total || 0,
        change: pointsToAdd
      }
    });

  } catch (error) {
    console.error('❌ Error en POST /api/affiliates/points:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}