// Login de profesionales con código de 6 dígitos al correo (sin contraseña).
//
// Reutiliza la tabla y los helpers del login de la app de pacientes, pero en un espacio
// propio: el correo se guarda como "pro:correo@…". Así un código pedido desde la app de
// pacientes jamás puede abrir una sesión de profesional (ni al revés), aunque sea el
// mismo correo.
//
// Quién puede entrar lo decide la tabla `affiliates`: activo y sin borrar.

import { Resend } from "resend";
import { supabase } from "@/lib/customerSupplements";
import { normalizeEmail, CODE_TTL_MIN } from "@/lib/customerAppAccount";

const resend = new Resend(process.env.RESEND_API_KEY);

export const claveCodigo = (email) => `pro:${normalizeEmail(email)}`;

/** El afiliado de ese correo si puede entrar; si no, null. */
export async function afiliadoPorCorreo(email) {
  const correo = normalizeEmail(email);
  if (!correo) return null;
  const { data } = await supabase
    .from("affiliates")
    .select("shopify_customer_id, email, first_name, last_name, phone, status, deleted_at")
    .ilike("email", correo.replace(/[\\%_]/g, (c) => `\\${c}`));
  // ilike no distingue mayúsculas; aquí se confirma que sea exactamente ese correo
  const fila = (data || []).find((a) => normalizeEmail(a.email) === correo);
  if (!fila || fila.status !== "active" || fila.deleted_at) return null;
  return fila;
}

export async function enviarCodigoPro(email, code) {
  const { error } = await resend.emails.send({
    from: "Vitahub Pro <noreply@pro.vitahub.mx>",
    to: email,
    subject: `${code} es tu código para entrar a Vitahub Pro`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
        <img src="https://pro.vitahub.mx/LOGO.png" alt="Vitahub Pro" width="137" height="40" style="display:block;border:0;height:40px;width:auto;margin-bottom:24px" />
        <h2 style="color:#1b3f7a;margin:0 0 8px">Tu código para entrar a Pro</h2>
        <p style="color:#555;margin:0 0 24px">Escríbelo en pro.vitahub.mx para iniciar sesión:</p>
        <div style="background:#1b3f7a;color:#fff;font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;border-radius:10px">
          ${code}
        </div>
        <p style="color:#999;font-size:12px;margin-top:24px">
          El código vence en ${CODE_TTL_MIN} minutos. Si no lo pediste, ignora este mensaje: nadie puede entrar sin él.
        </p>
      </div>
    `,
    text: `Tu código para entrar a Vitahub Pro es ${code}. Vence en ${CODE_TTL_MIN} minutos.`,
    tags: [{ name: "flujo", value: "login_pro" }],
  });
  if (error) throw new Error(`Resend: ${error.message ?? JSON.stringify(error)}`);
}
