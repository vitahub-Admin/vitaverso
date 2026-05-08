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
