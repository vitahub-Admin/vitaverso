import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req) {
  const { enc, t, sig } = await req.json();

  try {
    const secret = process.env.SHOPIFY_TOKEN_SECRET;
    const key1 = 7919;
    const key2 = 99991;

    const customerId = (parseInt(enc) - key2) / key1;

    if (!Number.isInteger(customerId) || customerId < 1) {
      return NextResponse.json(
        { ok: false, error: "Customer ID inválido después de descifrar" },
        { status: 401 }
      );
    }

    const message = `${customerId}|${t}`;
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(message)
      .digest("hex");

    const now = Math.floor(Date.now() / 1000);
    const isExpired = now - parseInt(t) > 36000;

    if (expectedSig !== sig) {
      return NextResponse.json(
        { ok: false, error: "Firma HMAC inválida" },
        { status: 401 }
      );
    }

    if (isExpired) {
      return NextResponse.json(
        { ok: false, error: "Token expirado" },
        { status: 401 }
      );
    }

    // 🔐 Crear cookie de sesión FIRMADA
    const sessionPayload = `${customerId}`;
    const sessionSignature = crypto
      .createHmac("sha256", secret)
      .update(sessionPayload)
      .digest("hex");

    const sessionValue = `${customerId}.${sessionSignature}`;

    const response = NextResponse.json({
      ok: true,
      customerId,
    });

    response.cookies.set("session", sessionValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;

  } catch (error) {
    console.error("❌ Error descifrando:", error);
    return NextResponse.json(
      { ok: false, error: "Error en el proceso de descifrado" },
      { status: 500 }
    );
  }
}
