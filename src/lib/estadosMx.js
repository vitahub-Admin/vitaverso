/**
 * Los 32 estados, como se le ofrecen al paciente.
 *
 * Es una lista cerrada y no un campo de texto a propósito: Shopify decide las
 * tarifas de envío por zona, y la zona sale del estado. Con texto libre,
 * "CDMX", "DF" o un error de dedo quedan fuera de toda zona y el paciente ve
 * tarifas equivocadas o ninguna. Los nombres están verificados contra Shopify.
 *
 * Sin dependencias ni variables de entorno: la usan la página y el servidor.
 */

export const ESTADOS_MX = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Ciudad de México', 'Coahuila', 'Colima', 'Durango', 'Estado de México',
  'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacán', 'Morelos', 'Nayarit',
  'Nuevo León', 'Oaxaca', 'Puebla', 'Querétaro', 'Quintana Roo', 'San Luis Potosí',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatán', 'Zacatecas',
];

/**
 * El nombre con el que Shopify conoce a cada estado. Todos coinciden con el que
 * se muestra menos uno: Shopify llama "México" al Estado de México y no reconoce
 * "Estado de México" (se comprobó: devuelve cero tarifas).
 */
const DISTINTOS = { 'Estado de México': 'México' };
export const provinciaShopify = (estado) => DISTINTOS[estado] || estado;
