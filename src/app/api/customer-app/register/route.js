// POST /api/customer-app/register
// Crea cuenta nativa de la app (independiente de Shopify)
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { signCustomerToken } from "@/lib/customerAppAuth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  try {
    const { email, password, firstName, lastName, phone } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email y contraseña requeridos" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { ok: false, error: "La contraseña debe tener al menos 6 caracteres" },
        { status: 400 }
      );
    }

    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true, // confirmado directamente, sin email de verificación
    });

    if (authError) {
      const msg = authError.message.includes("already registered")
        ? "Ya existe una cuenta con ese email"
        : authError.message;
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    const supabaseUserId = authData.user.id;

    // 2. Crear fila en customer_app_users
    const { data: userData, error: dbError } = await supabaseAdmin
      .from("customer_app_users")
      .insert({
        supabase_user_id: supabaseUserId,
        email: email.trim().toLowerCase(),
        first_name: firstName ?? null,
        last_name: lastName ?? null,
        phone: phone ?? null,
        last_login_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (dbError) {
      // Limpiar el usuario de Auth si falla la DB
      await supabaseAdmin.auth.admin.deleteUser(supabaseUserId);
      console.error("register db error:", dbError);
      return NextResponse.json({ ok: false, error: "Error al crear la cuenta" }, { status: 500 });
    }

    const token = signCustomerToken(userData.id, email.trim().toLowerCase());

    return NextResponse.json({
      ok: true,
      token,
      customer: {
        id: userData.id,
        email: email.trim().toLowerCase(),
        firstName: firstName ?? null,
        lastName: lastName ?? null,
      },
    });
  } catch (err) {
    console.error("customer-app/register error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
