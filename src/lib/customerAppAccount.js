// Cuentas propias de la app de clientes.
//
// Login sin contraseña: código de 6 dígitos al correo (mismo esquema que la
// verificación de Vitahub Pro: Resend + código con vencimiento). Con el correo
// ya verificado buscamos al cliente en Shopify y guardamos su id: de ahí salen
// pedidos, especialista y recetas. Si todavía no compró, la cuenta funciona igual
// y se vincula sola la primera vez que aparezca en Shopify con ese correo.

import crypto from "crypto";
import { Resend } from "resend";
import { supabase, shopifyAdmin } from "@/lib/customerSupplements";

const resend = new Resend(process.env.RESEND_API_KEY);
const SECRET = process.env.SHOPIFY_TOKEN_SECRET;

export const CODE_TTL_MIN = 15;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SEC = 60;
export const MAX_CODES_PER_EMAIL_HOUR = 5;
export const MAX_CODES_PER_IP_HOUR = 20;

export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashCode(email, code) {
  return crypto.createHash("sha256").update(`${email}:${code}:${SECRET}`).digest("hex");
}

export function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Cuenta de prueba para la revisión de Apple/Google (no pueden recibir el correo).
// Se activa solo si están las dos variables de entorno.
export function isDemoLogin(email, code) {
  const demoEmail = normalizeEmail(process.env.CUSTOMER_APP_DEMO_EMAIL);
  const demoCode = process.env.CUSTOMER_APP_DEMO_CODE;
  if (!demoEmail || !demoCode || email !== demoEmail) return null;
  return code === undefined ? true : safeEqual(String(code), demoCode);
}

export async function sendLoginCode(email, code) {
  await resend.emails.send({
    from: "Vitahub <noreply@pro.vitahub.mx>",
    to: email,
    subject: `${code} es tu código para entrar a Vitahub`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#f9f9f9;border-radius:12px">
        <img src="https://vitahub.mx/logo.png" alt="Vitahub" style="height:40px;margin-bottom:24px" />
        <h2 style="color:#1b3f7a;margin:0 0 8px">Tu código para entrar</h2>
        <p style="color:#555;margin:0 0 24px">Escríbelo en la app de Vitahub para iniciar sesión:</p>
        <div style="background:#1b3f7a;color:#fff;font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;padding:20px;border-radius:10px">
          ${code}
        </div>
        <p style="color:#999;font-size:12px;margin-top:24px">
          El código vence en ${CODE_TTL_MIN} minutos. Si no lo pediste, ignora este mensaje: nadie puede entrar sin él.
        </p>
      </div>
    `,
    text: `Tu código para entrar a Vitahub es ${code}. Vence en ${CODE_TTL_MIN} minutos.`,
    tags: [{ name: "flujo", value: "login_clientes" }],
  });
}

// ── Vinculación con Shopify ───────────────────────────────────────────────────

export async function findShopifyCustomerByEmail(email) {
  const data = await shopifyAdmin(
    `query findCustomer($q: String!) {
      customers(first: 3, query: $q) {
        edges { node { id email firstName lastName phone } }
      }
    }`,
    { q: `email:"${email.replace(/"/g, "")}"` }
  );
  const match = (data?.customers?.edges ?? [])
    .map(({ node }) => node)
    .find((c) => normalizeEmail(c.email) === email);
  if (!match) return null;
  return {
    id: Number(match.id.split("/").pop()),
    firstName: match.firstName || null,
    lastName: match.lastName || null,
    phone: match.phone || null,
  };
}

/**
 * Si la cuenta todavía no está vinculada, busca su correo verificado en Shopify y la vincula.
 * Devuelve el usuario actualizado. Nunca lanza: si Shopify falla, sigue sin vincular.
 */
export async function ensureShopifyLink(user) {
  if (!user || user.shopify_customer_id || !user.email) return user;

  let sc;
  try {
    sc = await findShopifyCustomerByEmail(normalizeEmail(user.email));
  } catch (err) {
    console.error("[ensureShopifyLink] Shopify:", err.message);
    return user;
  }
  if (!sc) return user;

  // Shopify es la fuente de verdad del correo: si otra cuenta de la app tenía ese
  // cliente (cambió su correo en la tienda), se lo pasamos a la cuenta verificada.
  await supabase
    .from("customer_app_users")
    .update({ shopify_customer_id: null })
    .eq("shopify_customer_id", sc.id)
    .neq("id", user.id);

  const fields = {
    shopify_customer_id: sc.id,
    first_name: user.first_name || sc.firstName,
    last_name: user.last_name || sc.lastName,
    phone: user.phone || sc.phone,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("customer_app_users").update(fields).eq("id", user.id);
  if (error) {
    console.error("[ensureShopifyLink] update:", error.message);
    return user;
  }
  await supabase
    .from("supplement_tracking")
    .update({ shopify_customer_id: sc.id })
    .eq("user_id", user.id);

  return { ...user, ...fields };
}
