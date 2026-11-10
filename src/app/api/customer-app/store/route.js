// GET /api/customer-app/store
//   sin parámetros  → portada: categorías, recomendados del profesional, sugeridos del carrito y ofertas (VitaDeals)
//   ?q=magnesio      → búsqueda: primero lo que arma la IA (src/lib/customerStoreIA.js),
//                      después la normal por nombre, marca o ingrediente
//   ?categoria=Sueño → productos de una categoría
//   ?producto=handle → ficha del producto: fotos, descripción y variantes
//   ?sugeridos=1     → solo los sugeridos del carrito ("Completa tu pedido")
//   ?variantes=1,2   → precio, foto y stock vivos de esas variantes (para el carrito)
// Siempre devuelve specialistRef: la app lo pone en el carrito para acreditar la venta.
//
// Se puede usar sin sesión (invitado, lo pide Apple: el catálogo no puede exigir cuenta).
// Sin sesión no hay profesional, así que no hay recomendados ni specialistRef.
import { NextResponse } from "next/server";
import { verifyAppCustomerToken } from "@/lib/customerAppAuth";
import { getAppUser } from "@/lib/customerSupplements";
import {
  buscar, categorias, recomendadosDelProfesional, sugeridosDelCarrito, vitaDeals, enriquecer, detalleProducto,
} from "@/lib/customerStore";
import { buscarConIA } from "@/lib/customerStoreIA";
import { puedeVerPrecioApp, aplicarPrecioApp } from "@/lib/customerPrecioApp";

// Resultados de una búsqueda con texto (IA + normal)
const MAXIMO_RESULTADOS = 36;

// Texto sin acentos, espacios ni signos: "B-Life" y "B Life" → "blife"
const compacto = (s) => String(s).toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const palabrasDe = (s) =>
  String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
// Palabras que cuentan para "tiene todas" (sin relleno tipo "para", "de")
const RELLENO = new Set(["de", "del", "la", "el", "los", "las", "y", "con", "para", "por", "en", "un", "una", "algo", "que", "mi", "me", "al", "sin"]);
const palabrasDeBusqueda = (q) =>
  String(q).toLowerCase().split(/\s+/).filter((w) => !RELLENO.has(w)).map(compacto).filter((w) => w.length >= 2);

/**
 * ¿El texto (ya en palabras) trae `buscado` (compacto) al principio de una palabra, pudiendo
 * seguir en las siguientes? "blife" está en "B-Life" y "B Life"; "probiotico" en
 * "Probióticos"; "ninos" NO está en "Femeninos" (no empieza ahí). Lo de 3 letras o menos
 * tiene que ser la palabra entera: "sop" no es "Soporte", "nad" sí es "NAD+".
 */
function empiezaEnPalabra(palabras, buscado) {
  if (!buscado) return false;
  const corto = buscado.length <= 3;
  for (let i = 0; i < palabras.length; i++) {
    let s = "";
    for (let j = i; j < palabras.length; j++) {
      s += palabras[j];
      if (corto ? s === buscado : s.startsWith(buscado)) return true;
      if (!buscado.startsWith(s)) break;
    }
  }
  return false;
}

// El nombre del producto: sin lo que va después del primer "|" (beneficios, ingredientes) y
// sin el "|" con que empiezan algunos ("| Resveratrol de Cellx | …")
const nombreDe = (title) => String(title ?? "").replace(/^[\s|]+/, "").split("|")[0];

/**
 * Orden final de una búsqueda con texto (estable dentro de cada grupo):
 * 0. el nombre trae lo que escribió completo ("vitamina c" → Vitamina C 1000, no Vitamina B3)
 * 1. trae todas sus palabras, en cualquier orden ("omega blife" → Omega 3 Platinum B Life)
 * 2. trae alguno de los términos de la IA (con errores de escritura: "cucurma" → Cúrcuma…)
 * 3. el resto, en el orden en que llegaron
 */
function ordenarBusqueda(lista, q, terminosIA = []) {
  const frase = compacto(q);
  const palabras = palabrasDeBusqueda(q);
  const terminos = terminosIA.map(compacto).filter((t) => t.length >= 2);
  const grupo = (x) => {
    const p = palabrasDe(`${nombreDe(x.title)} ${x.brand ?? ""}`);
    if (frase.length >= 2 && empiezaEnPalabra(p, frase)) return 0;
    if (palabras.length && palabras.every((w) => empiezaEnPalabra(p, w))) return 1;
    if (terminos.some((t) => empiezaEnPalabra(p, t))) return 2;
    return 3;
  };
  return lista.map((x, i) => ({ x, i, g: grupo(x) })).sort((a, b) => a.g - b.g || a.i - b.i).map(({ x }) => x);
}

export async function GET(req) {
  try {
    const payload = verifyAppCustomerToken(req);
    const user = payload ? await getAppUser(payload.userId) : null;
    const specialistRef = user?.specialist_shopify_id ? String(user.specialist_shopify_id) : null;

    // Precio de app: solo con sesión y app que sabe cobrarlo (1.1.3+). Se copia cada producto
    // antes de tocarlo: algunas listas vienen de caché en memoria y no se deben modificar.
    const conPrecioApp = puedeVerPrecioApp(req, user);
    const precios = (lista) => aplicarPrecioApp((lista ?? []).map((x) => ({ ...x })), conPrecioApp);

    const p = new URL(req.url).searchParams;
    const q = p.get("q");
    const categoria = p.get("categoria");

    if (p.get("producto")) {
      const handle = p.get("producto").trim().toLowerCase();
      if (!/^[a-z0-9-]+$/.test(handle)) {
        return NextResponse.json({ ok: false, error: "Producto no encontrado" }, { status: 404 });
      }
      const producto = await detalleProducto(handle);
      if (!producto) return NextResponse.json({ ok: false, error: "Este producto ya no está disponible" }, { status: 404 });
      producto.variants = precios(producto.variants);
      return NextResponse.json({ ok: true, specialistRef, producto });
    }
    if (p.get("variantes")) {
      const ids = p.get("variantes").split(",").map((v) => v.trim()).filter((v) => /^\d+$/.test(v)).slice(0, 50);
      const vivos = await enriquecer(ids);
      const variantes = Object.fromEntries(precios(Object.values(vivos)).map((v) => [v.variantId, v]));
      return NextResponse.json({ ok: true, specialistRef, variantes });
    }
    if (p.get("sugeridos")) {
      return NextResponse.json({ ok: true, specialistRef, sugeridos: precios(await sugeridosDelCarrito()) });
    }
    if (q || categoria) {
      // Solo categoría: el listado de la categoría
      if (!q) return NextResponse.json({ ok: true, specialistRef, productos: precios(await buscar({ categoria })) });

      // Con texto: primero lo que arma la IA (entiende frases, objetivos, sinónimos, inglés y
      // sube los productos del profesional), después la búsqueda normal, sin repetir. Corren a
      // la vez. Si la IA no aplica (fuera de tema, límite del día, error), queda la normal.
      const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sin-ip";
      const [deIA, normales] = await Promise.all([
        buscarConIA({ q, user, ip }),
        buscar({ q, categoria }),
      ]);
      const vistos = new Set();
      const juntos = [...deIA.productos, ...normales].filter((x) => !vistos.has(String(x.productId)) && vistos.add(String(x.productId)));
      const productos = ordenarBusqueda(juntos, q, deIA.terminos).slice(0, MAXIMO_RESULTADOS);
      return NextResponse.json({ ok: true, specialistRef, productos: precios(productos) });
    }

    const [cats, recomendados, sugeridos, ofertas] = await Promise.all([
      categorias().catch(() => []),
      recomendadosDelProfesional(user?.specialist_shopify_id).catch((e) => {
        console.error("[store] recomendados:", e.message);
        return [];
      }),
      sugeridosDelCarrito(),
      vitaDeals().catch((e) => {
        console.error("[store] vitadeals:", e.message);
        return [];
      }),
    ]);
    return NextResponse.json({
      ok: true, specialistRef, categorias: cats,
      recomendados: precios(recomendados), sugeridos: precios(sugeridos), ofertas: precios(ofertas),
    });
  } catch (err) {
    console.error("customer-app/store:", err);
    return NextResponse.json({ ok: false, error: "No se pudo cargar la tienda" }, { status: 500 });
  }
}
