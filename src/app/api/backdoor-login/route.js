import { NextResponse } from "next/server";
import crypto from "crypto";
import { COOKIE_SESION, firmarSesion, opcionesCookie } from "@/lib/sesionWeb";

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


  // Sesión firmada que vale un año y se renueva en cada visita (ver /api/sesion)
  response.cookies.set(COOKIE_SESION, firmarSesion(aId), opcionesCookie());
  response.cookies.set("customerId", String(aId), { ...opcionesCookie(), httpOnly: false });

  return response;
}