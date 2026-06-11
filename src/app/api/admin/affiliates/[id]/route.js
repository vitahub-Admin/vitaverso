// src/app/api/admin/affiliates/[id]/route.js

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { upsertAffiliate } from "@/app/services/vambeService";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const SHOPIFY_BASE = `https://${process.env.SHOPIFY_STORE}/admin/api/2024-01`;
const SHOPIFY_HEADERS = {
  'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
  'Content-Type': 'application/json',
};

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

    // ← Sincronizar con Vambe (fire-and-forget, no bloquea la respuesta)
    upsertAffiliate(data, supabase).catch(err =>
      console.error('[Vambe] Error en upsert tras PUT:', err.message)
    );

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

    // ← Sincronizar con Vambe (fire-and-forget)
    upsertAffiliate(data, supabase).catch(err =>
      console.error('[Vambe] Error en upsert tras PATCH:', err.message)
    );

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

// ==============================
// DELETE - Dar de baja del programa
// ==============================
export async function DELETE(req, { params }) {
  const { id } = await params;
  const affiliateId = parseId(id);
  const log = [];

  try {
    const { data: affiliate, error: findError } = await supabase
      .from('affiliates')
      .select('id, shopify_customer_id, shopify_collection_id, email, first_name, last_name')
      .eq('id', affiliateId)
      .single();

    if (findError?.code === 'PGRST116' || !affiliate) {
      return NextResponse.json({ success: false, error: 'Afiliado no encontrado' }, { status: 404 });
    }

    // 1. Quitar tag "especialista" de Shopify
    if (affiliate.shopify_customer_id) {
      try {
        const custRes = await fetch(`${SHOPIFY_BASE}/customers/${affiliate.shopify_customer_id}.json`, {
          headers: SHOPIFY_HEADERS,
        });
        const custData = await custRes.json();
        const currentTags = custData.customer?.tags || '';
        const newTags = currentTags.split(',').map(t => t.trim()).filter(t => t.toLowerCase() !== 'especialista').join(', ');

        await fetch(`${SHOPIFY_BASE}/customers/${affiliate.shopify_customer_id}.json`, {
          method: 'PUT',
          headers: SHOPIFY_HEADERS,
          body: JSON.stringify({ customer: { id: affiliate.shopify_customer_id, tags: newTags } }),
        });
        log.push({ action: 'shopify_tag_removed', ok: true });
      } catch (e) {
        log.push({ action: 'shopify_tag_removed', ok: false, error: e.message });
      }
    }

    // 2. Eliminar colección de Shopify
    if (affiliate.shopify_collection_id) {
      try {
        const delRes = await fetch(`${SHOPIFY_BASE}/custom_collections/${affiliate.shopify_collection_id}.json`, {
          method: 'DELETE',
          headers: SHOPIFY_HEADERS,
        });
        log.push({ action: 'shopify_collection_deleted', ok: delRes.ok, status: delRes.status });
      } catch (e) {
        log.push({ action: 'shopify_collection_deleted', ok: false, error: e.message });
      }
    }

    // 3. Rechazar exchanges pendientes
    const { data: rejected } = await supabase
      .from('point_exchanges')
      .update({
        status: 'rejected',
        admin_note: 'Afiliado dado de baja del programa',
        processed_at: new Date().toISOString(),
      })
      .eq('customer_id', affiliate.shopify_customer_id)
      .eq('status', 'pending')
      .select('id');
    log.push({ action: 'exchanges_rejected', count: rejected?.length ?? 0 });

    // 4. Soft delete en Supabase
    await supabase
      .from('affiliates')
      .update({ deleted_at: new Date().toISOString(), status: 'inactive' })
      .eq('id', affiliateId);
    log.push({ action: 'soft_deleted', ok: true });

    console.log(`🗑️ Afiliado dado de baja: ${affiliate.email}`, log);
    return NextResponse.json({ success: true, log });

  } catch (err) {
    console.error(`❌ DELETE /admin/affiliates/${affiliateId}:`, err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}