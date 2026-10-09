// POST /api/customer-app/auth/verify-code  { email, code, platform }
// Valida el código, crea la cuenta si no existe, la vincula con Shopify por correo
// y devuelve el JWT de la app.
import { NextResponse } from "next/server";
import { signAppCustomerToken } from "@/lib/customerAppAuth";
import { supabase } from "@/lib/customerSupplements";
import {
  normalizeEmail, hashCode, safeEqual, ensureShopifyLink, isDemoLogin, MAX_ATTEMPTS,
} from "@/lib/customerAppAccount";

const INVALID = "El código es incorrecto o ya venció. Revisa tu correo o pide uno nuevo.";

async function checkCode(email, code) {
  const demo = isDemoLogin(email, code);
  if (demo !== null) return demo;

  const { data: row } = await supabase
    .from("customer_app_login_codes")
    .select("id, code_hash, expires_at, attempts")
    .eq("email", email)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row || new Date(row.expires_at) < new Date() || row.attempts >= MAX_ATTEMPTS) return false;

  if (!safeEqual(row.code_hash, hashCode(email, code))) {
    await supabase
      .from("customer_app_login_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return false;
  }

  // Consumo atómico: si dos requests llegan juntas, solo una gana
  const { data: consumed } = await supabase
    .from("customer_app_login_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("consumed_at", null)
    .select("id");
  return !!consumed?.length;
}

export async function POST(req) {
  try {
    const { email: rawEmail, code: rawCode, platform } = await req.json();
    const email = normalizeEmail(rawEmail);
    const code = String(rawCode ?? "").replace(/\D/g, "");

    if (!email || code.length !== 6) {
      return NextResponse.json({ ok: false, error: "Escribe el código de 6 dígitos" }, { status: 400 });
    }
    if (!(await checkCode(email, code))) {
      return NextResponse.json({ ok: false, error: INVALID }, { status: 401 });
    }

    // Cuenta existente o nueva
    let { data: user } = await supabase
      .from("customer_app_users")
      .select("id, email, first_name, last_name, phone, shopify_customer_id")
      .eq("email", email)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    const now = new Date().toISOString();
    if (!user) {
      const { data: created, error } = await supabase
        .from("customer_app_users")
        .insert({ email, platform: platform ?? null, last_login_at: now })
        .select("id, email, first_name, last_name, phone, shopify_customer_id")
        .single();
      if (error || !created) throw new Error(error?.message ?? "No se pudo crear la cuenta");
      user = created;
    } else {
      await supabase
        .from("customer_app_users")
        .update({ last_login_at: now, platform: platform ?? null })
        .eq("id", user.id);
    }

    user = await ensureShopifyLink(user);

    const token = signAppCustomerToken(user.id, email, user.shopify_customer_id);

    return NextResponse.json({
      ok: true,
      token,
      customer: {
        id: user.id,
        email,
        firstName: user.first_name ?? null,
        lastName: user.last_name ?? null,
        phone: user.phone ?? null,
        shopifyLinked: !!user.shopify_customer_id,
      },
      // Sin nombre (cuenta nueva sin compras): la app pide cómo se llama
      needsProfile: !user.first_name,
    });
  } catch (err) {
    console.error("customer-app/auth/verify-code error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor. Intenta de nuevo." }, { status: 500 });
  }
}
