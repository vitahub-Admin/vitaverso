import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function buscarEnShopify(query) {
  const url = `https://${SHOPIFY_STORE}/admin/api/2024-01/products.json?limit=5&title=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.products || []).map((p) => ({
    id: String(p.id),
    title: p.title,
    description: p.body_html?.replace(/<[^>]+>/g, "").slice(0, 200) || "",
    tags: p.tags ? p.tags.split(", ") : [],
    image: p.images?.[0]?.src || null,
    variants: (p.variants || []).map((v) => ({
      id: String(v.id),
      title: v.title,
      price: v.price,
      available: v.inventory_quantity > 0,
    })),
  }));
}

export async function POST(req) {
  const { contexto } = await req.json();

  if (!contexto) {
    return NextResponse.json({ ok: false, error: "Missing contexto" }, { status: 400 });
  }

  // PASO 1: Claude genera las queries de búsqueda
  const paso1 = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Eres un asesor especializado en salud y nutrición natural.

Un afiliado describe la situación de su cliente:
"${contexto}"

Tu tarea: generá entre 2 y 4 búsquedas cortas (2-4 palabras cada una) para encontrar productos relevantes en un catálogo de suplementos y productos naturales. Cada búsqueda debe apuntar a un tipo de producto diferente que pueda ayudar.

Respondé SOLO con JSON válido, sin texto adicional:
{
  "busquedas": ["término 1", "término 2", "término 3"]
}`,
      },
    ],
  });

  let busquedas = [];
  try {
    const parsed = JSON.parse(paso1.content[0].text.trim());
    busquedas = parsed.busquedas || [];
  } catch {
    return NextResponse.json({ ok: false, error: "Error generando búsquedas", raw: paso1.content[0].text }, { status: 500 });
  }

  console.log("[interpretar] búsquedas generadas:", busquedas);

  // PASO 2: Ejecutar búsquedas en Shopify en paralelo
  const resultados = await Promise.all(
    busquedas.map(async (q) => ({ query: q, productos: await buscarEnShopify(q) }))
  );

  console.log("[interpretar] resultados por búsqueda:", resultados.map(r => `${r.query}: ${r.productos.length}`));

  // Aplanar todos los productos encontrados (sin duplicados)
  const vistos = new Set();
  const todosProductos = [];
  for (const { productos } of resultados) {
    for (const p of productos) {
      if (!vistos.has(p.id)) {
        vistos.add(p.id);
        todosProductos.push(p);
      }
    }
  }

  if (!todosProductos.length) {
    return NextResponse.json({
      ok: false,
      error: "No se encontraron productos en el catálogo para estas búsquedas.",
      busquedas,
    });
  }

  // PASO 3: Claude selecciona el mejor por búsqueda + opciones adicionales
  const listaProductos = todosProductos
    .map((p, i) =>
      `[${i}] ${p.title}
       Tags: ${p.tags?.join(", ") || "ninguno"}
       Descripción: ${p.description || "sin descripción"}
       Precio: $${p.variants?.[0]?.price || "?"} MXN`
    )
    .join("\n\n");

  const paso3 = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Eres un asesor especializado en salud y nutrición natural.

El afiliado describió la situación de su cliente:
"${contexto}"

Se buscaron estos términos: ${busquedas.join(", ")}

Productos encontrados en el catálogo:
${listaProductos}

Tu tarea:
1. Seleccioná los 2-3 productos PRINCIPALES más relevantes para el cliente
2. Si hay otros productos que podrían complementar (aunque no sean los principales), añadílos como "adicionales"
3. Para cada uno, explicá en UNA oración breve por qué lo recomendás

Respondé SOLO con JSON válido:
{
  "principales": [
    { "index": 0, "razon": "..." }
  ],
  "adicionales": [
    { "index": 2, "razon": "..." }
  ]
}`,
      },
    ],
  });

  try {
    const parsed = JSON.parse(paso3.content[0].text.trim());
    const principales = (parsed.principales || []).map(({ index, razon }) => ({
      ...todosProductos[index],
      razon,
    }));
    const adicionales = (parsed.adicionales || []).map(({ index, razon }) => ({
      ...todosProductos[index],
      razon,
    }));

    return NextResponse.json({ ok: true, busquedas, principales, adicionales });
  } catch {
    return NextResponse.json({ ok: false, error: "Error al parsear selección", raw: paso3.content[0].text }, { status: 500 });
  }
}
