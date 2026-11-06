import { etiquetaDeProducto } from "@/lib/protocoloDatos";

// Los correos de protocolo se pueden enviar desde VitaPulse en vez de desde aquí. Pro sigue
// decidiendo a quién y qué se manda (el candado de una sola vez por orden, la porción, el modo de
// uso, el referido); VitaPulse tiene la plantilla, envía y lleva aperturas y clics.
//
// Interruptor (variable de entorno en Vercel): CORREOS_VIA_VITAPULSE
//   vacío o 0                        → todo sale por Resend desde Pro, como antes
//   1                                → los tres tipos salen por VitaPulse
//   protocolo,consultorio,guia_pedido → solo los tipos que se listen
// Variables necesarias cuando está prendido: VITAPULSE_URL (sin / al final) y VITAPULSE_API_KEY.
//
// Sin respaldo: si VitaPulse no responde, NO se manda por Resend (así lo pidió Maxi). El correo se
// reintenta: la orden se libera para que un reenvío de Shopify lo vuelva a intentar, y en las ventas
// en efectivo se reintenta al cerrar la liquidación. El evento_id evita duplicados.

const APP_IOS_URL = "https://apps.apple.com/mx/app/id6821184197";
const APP_ANDROID_URL = "https://play.google.com/store/apps/details?id=mx.vitahub.cliente";

export function viaVitaPulse(tipo) {
  const v = (process.env.CORREOS_VIA_VITAPULSE || "").trim();
  if (!v || v === "0") return false;
  if (v === "1") return true;
  return v.split(",").map((s) => s.trim()).includes(tipo);
}

/** Productos del protocolo tal como los usa el correo, ya listos para mandarse como datos. */
export function itemsParaEvento(lineItems) {
  return lineItems.map((i) => ({
    titulo: i.title,
    foto: i.foto || null,
    cantidad: i.quantity || 1,
    etiqueta: etiquetaDeProducto(i).texto,   // el texto de la pastilla, como lo mostraba el correo
    instruccion: i.instruccion || null,      // indicación del profesional (o "Porción: 2 cápsulas" en la guía)
    dosis_cantidad: i.dosis_amount || null,
    dosis_unidad: i.dosis_unit || null,
    momentos: i.momentos || [],
    acompanamiento: i.acompanamiento || null,
    modo_de_uso: i.modo_de_uso || null,
    nota: i.nota || null,
    descripcion: i.desc || null,
  }));
}

/**
 * @param tipo           "protocolo" | "consultorio" | "guia_pedido"
 * @param ref            id estable de lo que se manda (orden, venta); junto con el tipo forma el evento_id
 * @param especialista   nombre, o null
 * @param especialistaRol "autor" (diseñó el protocolo) | "contacto" (solo para dudas) | null
 * @param ordenNumero    número de orden, o null (una venta local no tiene)
 * @param pdfUrl         enlace al PDF del protocolo, o null (la guía de compra normal no tiene)
 */
export function armarEvento({ tipo, ref, asunto, nombre, email, emailApp = null, especialista = null, especialistaRol = null, ordenNumero = null, fechaIso, pdfUrl = null, lineItems }) {
  const fecha = new Date(fechaIso || Date.now());
  return {
    evento_id: `${tipo}:${ref}`,
    tipo,
    asunto,
    cliente: { nombre: nombre || null, email, email_app: emailApp || email },
    especialista: especialista ? { nombre: especialista, rol: especialistaRol } : null,
    orden: {
      numero: ordenNumero,
      fecha_iso: fecha.toISOString(),
      fecha_texto: fecha.toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric", timeZone: "America/Mexico_City" }),
    },
    pdf_url: pdfUrl,
    app: {
      ios_url: APP_IOS_URL,
      android_url: process.env.MI_VITAHUB_ANDROID_PUBLICA === "1" ? APP_ANDROID_URL : null,
    },
    items: itemsParaEvento(lineItems),
  };
}

/**
 * Manda el evento a VitaPulse. ok también cuando ya lo tenía (409): el reintento no duplica.
 * reintentar: true si vale la pena volver a intentarlo (caída, tiempo agotado, 5xx, 429).
 */
export async function enviarEvento(evento) {
  const base = (process.env.VITAPULSE_URL || "").replace(/\/+$/, "");
  const key = process.env.VITAPULSE_API_KEY;
  if (!base || !key) return { ok: false, reintentar: false, motivo: "falta VITAPULSE_URL o VITAPULSE_API_KEY" };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(`${base}/api/correos/evento`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({ version: 1, ...evento }),
      signal: ctrl.signal,
    });
    if (res.ok || res.status === 409) return { ok: true };
    const txt = await res.text().catch(() => "");
    return { ok: false, reintentar: res.status >= 500 || res.status === 429, motivo: `VitaPulse respondió ${res.status} ${txt.slice(0, 200)}` };
  } catch (e) {
    return { ok: false, reintentar: true, motivo: e.name === "AbortError" ? "VitaPulse no respondió en 10 s" : e.message };
  } finally {
    clearTimeout(timer);
  }
}
