/**
 * /api/webhooks/notificar-clientes
 *
 * Igual que /api/webhooks/notificar (profesionales) pero para los clientes de la app
 * Mi Vitahub: ofertas, avisos, lo que se decida mandar desde una automatización.
 *
 *   POST { title*, body*, target?, url?, evento?, event_id? }
 *        target: "all" (por defecto) | "con_app" | correo | [correos] | { especialista: <shopifyId> }
 *        → { ok, campaign_id, destinatarios, enviados, sin_token, fallidos, errores, faltan? }
 *        event_id repetido → { ok, duplicado: true } (reintentos seguros)
 *
 *   GET ?event_id=...  |  ?campaign_id=...
 *        → métricas: destinatarios, enviados, leídas, abiertas, tasa_apertura
 *
 * Autenticación: Authorization: Bearer <NOTIFY_WEBHOOK_SECRET> (el mismo de profesionales)
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { enviarCampana, estadisticasCampanas, validarUrl } from "@/lib/customerNotifications";

export const runtime = "nodejs";
export const maxDuration = 300;

function secretoValido(header) {
  const esperado = process.env.NOTIFY_WEBHOOK_SECRET;
  if (!esperado) return false;
  const recibido = (header || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req) {
  if (!secretoValido(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ ok: false, error: "Body inválido" }, { status: 400 });

    const title = String(body.title || "").trim().slice(0, 65);
    const mensaje = String(body.body || "").trim().slice(0, 240);
    if (!title || !mensaje) {
      return NextResponse.json({ ok: false, error: "title y body son requeridos" }, { status: 400 });
    }

    let url = null;
    try {
      url = validarUrl(body.url);
    } catch {
      return NextResponse.json({ ok: false, error: "url debe empezar con https://" }, { status: 400 });
    }

    const resultado = await enviarCampana({
      target: body.target ?? "all",
      title,
      body: mensaje,
      url,
      evento: body.evento ? String(body.evento).slice(0, 60) : null,
      eventId: body.event_id ? String(body.event_id).slice(0, 120) : null,
      source: "webhook",
      createdBy: "webhook",
    });

    if (!resultado.ok) return NextResponse.json(resultado, { status: 404 });
    return NextResponse.json(resultado);
  } catch (err) {
    console.error("[webhook notificar-clientes]", err?.message);
    const status = /target no reconocido/.test(err?.message) ? 400 : 500;
    return NextResponse.json({ ok: false, error: err.message }, { status });
  }
}

export async function GET(req) {
  if (!secretoValido(req.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const params = new URL(req.url).searchParams;
  const eventId = params.get("event_id");
  const campaignId = params.get("campaign_id");
  if (!eventId && !campaignId) {
    return NextResponse.json({ ok: false, error: "Falta event_id o campaign_id" }, { status: 400 });
  }
  try {
    const [stats] = await estadisticasCampanas({ eventId, campaignId, limit: 1 });
    if (!stats) return NextResponse.json({ ok: false, error: "No existe esa campaña" }, { status: 404 });
    return NextResponse.json({ ok: true, ...stats });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
