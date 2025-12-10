// src\app\api\google\carts\[id]\route.js
import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

// Next.js 15: params es una Promise que debemos await
export async function GET(request, { params }) {
  try {
    // ¡IMPORTANTE! En Next.js 15, params es una Promise
    const { id } = await params; // AWAIT aquí
    
    console.log("ID recibido (después de await):", id);
    
    const customerId = id ? parseInt(id, 10) : null;

    if (!customerId || isNaN(customerId)) {
      return NextResponse.json(
        { success: false, message: `CustomerId inválido o no numérico: ${id}` },
        { status: 400 }
      );
    }

    // Leer parámetros de la URL (from y to) de query params
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    console.log(`Consultando carritos para customer: ${customerId}, from: ${from}, to: ${to}`);

    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
    });

    let query = `
      SELECT  
        EXTRACT(DATE FROM sh.created_at) AS created_at,
        code,
        email,
        note AS client_name,
        opens_count,
        items_count,
        items_value / 100 AS items_value,
        CASE
          WHEN order_number IS NOT NULL THEN "Completed"
          ELSE "Pending"
        END AS status  
      FROM vitahub-435120.sharecart.carritos sh
      LEFT JOIN vitahub-435120.Shopify.customers c ON c.id = sh.customer_id
      LEFT JOIN vitahub-435120.silver.orders o ON sh.code = o.share_cart
      WHERE sh.customer_id = @customerId
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY code 
        ORDER BY EXTRACT(DATE FROM sh.created_at) DESC
      ) = 1
    `;

    if (from && to) {
      query += ` AND DATE(sh.created_at) BETWEEN @from AND @to`;
    }

    const options = {
      query,
      location: 'us-east1',
      params: {
        customerId,
        ...(from && to ? { from, to } : {}),
      },
    };

    const [rows] = await bigquery.query(options);
    console.log(`Encontrados ${rows.length} carritos para customer ${customerId}`);

    return NextResponse.json({ 
      success: true, 
      data: rows,
      meta: {
        customerId,
        count: rows.length,
        dateRange: { from, to }
      }
    });
  } catch (error) {
    console.error('Error en BigQuery:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}