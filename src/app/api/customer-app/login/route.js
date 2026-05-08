// POST /api/customer-app/login
// Login nativo de la app via Supabase Auth
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signCustomerToken } from "@/lib/customerAppAuth";

// Cliente con anon key para signInWithPassword
const supabaseAuth = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

// Cliente admin para leer customer_app_users
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  try {
    const { email, password, platform } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email y contraseña requeridos" },
        { status: 400 }
      );
    }

    // 1. Autenticar con Supabase Auth
    const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (authError || !authData?.user) {
      return NextResponse.json(
        { ok: false, error: "Email o contraseña incorrectos" },
        { status: 401 }
      );
    }

    // 2. Obtener datos del usuario de nuestra tabla
    const { data: userData, error: dbError } = await supabaseAdmin
      .from("customer_app_users")
      .select("id, first_name, last_name, email, phone, shopify_customer_id")
      .eq("supabase_user_id", authData.user.id)
      .maybeSingle();

    if (dbError || !userData) {
      return NextResponse.json({ ok: false, error: "Usuario no encontrado" }, { status: 404 });
    }

    // 3. Actualizar last_login_at y platform
    await supabaseAdmin
      .from("customer_app_users")
      .update({ last_login_at: new Date().toISOString(), platform: platform ?? null })
      .eq("id", userData.id);

    const token = signCustomerToken(userData.id, userData.email, userData.shopify_customer_id);

    return NextResponse.json({
      ok: true,
      token,
      customer: {
        id: userData.id,
        email: userData.email,
        firstName: userData.first_name,
        lastName: userData.last_name,
        shopifyLinked: !!userData.shopify_customer_id,
      },
    });
  } catch (err) {
    console.error("customer-app/login error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
