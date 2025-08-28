import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

export async function GET(req, { params }) {
  try {
    const { id } = params; // acá podrías usar el id para elegir query dinámica
    const numericId = Number(id); // convierte de string a número

    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
    });

    // Ejemplo de query: trae datos de una tabla
    const query = `SELECT order_number 
    FROM \`vitahub-435120.Shopify.orders\` 
    WHERE referrer_id = ${id}`;

    // Pasar parámetros de manera segura
    const options = {
      query,
      location: 'us-east1', // depende de dónde esté tu dataset
      params: { id },
    };

    // Ejecutamos la query
    const [rows] = await bigquery.query(options);
    // //const [rows] = await bigquery.query({
    //   query: 'SELECT * FROM `vitahub-435120.Shopify.customers` LIMIT 5',
    //   location: 'us-east1', 
    //   useLegacySql: false,
    // });

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error en BigQuery:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
