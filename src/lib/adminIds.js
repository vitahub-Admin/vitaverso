/**
 * Administradores de Vitahub PRO, por ID de cliente de Shopify.
 * La lista vive en la variable de entorno ADMIN_IDS, la misma que usa el proxy.
 */
export function esAdmin(customerId) {
  const ids = (process.env.ADMIN_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return Boolean(customerId) && ids.includes(String(customerId))
}
