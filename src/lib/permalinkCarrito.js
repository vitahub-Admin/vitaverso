/**
 * Carritos por permalink de Shopify.
 *
 *   https://vitahub.mx/cart/<variante>:<cantidad>,<variante>:<cantidad>?attributes[...]
 *
 * Reemplaza al carrito creado con la Storefront API. La diferencia que importa:
 * el carrito de la Storefront API existe como objeto en Shopify y caduca —
 * medimos que el 25% de los protocolos se compra pasados 10 días, y hasta 468
 * días después—, mientras que el permalink arma el carrito de cero cada vez
 * que se abre. Además no depende de ninguna llamada: si Shopify no responde,
 * el profesional igual puede mandar su protocolo.
 *
 * Los atributos (specialist_ref, share_cart) viajan igual y llegan al
 * note_attributes de la orden, que es de donde sale la atribución.
 */

// Dominio público de la tienda. No es el .myshopify.com: el paciente tiene que
// ver vitahub.mx en el link que le manda su especialista.
const TIENDA = 'https://vitahub.mx';

const GQL_URL = `https://${process.env.SHOPIFY_STORE}/admin/api/2025-01/graphql.json`;

export function construirPermalink({ items, attributes = {}, tienda = TIENDA }) {
  const lineas = (items || [])
    .filter(i => i?.variant_id)
    .map(i => `${i.variant_id}:${Math.max(1, Number(i.quantity) || 1)}`)
    .join(',');

  if (!lineas) return null;

  const query = Object.entries(attributes)
    .filter(([, v]) => v != null && String(v) !== '')
    .map(([k, v]) => `attributes%5B${encodeURIComponent(k)}%5D=${encodeURIComponent(v)}`)
    .join('&');

  return `${tienda}/cart/${lineas}${query ? `?${query}` : ''}`;
}

/**
 * Revisa que las variantes se puedan comprar.
 *
 * Hace falta porque el permalink no avisa nada: una variante agotada la
 * descarta en silencio —el paciente llega al checkout con menos productos de
 * los que le recetaron— y una que no existe rompe el carrito entero, dejándolo
 * en cero. Antes esta validación la hacía de rebote la Storefront API.
 *
 * @returns {{ vendibles: number[], problemas: {variant_id, title, motivo}[] }}
 */
export async function validarVariantes(variantIds = []) {
  const ids = [...new Set(variantIds.map(Number).filter(Boolean))];
  if (!ids.length) return { vendibles: [], problemas: [] };

  const aliases = ids.map((id, i) =>
    `v${i}: node(id: "gid://shopify/ProductVariant/${id}") {
       ... on ProductVariant {
         title availableForSale inventoryQuantity
         product { title status }
       }
     }`
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
  if (json.errors) throw new Error(`Shopify: ${JSON.stringify(json.errors).slice(0, 200)}`);

  const vendibles = [];
  const problemas = [];

  ids.forEach((id, i) => {
    const v = json.data?.[`v${i}`];
    if (!v) {
      problemas.push({ variant_id: id, title: null, motivo: 'ya no existe en la tienda' });
      return;
    }
    const nombre = v.product?.title || null;
    if (v.product?.status !== 'ACTIVE') {
      problemas.push({ variant_id: id, title: nombre, motivo: 'no está publicado' });
      return;
    }
    if (!v.availableForSale) {
      problemas.push({ variant_id: id, title: nombre, motivo: 'sin stock' });
      return;
    }
    vendibles.push(id);
  });

  return { vendibles, problemas };
}
