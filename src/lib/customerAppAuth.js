// Shared auth helper for customer-app endpoints
import jwt from "jsonwebtoken";
import { NextResponse } from "next/server";

const SECRET = process.env.SHOPIFY_TOKEN_SECRET;

export function signCustomerToken(customerId, email) {
  return jwt.sign({ customerId: String(customerId), email }, SECRET, {
    expiresIn: "30d",
  });
}

/**
 * Verifica el Bearer token del header Authorization.
 * Retorna { customerId, email } si es válido, o null si no.
 */
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
