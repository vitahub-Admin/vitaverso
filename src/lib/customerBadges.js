// Insignias de la tienda de Mi Vitahub: reglas en la tabla customer_app_badges
// (supabase/migrations/customer_app_insignias.sql). La app (1.1.3+) dibuja hasta 3 sobre
// la foto del producto; versiones anteriores ignoran el campo. Tabla vacía = sin insignias.
import { supabase } from "@/lib/customerSupplements";

const MAX = 3;
const CACHE_MS = 5 * 60 * 1000;
const COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
let cache = { at: 0, reglas: [] };

async function reglas() {
  if (Date.now() - cache.at < CACHE_MS) return cache.reglas;
  const { data, error } = await supabase
    .from("customer_app_badges")
    .select("texto, icono_url, color_texto, color_fondo, regla, prioridad, desde, hasta")
    .eq("activo", true)
    .order("prioridad", { ascending: true });
  // Sin tabla (todavía no se corrió el SQL) o error: sin insignias, la tienda sigue igual
  if (error) console.error("[customerBadges]", error.message);
  cache = { at: Date.now(), reglas: error ? [] : data ?? [] };
  return cache.reglas;
}

function descuento(p) {
  return p.compareAtPrice && p.price != null && p.compareAtPrice > p.price
    ? Math.round((1 - p.price / p.compareAtPrice) * 100)
    : 0;
}

function cumple(regla, p) {
  if (!regla || typeof regla !== "object") return false;
  const v = regla.valor;
  switch (regla.tipo) {
    case "todos": return true;
    case "tag": return typeof v === "string" && (p.tags ?? []).some((t) => t.toLowerCase() === v.toLowerCase());
    case "oferta": return descuento(p) > 0;
    case "descuento_min": return descuento(p) >= Number(v);
    case "precio_min": return p.price != null && p.price >= Number(v);
    case "precio_max": return p.price != null && p.price <= Number(v);
    case "precio_app": return !!(p.precioApp || p.precioAppValor);
    case "producto": return Array.isArray(v) && v.map(String).includes(String(p.productId));
    case "agotado": return !p.available;
    case "y": return Array.isArray(v) && v.length > 0 && v.every((r) => cumple(r, p));
    default: return false;
  }
}

/**
 * Agrega `badges` a cada producto/variante (necesita price, compareAtPrice, available,
 * productId y tags). Modifica los objetos y los devuelve.
 */
export async function ponerInsignias(productos) {
  const lista = await reglas().catch(() => []);
  const ahora = Date.now();
  const vigentes = lista.filter(
    (r) => (!r.desde || new Date(r.desde).getTime() <= ahora) && (!r.hasta || new Date(r.hasta).getTime() > ahora)
  );
  for (const p of productos) {
    if (!p) continue;
    const badges = [];
    for (const r of vigentes) {
      if (badges.length >= MAX) break;
      if (!cumple(r.regla, p)) continue;
      const texto = (r.texto ?? "").replace("{descuento}", `${descuento(p)}%`).trim().slice(0, 24);
      const icono = typeof r.icono_url === "string" && r.icono_url.startsWith("https://") ? r.icono_url : null;
      if (!texto && !icono) continue;
      badges.push({
        texto,
        icono,
        colorTexto: COLOR.test(r.color_texto ?? "") ? r.color_texto : "#ffffff",
        colorFondo: COLOR.test(r.color_fondo ?? "") ? r.color_fondo : "#1b3f7a",
      });
    }
    p.badges = badges;
  }
  return productos;
}
