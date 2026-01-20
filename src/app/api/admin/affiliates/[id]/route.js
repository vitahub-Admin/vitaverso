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
// ==============================
// GET - Afiliado completo (perfil + analytics)
// ==============================
export async function GET(req, { params }) {
  const { id } = await params;
  const affiliateId = parseId(id);

  try {
    /* =========================
       1. PERFIL (Supabase)
    ==========================*/
    const { data: profile, error: profileError } = await supabase
      .from("affiliates")
      .select("*")
      .eq("id", affiliateId)
      .single();

    if (profileError?.code === "PGRST116") {
      return NextResponse.json(
        { success: false, error: "Afiliado no encontrado" },
        { status: 404 }
      );
    }
    if (profileError) throw profileError;

    /* =========================
       2. BIGQUERY CLIENT
    ==========================*/
    const bigquery = new BigQuery({
      projectId: process.env.GOOGLE_PROJECT_ID,
      credentials: {
        client_email: process.env.GOOGLE_CLIENT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      },
    });

    /* =========================
       3. SHARECARTS
    ==========================*/
    const sharecartsQuery = `
      SELECT
        sh.code,
        sh.created_at,
        c.email,
        sh.opens_count,
        sh.items_count,
        sh.items_value / 100 AS items_value,
        CASE
          WHEN o.order_number IS NOT NULL THEN "Completed"
          ELSE "Pending"
        END AS status,
        o.order_number
      FROM \`vitahub-435120.sharecart.carritos\` sh
      LEFT JOIN \`vitahub-435120.Shopify.customers\` c
        ON c.id = sh.customer_id
      LEFT JOIN \`vitahub-435120.silver.orders\` o
        ON sh.code = o.share_cart
      WHERE sh.customer_id = @affiliateId
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY sh.code
        ORDER BY sh.created_at DESC
      ) = 1
      ORDER BY sh.created_at DESC
    `;

    const [sharecarts] = await bigquery.query({
      query: sharecartsQuery,
      location: "us-east1",
      params: { affiliateId },
    });

    /* =========================
       4. EARNINGS / ORDERS
    ==========================*/
    const earningsQuery = `
      WITH ORDEN_PRODUCTO AS (
        SELECT
          COALESCE(o.specialist_ref, o.referrer_id) AS specialist_id,
          o.order_number,
          o.created_at,
          o.line_items_quantity,
          o.line_items_price,
          o.discount_allocations_amount,
          p.variant_id,
          pc.comission,
          ROW_NUMBER() OVER (
            PARTITION BY o.order_number, p.variant_id
            ORDER BY
              CASE WHEN pc.updated_at <= o.created_at THEN 0 ELSE 1 END,
              pc.updated_at DESC
          ) AS rn
        FROM \`vitahub-435120.silver.orders\` o
        LEFT JOIN \`vitahub-435120.silver.product\` p
          ON o.line_items_sku = p.variant_sku
         AND o.line_items_product_id = p.id
        LEFT JOIN \`vitahub-435120.Shopify.product_comission\` pc
          ON pc.variant_id = p.variant_id
        WHERE COALESCE(o.specialist_ref, o.referrer_id) = @affiliateId
      )

      SELECT
        order_number,
        created_at,
        SUM(
          (
            line_items_price * line_items_quantity
          ) - COALESCE(CAST(discount_allocations_amount AS FLOAT64), 0)
        ) AS net_amount,
        SUM(
          (
            (
              line_items_price * line_items_quantity
            ) - COALESCE(CAST(discount_allocations_amount AS FLOAT64), 0)
          ) * COALESCE(comission, 0)
        ) AS earning
      FROM ORDEN_PRODUCTO
      WHERE rn = 1
      GROUP BY order_number, created_at
      ORDER BY created_at DESC
    `;

    const [orders] = await bigquery.query({
      query: earningsQuery,
      location: "us-east1",
      params: { affiliateId },
    });

    /* =========================
       5. METRICS
    ==========================*/
    const metrics = {
      sharecarts_total: sharecarts.length,
      sharecarts_completed: sharecarts.filter(s => s.status === "Completed").length,
      orders_total: orders.length,
      total_earnings: orders.reduce((sum, o) => sum + (o.earning || 0), 0),
    };

    return NextResponse.json({
      success: true,
      data: {
        profile,
        metrics,
        sharecarts,
        orders,
      },
    });

  } catch (error) {
    console.error(`❌ GET /admin/affiliates/${affiliateId}:`, error.message);
    return NextResponse.json(
      { success: false, error: "Error obteniendo afiliado" },
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
