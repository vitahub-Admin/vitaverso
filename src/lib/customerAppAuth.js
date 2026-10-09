import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

const SECRET = process.env.SHOPIFY_TOKEN_SECRET;

// payload: { userId, email, shopifyCustomerId? }
export function signCustomerToken(userId, email, shopifyCustomerId = null) {
  return jwt.sign(
    { userId: String(userId), email, shopifyCustomerId: shopifyCustomerId ? String(shopifyCustomerId) : null },
    SECRET,
    { expiresIn: "30d" }
  );
}

function decodeBearer(req) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

// Token de profesionales (app Vitahub Pro / web). Rechaza los de la app de clientes.
export function verifyCustomerToken(req) {
  const decoded = decodeBearer(req);
  if (!decoded || decoded.typ === "customer") return null;
  return decoded;
}

// ── App de clientes ───────────────────────────────────────────────────────────
// Mismo secreto, pero con typ: "customer" para que no se pueda usar un token de
// paciente en rutas de profesional (ni al revés).
// payload: { typ: "customer", userId (customer_app_users.id), email, shopifyCustomerId|null }
// Dura 90 días y se renueva sola: /me entrega uno nuevo cuando le quedan menos de 60
// (o sea, si tiene más de 30 días). Mientras abra la app cada 3 meses, nunca pide código.
export const APP_TOKEN_DAYS = 90;
export const APP_TOKEN_RENEW_AFTER_DAYS = 30;

export function shouldRenewAppToken(payload) {
  if (!payload?.iat) return true;
  return Date.now() / 1000 - payload.iat > APP_TOKEN_RENEW_AFTER_DAYS * 86400;
}

export function signAppCustomerToken(userId, email, shopifyCustomerId = null) {
  return jwt.sign(
    {
      typ: "customer",
      userId: String(userId),
      email,
      shopifyCustomerId: shopifyCustomerId ? String(shopifyCustomerId) : null,
    },
    SECRET,
    { expiresIn: `${APP_TOKEN_DAYS}d` }
  );
}

export function verifyAppCustomerToken(req) {
  const decoded = decodeBearer(req);
  if (!decoded || decoded.typ !== "customer" || !decoded.userId) return null;
  return decoded;
}

export function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

// Resuelve el shopify_customer_id tanto desde cookie (web) como desde Bearer JWT (app móvil)
export async function resolveCustomerId(req) {
  // 1. Intentar Bearer JWT (app móvil)
  const decoded = verifyCustomerToken(req);
  if (decoded?.userId) return Number(decoded.userId);

  // 2. Fallback a cookie (web)
  try {
    const { cookies } = await import("next/headers");
    const cookieStore = await cookies();
    const val = cookieStore.get("customerId")?.value;
    if (val) return Number(val);
  } catch {}

  return null;
}
