import crypto from "crypto";

// Sesión de la web de profesionales: una cookie firmada que el navegador no puede
// leer ni escribir (httpOnly). La cookie "customerId" que ve el navegador es solo
// para pintar la pantalla; el servidor decide quién es el usuario con ESTA.
//
// Vale mientras el profesional siga entrando: cada visita la renueva (ver /api/sesion),
// así que solo caduca si pasa un año entero sin abrir Pro.

export const COOKIE_SESION = "vh_session";
export const SESION_DIAS = 365;
const RENOVAR_DESPUES_S = 24 * 60 * 60; // no se reescribe en cada clic, solo si tiene más de un día

// La cookie vieja "customerId" (sin firma) se sigue aceptando hasta esta fecha, para
// que nadie con la sesión abierta tenga que volver a entrar. Pasada, solo vale la firmada.
const LEGADA_HASTA = new Date(process.env.SESION_LEGADA_HASTA || "2026-10-30T00:00:00Z");
export const legadaVigente = () => Date.now() < LEGADA_HASTA.getTime();

const secreto = () => process.env.SHOPIFY_TOKEN_SECRET;
const firma = (id, iat) =>
  crypto.createHmac("sha256", secreto()).update(`sesion|${id}|${iat}`).digest("hex");

export function firmarSesion(customerId) {
  const id = String(customerId);
  const iat = Math.floor(Date.now() / 1000);
  return `${id}.${iat}.${firma(id, iat)}`;
}

// Devuelve { id, iat } si la cookie es auténtica y no pasó el año; si no, null
export function leerSesion(valor) {
  if (!valor || !secreto()) return null;
  const [id, iatTxt, sig] = String(valor).split(".");
  const iat = Number(iatTxt);
  if (!/^\d+$/.test(id || "") || !Number.isFinite(iat) || !sig) return null;
  const esperada = Buffer.from(firma(id, iat));
  const recibida = Buffer.from(sig);
  if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;
  if (Date.now() / 1000 - iat > SESION_DIAS * 24 * 60 * 60) return null;
  return { id, iat };
}

export const necesitaRenovar = (sesion) =>
  Date.now() / 1000 - sesion.iat > RENOVAR_DESPUES_S;

export function opcionesCookie() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESION_DIAS * 24 * 60 * 60,
  };
}

/**
 * ID del profesional que hace la petición, o null.
 * `store` es lo que dan `await cookies()` (next/headers) o `req.cookies`.
 * Primero la sesión firmada; mientras dure la transición, también la cookie vieja.
 */
export function idDeSesion(store) {
  const firmada = leerSesion(store.get(COOKIE_SESION)?.value);
  if (firmada) return firmada.id;
  if (legadaVigente()) {
    const vieja = store.get("customerId")?.value;
    if (vieja && /^\d+$/.test(vieja.trim())) return vieja.trim();
  }
  return null;
}
