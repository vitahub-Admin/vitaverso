import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

const carts = new Map();

export async function POST(req) {
  try {
    let body = {};

    // Intentar leer JSON, si falla dejar body vacío
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }

    if (!body?.items || !Array.isArray(body.items)) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 }
      );
    }

    const shareId = randomUUID();

    carts.set(shareId, {
      items: body.items,
      createdAt: Date.now(),
    });

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || req.nextUrl.origin;

    return NextResponse.json({
      ok: true,
      shareId,
      url: `${baseUrl}/sharecart/${shareId}`,
    });
  } catch (err) {
    console.error("Error in /api/sharecart:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
