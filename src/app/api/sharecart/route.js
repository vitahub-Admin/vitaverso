import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

const carts = new Map();

function cors(response) {
  response.headers.set("Access-Control-Allow-Origin", "https://vitahub.mx");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return response;
}

export async function OPTIONS() {
  const res = NextResponse.json({}, { status: 200 });
  return cors(res);
}

export async function POST(req) {
  try {
    let body = {};

    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }

    if (!body?.items || !Array.isArray(body.items)) {
      return cors(
        NextResponse.json(
          { ok: false, error: "Invalid payload" },
          { status: 400 }
        )
      );
    }

    const shareId = randomUUID();

    carts.set(shareId, {
      items: body.items,
      createdAt: Date.now(),
    });

    const response = NextResponse.json({
      ok: true,
      shareId,
      url: `https://vitahub.mx/cart?shared-cart-id=${shareId}`,
    });

    return cors(response);

  } catch (err) {
    console.error("Error in /api/sharecart:", err);
    return cors(
      NextResponse.json({ ok: false, error: "Server error" }, { status: 500 })
    );
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || !carts.has(id)) {
      return cors(
        NextResponse.json({ ok: false, error: "Not found" }, { status: 404 })
      );
    }

    const response = NextResponse.json({
      ok: true,
      cart: carts.get(id),
    });

    return cors(response);

  } catch (err) {
    console.error("Error in GET /api/sharecart:", err);
    return cors(
      NextResponse.json({ ok: false, error: "Server error" }, { status: 500 })
    );
  }
}
