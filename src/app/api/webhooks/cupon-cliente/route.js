/**
 * POST /api/webhooks/cupon-cliente
 *
 * Un agente regala un cupón de un solo uso a un CLIENTE de Mi Vitahub, igual que el
 * cashback: queda en "Tus descuentos" de la app (se busca por correo, así que lo ve
 * aunque todavía no tenga la app) y, si la tiene, le llega un push.
 *
 * Es el gemelo de /api/webhooks/cupon (profesionales). Mismo secreto, mismas reglas de
 * reintento (`event_id`) y mismos topes.
 *
 * body: {
 *   target:        correo del cliente (uno solo),
 *   tipo:          "monto" | "porcentaje",
 *   valor:         monto en MXN (1–2000) o porcentaje entero (1–30),
 *   minimo?:       compra mínima (MXN) para poder usarlo; sin esto no hay mínimo,
 *   vence_en_dias? entero 1–365; sin esto no vence,
 *   nota?:         texto corto que el cliente ve como nombre del cupón,
 *   event_id?:     id del evento de origen; un reintento no crea otro cupón,
 *   agente?:       nombre del agente que lo manda (queda en el registro),
 *   avisar?:       false para no mandar el push (igual queda en sus descuentos),
 *   url?:          https; se abre al tocar el push,
 *   title?, body?: texto del push. Admite {codigo}, {descuento}, {valor} y {nota}.
 * }
 */

import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabase } from "@/lib/customerSupplements";
import { otorgarDescuento } from "@/lib/descuentosClientes";
import { enviarNotificaciones, validarUrl } from "@/lib/customerNotifications";

export const runtime = "nodejs";

const MONTO_MAXIMO = 2000;
const PORCENTAJE_MAXIMO = 30;

function secretoValido(header) {
  const esperado = process.env.NOTIFY_WEBHOOK_SECRET;
  if (!esperado) return false;
  const recibido = (header || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

const error = (mensaje, status) => NextResponse.json({ ok: false, error: mensaje }, { status });
const exacto = (s) => String(s).replace(/[\\%_]/g, "\\$&");

export async function POST(req) {
  if (!secretoValido(req.headers.get("authorization"))) return error("No autorizado", 401);

  try {
    const body = await req.json().catch(() => null);
    if (!body) return error("Body inválido", 400);

    const tipo = String(body.tipo || "").trim().toLowerCase();
    const valor = Number(body.valor);
    if (!["monto", "porcentaje"].includes(tipo)) return error('tipo debe ser "monto" o "porcentaje"', 400);
    if (!Number.isFinite(valor) || valor <= 0) return error("valor debe ser un número mayor a cero", 400);
    if (tipo === "monto" && valor > MONTO_MAXIMO) return error(`El máximo por cupón es $${MONTO_MAXIMO}`, 400);
    if (tipo === "porcentaje" && (valor > PORCENTAJE_MAXIMO || !Number.isInteger(valor))) {
      return error(`El porcentaje debe ser un entero de 1 a ${PORCENTAJE_MAXIMO}`, 400);
    }

    let minimo = null;
    if (body.minimo != null) {
      minimo = Number(body.minimo);
      if (!Number.isFinite(minimo) || minimo <= 0) return error("minimo debe ser un número mayor a cero", 400);
    }

    let venceEnDias = null;
    if (body.vence_en_dias != null) {
      venceEnDias = Number(body.vence_en_dias);
      if (!Number.isInteger(venceEnDias) || venceEnDias < 1 || venceEnDias > 365) {
        return error("vence_en_dias debe ser un entero de 1 a 365", 400);
      }
    }

    const nota = String(body.nota || "").trim().slice(0, 120);
    const tituloAviso = String(body.title || "").trim().slice(0, 65);
    const mensajeAviso = String(body.body || "").trim().slice(0, 240);
    if (Boolean(tituloAviso) !== Boolean(mensajeAviso)) return error("title y body van juntos: manda los dos o ninguno", 400);

    let url = null;
    try {
      url = validarUrl(body.url);
    } catch {
      return error("url debe empezar con https://", 400);
    }

    const agente = body.agente ? String(body.agente).trim().slice(0, 60) : null;
    const eventId = body.event_id ? String(body.event_id).slice(0, 120) : null;

    // Uno solo: un cupón de un solo uso se asigna a una persona
    const email = Array.isArray(body.target) ? "" : String(body.target ?? "").trim().toLowerCase();
    if (!email.includes("@")) return error("target debe ser el correo de UN cliente", 400);

    // Si ya existe la cuenta de la app se usa para el aviso; si no, el cupón igual queda por correo
    const { data: usuarios } = await supabase.from("customer_app_users").select("id").ilike("email", exacto(email));

    const d = await otorgarDescuento({
      email,
      ...(tipo === "porcentaje" ? { porcentaje: valor } : { monto: valor }),
      minimo,
      venceEnDias,
      titulo: nota || (tipo === "porcentaje" ? `${valor}% de descuento` : `$${valor} de regalo`),
      origen: "agente",
      origenRef: eventId,
      prefijo: "AG",
    });

    if (!d.nuevo) {
      return NextResponse.json({
        ok: true,
        duplicado: true,
        code: d.code,
        mensaje: "Ese evento ya había generado un cupón",
      });
    }

    let push = { enviados: 0, sin_token: 0 };
    if (body.avisar !== false && usuarios?.length) {
      const que = tipo === "porcentaje" ? `${valor}% de descuento` : `$${valor} MXN de crédito`;
      const llenar = (s) =>
        s
          .replaceAll("{codigo}", d.code)
          .replaceAll("{descuento}", que)
          .replaceAll("{valor}", String(valor))
          .replaceAll("{nota}", nota);
      const r = await enviarNotificaciones(
        usuarios.map((u) => ({
          userId: u.id,
          title: tituloAviso ? llenar(tituloAviso) : "¡Tienes un descuento! 🎁",
          body: tituloAviso ? llenar(mensajeAviso) : `Vitahub te regaló ${que}${nota ? ` (${nota})` : ""}. Ya está en tus descuentos.`,
          data: { type: "discount", code: d.code, evento: "cupon", ...(url ? { url } : {}), ...(agente ? { agente } : {}) },
        }))
      ).catch((e) => {
        console.error("[webhook cupon-cliente] push:", e.message);
        return { enviados: 0, sin_token: 0 };
      });
      push = { enviados: r.enviados, sin_token: r.sin_token };
    }

    return NextResponse.json(
      {
        ok: true,
        code: d.code,
        tipo,
        valor,
        minimo,
        vence: d.endsAt,
        tiene_app: Boolean(usuarios?.length),
        push,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[webhook cupon-cliente]", err?.message);
    return error(err.message, 500);
  }
}
