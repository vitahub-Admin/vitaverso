// /api/customer-app/supplements
//   GET    → stack del cliente (órdenes + receta + seguimiento). Ver src/lib/customerSupplements.js
//   PATCH  → configurar / editar un suplemento, horarios de recordatorio o posponer el aviso de restock
//   DELETE → ?variantId=  quitar del stack (baja lógica: active = false)
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { supabase, buildStack, getAppUser, mxDate, addDays } from "@/lib/customerSupplements";

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const user = await getAppUser(payload.userId);
    if (!user) return unauthorized();

    const { supplements, today } = await buildStack(user);
    return NextResponse.json({ ok: true, today, supplements });
  } catch (err) {
    console.error("customer-app/supplements GET error:", err);
    return NextResponse.json({ ok: false, error: "No se pudieron cargar tus suplementos" }, { status: 500 });
  }
}

// Body (todo opcional salvo variantId):
// { variantId, productTitle, productHandle, variantTitle, orderId, orderDate, quantity,
//   startDate, dailyDose, durationDays (días por frasco), reminderTimes: ["08:00"], snoozeDays }
export async function PATCH(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  try {
    const user = await getAppUser(payload.userId);
    if (!user) return unauthorized();

    const body = await req.json();
    const variantId = Number(body.variantId);
    if (!variantId) {
      return NextResponse.json({ ok: false, error: "Falta el suplemento" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("supplement_tracking")
      .select("*")
      .eq("user_id", user.id)
      .eq("shopify_variant_id", variantId)
      .maybeSingle();

    const today = mxDate();
    const fields = { updated_at: new Date().toISOString() };

    // Posponer aviso de restock
    if (body.snoozeDays != null) {
      const days = Number(body.snoozeDays);
      if (!existing || !Number.isInteger(days) || days < 1 || days > 90) {
        return NextResponse.json({ ok: false, error: "No se pudo posponer el aviso" }, { status: 400 });
      }
      fields.snoozed_until = addDays(today, days);
    }

    // Horarios de recordatorio
    if (body.reminderTimes !== undefined) {
      const times = Array.isArray(body.reminderTimes) ? [...new Set(body.reminderTimes)] : [];
      if (times.length > 6 || !times.every((t) => HORA.test(t))) {
        return NextResponse.json({ ok: false, error: "Horario inválido, usa el formato 08:00" }, { status: 400 });
      }
      fields.reminder_times = times.sort();
    }

    // Configuración del seguimiento
    if (body.startDate !== undefined) {
      if (!FECHA.test(body.startDate) || body.startDate > addDays(today, 1)) {
        return NextResponse.json({ ok: false, error: "Fecha de inicio inválida" }, { status: 400 });
      }
      fields.start_date = body.startDate;
    }
    if (body.dailyDose !== undefined) {
      const d = body.dailyDose == null ? null : Number(body.dailyDose);
      if (d != null && !(d > 0 && d <= 100)) {
        return NextResponse.json({ ok: false, error: "Dosis inválida" }, { status: 400 });
      }
      fields.daily_dose = d;
    }
    if (body.durationDays !== undefined) {
      const d = body.durationDays == null ? null : Math.round(Number(body.durationDays));
      if (d != null && !(d >= 1 && d <= 730)) {
        return NextResponse.json({ ok: false, error: "Duración inválida" }, { status: 400 });
      }
      fields.duration_days = d;
    }
    if (body.quantity !== undefined) {
      const q = Math.round(Number(body.quantity));
      if (!(q >= 1 && q <= 20)) {
        return NextResponse.json({ ok: false, error: "Cantidad inválida" }, { status: 400 });
      }
      fields.quantity = q;
    }
    if (body.productTitle) fields.product_title = body.productTitle;
    if (body.variantTitle !== undefined) fields.variant_title = body.variantTitle;
    if (body.productHandle) fields.product_handle = body.productHandle;

    const isSetup = body.startDate !== undefined && (!existing || !existing.active || !existing.start_date);

    if (isSetup) {
      // Alta (o re-alta tras quitarlo): ciclo nuevo
      const fromOrder = body.orderId && body.orderId !== "manual";
      Object.assign(fields, {
        active: true,
        order_id: fromOrder ? String(body.orderId) : "manual",
        // Las compras posteriores a esta marca suman frascos
        last_order_at: fromOrder && body.orderDate ? body.orderDate : new Date().toISOString(),
        quantity: fields.quantity ?? 1,
        restock_notified_days: null,
        restock_notified_at: null,
        snoozed_until: null,
        source: fromOrder ? "order" : "manual",
      });
    } else if (!existing || !existing.active) {
      return NextResponse.json({ ok: false, error: "Primero configura este suplemento" }, { status: 400 });
    }

    // Fecha de fin con lo que quede guardado
    const merged = { ...(existing ?? {}), ...fields };
    if (merged.start_date && merged.duration_days) {
      const end = addDays(merged.start_date, merged.duration_days * (merged.quantity || 1));
      if (end !== existing?.end_date) {
        fields.end_date = end;
        // Si el fin se movió, el aviso de restock vuelve a armarse
        if (!isSetup && existing?.end_date && end > existing.end_date) {
          fields.restock_notified_days = null;
          fields.restock_notified_at = null;
        }
      }
    }

    const { error } = existing
      ? await supabase.from("supplement_tracking").update(fields).eq("id", existing.id)
      : await supabase.from("supplement_tracking").insert({
          user_id: user.id,
          shopify_customer_id: user.shopify_customer_id ?? null,
          shopify_variant_id: variantId,
          product_title: body.productTitle ?? "",
          variant_title: body.variantTitle ?? "",
          ...fields,
        });

    if (error) {
      console.error("supplement PATCH db error:", error);
      return NextResponse.json({ ok: false, error: "No se pudo guardar" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("customer-app/supplements PATCH error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();

  const variantId = Number(new URL(req.url).searchParams.get("variantId"));
  if (!variantId) {
    return NextResponse.json({ ok: false, error: "Falta el suplemento" }, { status: 400 });
  }

  const { error } = await supabase
    .from("supplement_tracking")
    .update({ active: false, reminder_times: [], updated_at: new Date().toISOString() })
    .eq("user_id", payload.userId)
    .eq("shopify_variant_id", variantId);

  if (error) {
    console.error("supplement DELETE error:", error);
    return NextResponse.json({ ok: false, error: "No se pudo quitar" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
