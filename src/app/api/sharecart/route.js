import { NextResponse } from "next/server";

// Temporal store (se borra si se reinicia el server)
const carts = new Map();

export async function POST(req) {
  try {
    const body = await req.json();

    if (!body?.items || !Array.isArray(body.items)) {
      return NextResponse.json(
        { ok: false, error: "Invalid payload" },
        { status: 400 }
      );
    }

    // Generar ID único
    const shareId = crypto.randomUUID();

    // Guardar carrito
    carts.set(shareId, {
      items: body.items,
      createdAt: Date.now(),
    });

    return NextResponse.json({
      ok: true,
      shareId,
      url: `${process.env.NEXT_PUBLIC_BASE_URL}/sharecart/${shareId}`,
    });
  } catch (err) {
    console.error("Error in /api/sharecart:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id || !carts.has(id)) {
      return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      cart: carts.get(id),
    });
  } catch (err) {
    console.error("Error in GET /api/sharecart:", err);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
