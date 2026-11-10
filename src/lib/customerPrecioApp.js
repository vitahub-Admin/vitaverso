// Precios exclusivos de la app de clientes (campañas tipo "Adelántate al Buen Fin").
//
// Dónde viven: metafields de cada VARIANTE en Shopify
//   app.precio  (money o número)  precio de app; vacío = sin precio de app
//   app.hasta   (fecha, opcional) último día en que aplica (inclusive, hora de México)
// Solo aplica si es menor al precio normal.
//
// Quién lo ve: clientes con sesión iniciada y app 1.1.3 o más (la que paga con el link que
// arma el servidor, POST /api/customer-app/checkout). A versiones anteriores y a invitados
// se les muestra el precio normal: así nadie ve un precio y paga otro.
//
// Cómo se cobra: si el carrito tiene algún producto con precio de app, el checkout es un
// pedido borrador de Shopify con ese precio ya aplicado (ver customerCheckout.js).
import { mxDate } from "@/lib/customerSupplements";

export const PRECIO_APP_DESDE = "1.1.3";

// Para pedir los metafields junto con la variante en la Admin API
export const CAMPOS_PRECIO_APP = `
  precioAppMf: metafield(namespace: "app", key: "precio") { value }
  precioAppHastaMf: metafield(namespace: "app", key: "hasta") { value }`;

function esMenor(a = "", b = "") {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
}

/** ¿Este pedido viene de una app que sabe cobrar el precio de app? (y con sesión) */
export function puedeVerPrecioApp(req, user) {
  if (!user) return false;
  const v = req.headers.get("x-app-version");
  return !!v && !esMenor(v, PRECIO_APP_DESDE);
}

/** Precio de app vigente de una variante (nodo de la Admin API con CAMPOS_PRECIO_APP), o null */
export function leerPrecioApp(nodo, precioNormal) {
  const crudo = nodo?.precioAppMf?.value;
  if (!crudo) return null;
  let monto = null;
  try {
    const j = JSON.parse(crudo);
    monto = typeof j === "object" && j !== null ? Number(j.amount) : Number(j);
  } catch {
    monto = Number(crudo);
  }
  if (!(monto > 0) || !(Number(precioNormal) > monto)) return null;
  const hasta = nodo?.precioAppHastaMf?.value?.slice(0, 10);
  if (hasta && hasta < mxDate()) return null;
  return Math.round(monto * 100) / 100;
}

/**
 * Aplica (o solo quita) el precio de app en productos/variantes que traen precioAppValor:
 * permitido → price = precio de app, compareAtPrice = precio regular (compare at) o, si no
 * tiene, el de la web; precioApp = true. Siempre borra precioAppValor (no viaja a la app).
 */
export function aplicarPrecioApp(lista, permitido) {
  for (const p of lista ?? []) {
    if (!p || typeof p !== "object") continue;
    const v = p.precioAppValor;
    delete p.precioAppValor;
    if (!permitido || !v || !(p.price > v)) continue;
    // Tachado = el precio regular de siempre (el "compare at", el mismo que se tacha en
    // vitahub.mx); si el producto no tiene, el precio de la web
    p.compareAtPrice = Math.max(Number(p.compareAtPrice) || 0, p.price);
    p.price = v;
    p.precioApp = true;
  }
  return lista;
}
