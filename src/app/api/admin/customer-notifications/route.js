// /api/admin/customer-notifications  (protegida por src/proxy.js: solo ADMIN_IDS)
//   GET  → historial de campañas a clientes con métricas
//   POST { title, body, url?, target } → envía una campaña
//        target: "all" | "con_app" | { usuario: <uuid> } | { especialista: <shopifyId> }
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { enviarCampana, estadisticasCampanas, validarUrl } from "@/lib/customerNotifications";

export const maxDuration = 300;

export async function GET() {
  try {
    const campanas = await estadisticasCampanas({ limit: 40 });
    return NextResponse.json({ ok: true, campanas });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { title, body, url, target } = await req.json();
    if (!title?.trim() || !body?.trim()) {
      return NextResponse.json({ ok: false, error: "Título y mensaje son requeridos" }, { status: 400 });
    }

    let link = null;
    try {
      link = validarUrl(url?.trim());
    } catch {
      return NextResponse.json({ ok: false, error: "El link debe ser una URL que empiece con https://" }, { status: 400 });
    }

    const admin = (await cookies()).get("customerId")?.value ?? null;
    const resultado = await enviarCampana({
      target: target ?? "all",
      title: title.trim().slice(0, 65),
      body: body.trim().slice(0, 240),
      url: link,
      source: "admin",
      createdBy: admin,
    });

    if (!resultado.ok) return NextResponse.json(resultado, { status: 404 });
    return NextResponse.json(resultado);
  } catch (err) {
    console.error("POST /api/admin/customer-notifications:", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
