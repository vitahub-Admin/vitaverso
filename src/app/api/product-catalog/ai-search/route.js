/**
 * POST /api/product-catalog/ai-search
 * Búsqueda semántica propulsada por Claude Haiku.
 *
 * Body: { query: string }
 *
 * Flujo:
 *  1. Claude interpreta la query (síntoma, objetivo, descripción libre)
 *     y devuelve lista de ingredientes/componentes relevantes
 *  2. Se busca en Supabase product_catalog por esos ingredientes
 *  3. Se ordena: productos profesionales primero, luego por comisión
 *  4. Se enriquece con stock/precio desde la colección del afiliado (si hay cookie)
 */

import { NextResponse } from "next/server";
import Anthropic        from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const GQL_URL   = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;
const GQL_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

async function shopifyGql(query, variables = {}) {
  const res = await fetch(GQL_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": GQL_TOKEN },
    body:    JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join(" | "));
  return json.data;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const supabase  = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// ── Prompt del agente ─────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres un asistente de soporte clínico para nutricionistas profesionales.
Tu rol es interpretar descripciones de objetivos de salud, síntomas o perfiles de pacientes
y traducirlos a ingredientes/nutraceuticos específicos disponibles en suplementación.

Reglas:
- Solo suplementos y nutraceuticos. Nunca medicamentos con receta.
- Devuelve ÚNICAMENTE JSON válido, sin texto adicional.
- Máximo 8 ingredientes, ordenados de mayor a menor relevancia clínica.
- Incluye el nombre del ingrediente en español y en inglés (para búsqueda).
- Justificación brevísima (≤10 palabras) por ingrediente.

Formato de respuesta:
{
  "ingredientes": [
    { "nombre": "Selenio", "en": "Selenium", "razon": "Conversión T4→T3, función tiroidea" },
    { "nombre": "Zinc", "en": "Zinc", "razon": "Caída de cabello, inmunidad" }
  ],
  "resumen": "Una oración describiendo el enfoque nutricional sugerido."
}`;

export async function POST(req) {
  try {
    const { query } = await req.json();
    if (!query?.trim()) {
      return NextResponse.json({ ok: false, error: "Query vacía" }, { status: 400 });
    }

    // 1. Claude interpreta la query
    const msg = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 512,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: "user", content: query.trim() }],
    });

    let parsed;
    try {
      const text = msg.content[0]?.text ?? "";
      // Extraer JSON aunque Claude agregue algún texto extra
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch?.[0] ?? text);
    } catch {
      return NextResponse.json({ ok: false, error: "Claude no devolvió JSON válido" }, { status: 500 });
    }

    const ingredientes = parsed.ingredientes ?? [];
    if (!ingredientes.length) {
      return NextResponse.json({ ok: true, items: [], resumen: parsed.resumen, ingredientes: [] });
    }

    // 2. Buscar en Supabase por cada ingrediente (componente o título)
    //    Construimos condiciones OR para cada ingrediente (es + en)
    // Sanitizar términos: extraer palabras simples (sin paréntesis, comas, etc.)
    // "Probióticos (Lactobacillus, Bifidobacterium)" → ["Probióticos", "Lactobacillus", "Bifidobacterium"]
    const sanitizeTerms = (str) =>
      str.replace(/[()[\]{}]/g, " ")   // quitar paréntesis
         .split(/[,/|]/)               // separar por coma, slash, pipe
         .map(s => s.trim())
         .filter(s => s.length > 2);  // descartar muy cortos

    const terminos = [...new Set(
      ingredientes.flatMap(i => [i.nombre, i.en].filter(Boolean).flatMap(sanitizeTerms))
    )];

    // Construir OR para Supabase — cada término como condición separada
    const orConditions = terminos
      .map(t => `componente.ilike.%${t}%,title.ilike.%${t}%`)
      .join(",");

    // Más rows porque hay una por variante y deduplicamos por product_id
    const { data: rows, error: dbError } = await supabase
      .from("product_catalog")
      .select("product_id, title, brand, componente, primary_ingredient, is_professional, price")
      .or(orConditions)
      .order("is_professional", { ascending: false })
      .limit(200);

    if (dbError) throw new Error(dbError.message);

    // 3. Deduplicar por product_id (hay una fila por variante)
    //    Ranking: pro + match en primary_ingredient > pro + componente > el resto
    const seen = new Set();
    const tier1 = []; // pro + primary_ingredient match
    const tier2 = []; // pro + componente/title match
    const tier3 = []; // no pro

    for (const row of rows ?? []) {
      const id = String(row.product_id);
      if (seen.has(id)) continue;
      seen.add(id);

      const match = ingredientes.find(i =>
        [i.nombre, i.en].some(t => t &&
          row.primary_ingredient?.toLowerCase().includes(t.toLowerCase()) ||
          row.componente?.toLowerCase().includes(t.toLowerCase()) ||
          row.title?.toLowerCase().includes(t.toLowerCase())
        )
      );

      const item = {
        product_id:       id,
        title:            row.title,
        brand:            row.brand,
        is_professional:  !!row.is_professional,
        image_url:        null,
        min_price:        row.price ?? null,
        commission_percent: 0,
        all_out_of_stock: false,
        variants:         [],
        ai_match:         match ? { nombre: match.nombre, razon: match.razon } : null,
      };

      const isPro = row.is_professional;
      const inPrimary = match && [match.nombre, match.en].some(t => t &&
        row.primary_ingredient?.toLowerCase().includes(t.toLowerCase())
      );

      if (isPro && inPrimary) tier1.push(item);
      else if (isPro)         tier2.push(item);
      else                    tier3.push(item);
    }

    const ranked = [...tier1, ...tier2, ...tier3];

    // 4. Enriquecer con imagen + variantes desde Shopify (batch por IDs)
    //    Shopify nodes() acepta hasta 250 GIDs en una query
    const gids = ranked.map(i => `gid://shopify/Product/${i.product_id}`);
    let shopifyMap = {}; // product_id → { image_url, variants, min_price }

    try {
      const chunks = [];
      for (let i = 0; i < gids.length; i += 100) chunks.push(gids.slice(i, i + 100));

      for (const chunk of chunks) {
        const data = await shopifyGql(`
          query($ids: [ID!]!) {
            nodes(ids: $ids) {
              ... on Product {
                id
                vendor
                featuredImage { url }
                variants(first: 15) {
                  edges { node {
                    id title price sku
                    inventoryQuantity inventoryPolicy
                  }}
                }
              }
            }
          }
        `, { ids: chunk });

        for (const node of data?.nodes ?? []) {
          if (!node?.id) continue;
          const pid = node.id.replace("gid://shopify/Product/", "");
          const variantEdges = node.variants?.edges ?? [];
          const variants = variantEdges.map(({ node: v }) => ({
            variant_id:    Number(v.id.replace("gid://shopify/ProductVariant/", "")),
            variant_title: v.title === "Default Title" ? null : v.title,
            price:         parseFloat(v.price || 0),
            sku:           v.sku || null,
            stock:         v.inventoryPolicy === "CONTINUE" ? null : v.inventoryQuantity,
          }));
          const prices = variants.map(v => v.price).filter(Boolean);
          shopifyMap[pid] = {
            image_url: node.featuredImage?.url ?? null,
            brand:     node.vendor || null,
            variants,
            min_price: prices.length ? Math.min(...prices) : null,
          };
        }
      }
    } catch (e) {
      console.warn("[ai-search] Shopify enrich error:", e.message);
    }

    // Fusionar datos de Shopify con los items rankeados
    const enriched = ranked.map(item => {
      const sh = shopifyMap[item.product_id];
      return {
        ...item,
        image_url:        sh?.image_url  ?? null,
        brand:            sh?.brand      ?? item.brand,
        min_price:        sh?.min_price  ?? item.min_price,
        variants:         sh?.variants   ?? [],
        all_out_of_stock: sh?.variants?.length
          ? sh.variants.every(v => v.stock !== null && v.stock <= 0)
          : false,
      };
    });

    // Comisiones desde product_variant_commissions (igual que la ruta normal)
    const allVariantIds = enriched.flatMap(p => p.variants.map(v => v.variant_id));
    let commissionMap = {};
    if (allVariantIds.length) {
      try {
        const { data: commData } = await supabase
          .from("product_variant_commissions")
          .select("variant_id, commission_percent")
          .in("variant_id", allVariantIds)
          .eq("active", true);
        for (const c of commData || []) commissionMap[c.variant_id] = Number(c.commission_percent);
      } catch {}
    }

    const items = enriched.map(item => {
      const maxComm = item.variants.length
        ? Math.max(0, ...item.variants.map(v => commissionMap[v.variant_id] ?? 0))
        : 0;
      return { ...item, commission_percent: maxComm };
    });

    return NextResponse.json({
      ok:          true,
      items,
      resumen:     parsed.resumen ?? "",
      ingredientes,
      total:       items.length,
    });

  } catch (err) {
    console.error("[ai-search]", err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
