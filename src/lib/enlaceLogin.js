import crypto from "crypto";

// Enlace de una notificación push que, además de abrir la página, reconoce al
// profesional si en el navegador se le cayó la sesión.
//
// Solo se agrega en los push (el enlace viaja oculto en los datos del mensaje y lo
// lee solo su teléfono), nunca en correos: un correo se reenvía sin querer.
// Va atado a la página del enlace y caduca en 48 horas. Abre una sesión "de enlace",
// que no alcanza para datos sensibles (ver sesionWeb.js).

export const ENLACE_HORAS = 48;

const HOSTS_PRO = new Set(
  ["pro.vitahub.mx", (() => { try { return new URL(process.env.NEXT_PUBLIC_BASE_URL).host; } catch { return ""; } })()]
    .filter(Boolean)
);

const secreto = () => process.env.SHOPIFY_TOKEN_SECRET;
const huellaDeRuta = (ruta) => crypto.createHash("sha256").update(ruta).digest("hex").slice(0, 12);
const firma = (id, exp, ruta) =>
  crypto.createHmac("sha256", secreto()).update(`enlace|${id}|${exp}|${huellaDeRuta(ruta)}`).digest("hex").slice(0, 32);

/** Devuelve la misma URL con el parámetro `ml` para ese profesional; si no es de Pro, la deja igual. */
export function conEnlaceFirmado(url, customerId) {
  try {
    if (!url || !customerId || !secreto()) return url;
    const u = new URL(url);
    if (!HOSTS_PRO.has(u.host)) return url;
    const exp = Math.floor(Date.now() / 1000) + ENLACE_HORAS * 3600;
    u.searchParams.set("ml", `${customerId}.${exp}.${firma(customerId, exp, u.pathname)}`);
    return u.toString();
  } catch {
    return url;
  }
}

/** Valida el `ml` de la URL que se abrió. Devuelve el ID del profesional o null. */
export function verificarEnlace(ml, ruta) {
  if (!ml || !ruta || !secreto()) return null;
  const [id, expTxt, sig] = String(ml).split(".");
  const exp = Number(expTxt);
  if (!/^\d+$/.test(id || "") || !Number.isFinite(exp) || !sig) return null;
  if (Date.now() / 1000 > exp) return null;
  const a = Buffer.from(firma(id, exp, ruta));
  const b = Buffer.from(sig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
}
