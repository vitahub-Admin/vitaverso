/**
 * Precios reales de Shopify por variante.
 *
 * El servidor nunca cobra el precio que manda el navegador: lo vuelve a pedir
 * acá. El catálogo de Supabase sirve para listar, pero para cobrar se usa el
 * precio vivo, que es el que el paciente ve en la tienda.
 */

const GQL_URL = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;

/**
 * Precio, foto y títulos de cada variante, en una sola consulta.
 * La foto no está en el catálogo de Supabase: vive en Shopify.
 */
export async function fetchVariantInfo(variantIds = []) {
  const ids = [...new Set(variantIds.map(Number).filter(Boolean))];
  if (!ids.length) return {};

  const aliases = ids.map((id, i) =>
    `v${i}: node(id: "gid://shopify/ProductVariant/${id}") { ... on ProductVariant {
       price title
       image { url }
       product { title featuredImage { url } }
     } }`
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

  const info = {};
  ids.forEach((id, i) => {
    const v = json.data?.[`v${i}`];
    if (!v) return;
    info[String(id)] = {
      price:         parseFloat(v.price),
      // La foto de la variante si la tiene; si no, la del producto
      image:         v.image?.url || v.product?.featuredImage?.url || null,
      title:         v.product?.title || null,
      variant_title: v.title === 'Default Title' ? null : v.title,
    };
  });
  return info;
}

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
