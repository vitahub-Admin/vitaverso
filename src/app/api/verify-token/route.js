// app/api/verify-token/route.js (para tu frontend)
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export async function POST(req) {
  // Este es para cuando Next.js verifica tokens desde el frontend
  const { token } = await req.json();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return NextResponse.json({ ok: true, customerId: payload.customer_id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401 });
  }
}