import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req) {
  const { aId, password } = await req.json();

  if (password !== process.env.BACKDOOR_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const secret = process.env.SHOPIFY_TOKEN_SECRET;

  const sessionSignature = crypto
    .createHmac("sha256", secret)
    .update(String(aId))
    .digest("hex");

  const sessionValue = `${aId}.${sessionSignature}`;

  const response = NextResponse.json({
    ok: true,
    customerId: parseInt(aId),
  });

  response.cookies.set("session", sessionValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}