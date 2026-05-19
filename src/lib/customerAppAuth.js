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

export function verifyCustomerToken(req) {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
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
