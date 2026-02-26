import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET() {
  try {
    // 👇 IMPORTANTE: await
    const cookieStore = await cookies();
    const session = cookieStore.get("session")?.value;

    if (!session) {
      return NextResponse.json({ ok: false });
    }

    const [customerId, signature] = session.split(".");

    if (!customerId || !signature) {
      return NextResponse.json({ ok: false });
    }

    const secret = process.env.SHOPIFY_TOKEN_SECRET;

    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(customerId)
      .digest("hex");

    if (expectedSig !== signature) {
      return NextResponse.json({ ok: false });
    }

    return NextResponse.json({
      ok: true,
      customerId: parseInt(customerId),
    });

  } catch (error) {
    console.error("check-session error:", error);
    return NextResponse.json({ ok: false });
  }
}