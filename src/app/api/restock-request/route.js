/**
 * POST /api/restock-request
 *
 * El especialista pide la reposición de un producto sin stock desde el armador.
 * Reenvía la solicitud al webhook de n8n, que persiste el dato y avisa al equipo.
 *
 * Body: { product_id, product_title, variant_id?, sku? }
 *
 * La identidad del especialista NO viene del body: se resuelve de la sesión,
 * igual que en /api/favoritos. Así el dato de demanda no es falsificable y el
 * front no necesita conocer la URL del webhook.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveCustomerId, unauthorized } from "@/lib/customerAppAuth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const N8N_WEBHOOK = process.env.N8N_RESTOCK_REQUEST_WEBHOOK;

export async function POST(req) {
  try {
    const customerId = await resolveCustomerId(req);
    if (!customerId) return unauthorized();

    if (!N8N_WEBHOOK) {
      console.error("[restock-request] Falta N8N_RESTOCK_REQUEST_WEBHOOK");
      return NextResponse.json(
        { ok: false, error: "Solicitud de reposición no configurada" },
        { status: 503 }
      );
    }

    const { product_id, product_title, variant_id, sku, seccion } = await req.json();
    if (!product_id) {
      return NextResponse.json({ ok: false, error: "product_id requerido" }, { status: 400 });
    }

    // Datos del especialista para que el equipo sepa quién lo pide
    const { data: aff } = await supabase
      .from("affiliates")
      .select("first_name, last_name, email")
      .eq("shopify_customer_id", Number(customerId))
      .maybeSingle();

    // Los nombres customer_name / customer_email vienen del contrato que ya
    // espera el workflow de n8n (los mapea a la hoja de cálculo). Acá el
    // "customer" es el especialista que pide la reposición.
    const payload = {
      product_id:     String(product_id),
      product_title:  product_title || null,
      variant_id:     variant_id ? String(variant_id) : null,
      sku:            sku || null,
      customer_id:    String(customerId),
      customer_name:  [aff?.first_name, aff?.last_name].filter(Boolean).join(" ") || null,
      customer_email: aff?.email || null,
      requested_at:   new Date().toISOString(),
      // Legible para quien lee la hoja, y distingue de los pedidos que puedan
      // llegar al mismo webhook desde el storefront.
      origen:         seccion ? `Vitahub Pro · ${seccion}` : "Vitahub Pro",
    };

    const res = await fetch(N8N_WEBHOOK, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      console.error("[restock-request] n8n respondió", res.status, await res.text().catch(() => ""));
      return NextResponse.json({ ok: false, error: "No se pudo registrar la solicitud" }, { status: 502 });
    }

    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("[restock-request]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
