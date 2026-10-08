/**
 * Tarifas de envío, tal como las tiene configuradas Shopify.
 *
 * Las zonas y los precios viven en Shopify (envío estándar en CDMX, envío nacional,
 * DHL Express…) y cambian ahí sin tocar código. Acá solo se le pregunta qué
 * tarifas aplican para una dirección.
 *
 * Se le pregunta (Storefront API, carrito con la dirección) con el pedido COMPLETO,
 * también lo que se entrega en el consultorio: el envío gratis (a partir de $599) se
 * mide sobre todo el carrito, y un pedido que lo supera va gratis aunque lo que viaje
 * sea poco. Las tarifas son fijas por zona, no por peso, así que no hay otro efecto.
 */

import { provinciaShopify } from './estadosMx.js';

// La Storefront API es la única que devuelve TODAS las tarifas, incluida la entrega
// local por código postal (Local Delivery), que la Admin API no calcula.
const SF = () => `https://${process.env.SHOPIFY_STORE}/api/2025-01/graphql.json`;

const CARRITO = `mutation($input: CartInput!) {
  cartCreate(input: $input) {
    cart { deliveryGroups(first: 5) { nodes { deliveryOptions { handle title deliveryMethodType estimatedCost { amount } } } } }
    userErrors { message }
  }
}`;

/**
 * Los nombres de las tarifas vienen como se escribieron en Shopify, con erratas
 * ("Envió estándar CDMX", "Envio Nacional") y un emoji. Se limpian para mostrarlos;
 * el `handle` que identifica a la tarifa no se toca.
 */
export function limpiarTitulo(t) {
  return String(t || '')
    .replace(/[⚡️]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    // Sin \b: JavaScript no cuenta la "ó" como letra y el límite de palabra falla
    .replace(/^Envi[óo](?=\s|$)/i, 'Envío')
    .replace(/^Local Delivery$/i, 'Entrega local');
}

/**
 * @param {object} p
 * @param {Array}  p.lineas      [{ variantId, quantity }] el pedido completo
 * @param {object} p.direccion   { calle, colonia, cp, ciudad, estado }
 * @returns {Array<{ handle: string, titulo: string, precio: number, expres: boolean, local: boolean }>}
 *          más barata primero. Vacío si no hay nada que enviar.
 */
export async function tarifasDeEnvio({ lineas = [], direccion = {} }) {
  const aEnviar = lineas.filter(l => Number(l.quantity) > 0);
  if (!aEnviar.length) return [];

  const res = await fetch(SF(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Storefront-Access-Token': process.env.SHOPIFY_STOREFRONT_TOKEN },
    body: JSON.stringify({
      query: CARRITO,
      variables: {
        input: {
          lines: aEnviar.map(l => ({ merchandiseId: `gid://shopify/ProductVariant/${l.variantId}`, quantity: Number(l.quantity) })),
          buyerIdentity: {
            countryCode: 'MX',
            deliveryAddressPreferences: [{
              deliveryAddress: {
                address1: direccion.calle || 'Calle',
                address2: direccion.colonia || undefined,
                city:     direccion.ciudad || 'Ciudad',
                province: provinciaShopify(direccion.estado),
                zip:      direccion.cp,
                country:  'Mexico',
              },
            }],
          },
        },
      },
    }),
  });

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join(' | '));
  const calc = json.data?.cartCreate;
  if (calc?.userErrors?.length) throw new Error(calc.userErrors.map(e => e.message).join(' | '));

  const opciones = (calc?.cart?.deliveryGroups?.nodes || []).flatMap(g => g.deliveryOptions || []);
  return opciones
    .map(t => ({
      handle: t.handle,
      titulo: limpiarTitulo(t.title),
      precio: Number(t.estimatedCost.amount),
      expres: /dhl|express/i.test(t.title),
      local: t.deliveryMethodType === 'LOCAL',
    }))
    .sort((a, b) => a.precio - b.precio);
}
