// POST /api/customer-app/auth/request-code  { email }
// Manda un código de 6 dígitos al correo para entrar (o crear la cuenta).
// Responde igual exista o no la cuenta, para no revelar qué correos están registrados.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/customerSupplements";
import {
  normalizeEmail, isValidEmail, generateCode, hashCode, sendLoginCode, isDemoLogin,
  CODE_TTL_MIN, RESEND_COOLDOWN_SEC, MAX_CODES_PER_EMAIL_HOUR, MAX_CODES_PER_IP_HOUR,
} from "@/lib/customerAppAccount";

export async function POST(req) {
  try {
    const { email: rawEmail } = await req.json();
    const email = normalizeEmail(rawEmail);
    if (!isValidEmail(email)) {
      return NextResponse.json({ ok: false, error: "Escribe un correo válido" }, { status: 400 });
    }

    if (isDemoLogin(email)) {
      return NextResponse.json({ ok: true, cooldown: RESEND_COOLDOWN_SEC });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const { data: recientes } = await supabase
      .from("customer_app_login_codes")
      .select("created_at")
      .eq("email", email)
      .gte("created_at", haceUnaHora)
      .order("created_at", { ascending: false });

    const ultimo = recientes?.[0];
    if (ultimo) {
      const segundos = Math.floor((Date.now() - new Date(ultimo.created_at)) / 1000);
      if (segundos < RESEND_COOLDOWN_SEC) {
        return NextResponse.json(
          { ok: false, error: `Espera ${RESEND_COOLDOWN_SEC - segundos} segundos para pedir otro código` },
          { status: 429 }
        );
      }
    }
    if ((recientes?.length ?? 0) >= MAX_CODES_PER_EMAIL_HOUR) {
      return NextResponse.json(
        { ok: false, error: "Pediste demasiados códigos. Intenta de nuevo en una hora." },
        { status: 429 }
      );
    }

    if (ip) {
      const { count } = await supabase
        .from("customer_app_login_codes")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", haceUnaHora);
      if ((count ?? 0) >= MAX_CODES_PER_IP_HOUR) {
        return NextResponse.json(
          { ok: false, error: "Demasiados intentos. Intenta de nuevo más tarde." },
          { status: 429 }
        );
      }
    }

    const code = generateCode();
    const { error } = await supabase.from("customer_app_login_codes").insert({
      email,
      code_hash: hashCode(email, code),
      expires_at: new Date(Date.now() + CODE_TTL_MIN * 60 * 1000).toISOString(),
      ip,
    });
    if (error) throw new Error(error.message);

    await sendLoginCode(email, code);

    return NextResponse.json({ ok: true, cooldown: RESEND_COOLDOWN_SEC });
  } catch (err) {
    console.error("customer-app/auth/request-code error:", err);
    return NextResponse.json(
      { ok: false, error: "No pudimos enviar el código. Intenta de nuevo." },
      { status: 500 }
    );
  }
}
