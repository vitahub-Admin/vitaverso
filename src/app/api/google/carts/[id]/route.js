import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import { cookies } from 'next/headers';

export async function GET(req) {
  try {
    // Leer customerId desde cookie
    const customerIdRaw = cookies().get("customerId")?.value;
    const customerId = customerIdRaw ? parseInt(customerIdRaw, 10) : null;

    if (!customerId) {
      return NextResponse.json(
        { success: false, message: "No hay customerId en cookies" },
        { status: 400 }
      );
    }

    // Leer parámetros de la URL (from y to)
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
    });

    // Base query vitahub-435120.silver.orders
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

    // Si hay fechas, agregar filtro dinámico
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

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error en BigQuery:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
