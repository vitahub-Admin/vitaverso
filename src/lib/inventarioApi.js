// API de lectura del inventario de consignación, para sistemas externos (control de stock y
// predicción de compras). Solo lectura. Acepta la misma llave que las demás APIs externas
// (SHARECART_API_KEY, en el encabezado x-api-key) y, si hace falta separar consumidores,
// llaves propias en INVENTARIO_API_KEYS=llave1,llave2 (también como Authorization: Bearer <llave>).

import crypto from "crypto";
import { NextResponse } from "next/server";

const llaves = () =>
  [process.env.SHARECART_API_KEY, ...String(process.env.INVENTARIO_API_KEYS || "").split(",")]
    .map((s) => String(s || "").trim()).filter(Boolean);

function igual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** null si la llave es válida; si no, la respuesta de error lista para devolver. */
export function exigirLlave(req) {
  const recibida = (req.headers.get("x-api-key") || req.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "").trim();
  const validas = llaves();
  if (!validas.length) {
    return NextResponse.json({ ok: false, error: "API no habilitada" }, { status: 503 });
  }
  if (!recibida || !validas.some((l) => igual(l, recibida))) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  return null;
}

// Cómo mueve cada tipo lo que hay en el consultorio del profesional (el libro: entregado − vendido −
// devuelto + ajuste). Las devoluciones por venta cancelada llegan como `ajuste` positivo.
export const efectoConsultorio = (tipo, cantidad) =>
  tipo === "venta" || tipo === "devolucion" ? -Math.abs(cantidad) : cantidad;

export const codificarCursor = (m) => Buffer.from(`${m.created_at}|${m.id}`).toString("base64url");

export function leerCursor(valor) {
  try {
    const [creado, id] = Buffer.from(String(valor), "base64url").toString().split("|");
    if (creado && /^[0-9a-f-]{36}$/.test(id) && !Number.isNaN(Date.parse(creado))) return { creado, id };
  } catch {}
  return null;
}
