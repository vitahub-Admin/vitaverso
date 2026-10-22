// POST /api/pro/auth/code/verify  { email, code }
// Valida el código y responde igual que /api/pro/auth ({ ok, token, customer }), para que
// la pantalla de acceso trate los dos métodos igual. Solo entra un afiliado activo.
import { NextResponse } from "next/server";
import { supabase } from "@/lib/customerSupplements";
import { signCustomerToken } from "@/lib/customerAppAuth";
import { normalizeEmail, hashCode, safeEqual, MAX_ATTEMPTS } from "@/lib/customerAppAccount";
import { afiliadoPorCorreo, claveCodigo } from "@/lib/proLoginCode";

const INVALIDO = "El código es incorrecto o ya venció. Revisa tu correo o pide uno nuevo.";

async function codigoValido(clave, code) {
  const { data: fila } = await supabase
    .from("customer_app_login_codes")
    .select("id, code_hash, expires_at, attempts")
    .eq("email", clave)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!fila || new Date(fila.expires_at) < new Date() || fila.attempts >= MAX_ATTEMPTS) return false;

  if (!safeEqual(fila.code_hash, hashCode(clave, code))) {
    await supabase.from("customer_app_login_codes").update({ attempts: fila.attempts + 1 }).eq("id", fila.id);
    return false;
  }

  // Se consume de forma atómica: si llegan dos peticiones juntas, solo una gana
  const { data: consumido } = await supabase
    .from("customer_app_login_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", fila.id)
    .is("consumed_at", null)
    .select("id");
  return !!consumido?.length;
}

export async function POST(req) {
  try {
    const { email: rawEmail, code: rawCode } = await req.json();
    const email = normalizeEmail(rawEmail);
    const code = String(rawCode ?? "").replace(/\D/g, "");
    if (!email || code.length !== 6) {
      return NextResponse.json({ ok: false, error: "Escribe el código de 6 dígitos" }, { status: 400 });
    }

    if (!(await codigoValido(claveCodigo(email), code))) {
      return NextResponse.json({ ok: false, error: INVALIDO }, { status: 401 });
    }

    const afiliado = await afiliadoPorCorreo(email);
    if (!afiliado) return NextResponse.json({ ok: false, error: INVALIDO }, { status: 401 });

    const id = String(afiliado.shopify_customer_id);
    return NextResponse.json({
      ok: true,
      token: signCustomerToken(id, email),
      customer: {
        id,
        firstName: afiliado.first_name,
        lastName: afiliado.last_name,
        email,
        phone: afiliado.phone,
      },
    });
  } catch (err) {
    console.error("pro/auth/code/verify error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor. Intenta de nuevo." }, { status: 500 });
  }
}
