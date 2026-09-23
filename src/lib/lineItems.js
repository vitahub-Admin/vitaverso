/**
 * Reglas compartidas para las líneas de una orden de Shopify.
 *
 * Antes cada endpoint descartaba las propinas buscando "tip" dentro del título,
 * y eso dejaba fuera productos reales como "Colágeno Tipo I" o "Magnesio 4 tipos".
 * La propina y las líneas de referencia (bundles, turnos) no son productos del
 * catálogo: llegan sin product_id, y por eso nunca tienen comisión asociada.
 */

/** ¿La línea corresponde a un producto del catálogo, con comisión posible? */
export function esLineaDeProducto(item) {
  return Boolean(item && item.product_id);
}

/** Solo las líneas que cuentan para subtotales y comisiones */
export function lineasDeProducto(lineItems) {
  return (lineItems || []).filter(esLineaDeProducto);
}
