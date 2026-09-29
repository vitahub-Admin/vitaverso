/**
 * Precios reales de Shopify por variante.
 *
 * El servidor nunca cobra el precio que manda el navegador: lo vuelve a pedir
 * acá. El catálogo de Supabase sirve para listar, pero para cobrar se usa el
 * precio vivo, que es el que el paciente ve en la tienda.
 */

const GQL_URL = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;

export async function fetchVariantPrices(variantIds = []) {
  const ids = [...new Set(variantIds.map(Number).filter(Boolean))];
  if (!ids.length) return {};

  const aliases = ids.map((id, i) =>
    `v${i}: node(id: "gid://shopify/ProductVariant/${id}") { ... on ProductVariant { price } }`
  ).join('\n');

  const res = await fetch(GQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': process.env.SHOPIFY_ACCESS_TOKEN,
    },
    body: JSON.stringify({ query: `{ ${aliases} }` }),
  });

  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join(' | '));

  const precios = {};
  ids.forEach((id, i) => {
    const p = json.data?.[`v${i}`]?.price;
    if (p != null) precios[String(id)] = parseFloat(p);
  });
  return precios;
}
