import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req) {
  try {
    const { aId, password } = await req.json();

    // 🔐 Secret del backdoor (NUNCA exponer al cliente)
    const BACKDOOR_SECRET = process.env.BACKDOOR_SECRET;

    // 🔐 Secret usado para firmar sesiones (el mismo que tu verify-token)
    const SESSION_SECRET = process.env.SHOPIFY_TOKEN_SECRET;

    if (!BACKDOOR_SECRET || !SESSION_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Server misconfiguration" },
        { status: 500 }
      );
    }

    // 1️⃣ Validar password
    if (!password || password !== BACKDOOR_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // 2️⃣ Validar customerId
    const customerId = parseInt(aId);

    if (!customerId || customerId < 1) {
      return NextResponse.json(
        { ok: false, error: "Invalid customerId" },
        { status: 400 }
      );
    }

    // 3️⃣ Crear firma igual que login real
    const sessionPayload = `${customerId}`;
    const sessionSignature = crypto
      .createHmac("sha256", SESSION_SECRET)
      .update(sessionPayload)
      .digest("hex");

    const sessionValue = `${customerId}.${sessionSignature}`;

    const response = NextResponse.json({ ok: true });

    // 4️⃣ Crear cookie httpOnly segura
    response.cookies.set("session", sessionValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 días
    });

    return response;

  } catch (error) {
    console.error("❌ Backdoor login error:", error);

    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}