// Link de pago de la app de clientes (POST /api/customer-app/checkout).
//
// - Sin productos con precio de app vigente: el carrito normal de vitahub.mx (como lo armaba
//   la app hasta la 1.1.2): siguen las promos por cantidad y puede cambiar cosas en la web.
// - Con alguno: pedido borrador de Shopify con los productos reales (stock, SKU, BaseLinker),
//   el precio de app aplicado como descuento por unidad en su línea, el cupón del cliente,
//   el cliente y su profesional (specialist_ref) para acreditar la venta. Se paga en su link.
//   Los borradores sin pagar se borran solos (limpiarBorradoresApp, desde /api/cron).
import { shopifyAdmin } from "@/lib/customerSupplements";
import { enriquecer } from "@/lib/customerStore";

const TIENDA = "https://vitahub.mx";
const TAG = "precio-app";
const BORRADOR_VIGENCIA_HORAS = 6;
const gidVariante = (id) => `gid://shopify/ProductVariant/${id}`;

// El mismo link que arma la app (lib/api.js cartUrl)
function carritoNormal(items, specialistRef, codigo) {
  const partes = items.map((i) => `${i.variantId}:${i.quantity}`);
  const attrs = ["attributes[origen]=app"];
  if (specialistRef) attrs.push(`attributes[specialist_ref]=${encodeURIComponent(specialistRef)}`);
  if (codigo) attrs.push(`discount=${encodeURIComponent(codigo)}`);
  return `${TIENDA}/cart/${partes.join(",")}?${attrs.join("&")}`;
}

async function crearBorrador({ lineas, user, specialistRef, codigo }) {
  const input = {
    lineItems: lineas,
    email: user.email ?? undefined,
    ...(user.shopify_customer_id ? { purchasingEntity: { customerId: `gid://shopify/Customer/${user.shopify_customer_id}` } } : {}),
    customAttributes: [
      { key: "origen", value: "app" },
      { key: "precio_app", value: "1" },
      ...(specialistRef ? [{ key: "specialist_ref", value: String(specialistRef) }] : []),
    ],
    ...(codigo ? { discountCodes: [codigo] } : {}),
    tags: ["app", TAG],
    note: "Pedido desde Mi Vitahub con precio exclusivo de app",
  };
  const data = await shopifyAdmin(
    `mutation borradorApp($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name invoiceUrl }
        userErrors { field message }
      }
    }`,
    { input }
  );
  return data?.draftOrderCreate;
}

/**
 * @param {{ items: {variantId, quantity}[], codigo?: string, user, specialistRef?: string, conPrecioApp: boolean }}
 * @returns {Promise<{ url: string, tipo: "borrador"|"carrito", borrador?: string }>}
 */
export async function linkDePago({ items, codigo = null, user, specialistRef = null, conPrecioApp }) {
  const limpios = [];
  const vistos = new Set();
  for (const i of items ?? []) {
    const id = String(i?.variantId ?? "");
    if (!/^\d+$/.test(id) || vistos.has(id)) continue;
    vistos.add(id);
    limpios.push({ variantId: id, quantity: Math.max(1, Math.min(10, Number(i.quantity) || 1)) });
  }
  if (!limpios.length) return null;
  const cupon = typeof codigo === "string" && /^[A-Za-z0-9_-]{3,40}$/.test(codigo.trim()) ? codigo.trim() : null;

  // Precio, stock y precio de app vivos (no se confía en lo que manda el teléfono)
  const vivos = await enriquecer(limpios.map((i) => i.variantId));
  const disponibles = limpios.filter((i) => vivos[i.variantId]?.available);
  if (!disponibles.length) return null;

  // Borrador solo si hay algo más barato que en la web (precio de app = web → carrito normal)
  const conDescuento = conPrecioApp
    ? disponibles.filter((i) => vivos[i.variantId].precioAppValor < vivos[i.variantId].price)
    : [];
  if (!conDescuento.length) {
    return { tipo: "carrito", url: carritoNormal(disponibles, specialistRef, cupon) };
  }

  const lineas = disponibles.map((i) => {
    const v = vivos[i.variantId];
    const linea = { variantId: gidVariante(i.variantId), quantity: i.quantity };
    if (conPrecioApp && v.precioAppValor && v.price > v.precioAppValor) {
      // FIXED_AMOUNT en una línea del borrador = por unidad (probado: 2 × $50 → $100 menos)
      linea.appliedDiscount = {
        title: "Precio exclusivo app",
        description: "Precio exclusivo app",
        valueType: "FIXED_AMOUNT",
        value: Math.round((v.price - v.precioAppValor) * 100) / 100,
      };
    }
    return linea;
  });

  let r = await crearBorrador({ lineas, user, specialistRef, codigo: cupon });
  // Si el cupón da problema, el pedido sale igual sin él (mejor eso que no poder pagar)
  if (cupon && (r?.userErrors?.length || !r?.draftOrder)) {
    console.error("[customerCheckout] borrador con cupón:", JSON.stringify(r?.userErrors));
    r = await crearBorrador({ lineas, user, specialistRef, codigo: null });
  }
  if (r?.userErrors?.length || !r?.draftOrder?.invoiceUrl) {
    console.error("[customerCheckout] borrador:", JSON.stringify(r?.userErrors));
    // Sin borrador, el carrito normal: paga al precio de la web, pero puede comprar
    return { tipo: "carrito", url: carritoNormal(disponibles, specialistRef, cupon) };
  }
  return { tipo: "borrador", url: r.draftOrder.invoiceUrl, borrador: r.draftOrder.name };
}

/** Borra los borradores de precio de app sin pagar con más de BORRADOR_VIGENCIA_HORAS. */
export async function limpiarBorradoresApp() {
  const antes = new Date(Date.now() - BORRADOR_VIGENCIA_HORAS * 3600 * 1000).toISOString();
  let borrados = 0;
  for (let vuelta = 0; vuelta < 5; vuelta++) {
    const data = await shopifyAdmin(
      `query viejos($q: String!) { draftOrders(first: 50, query: $q) { nodes { id } } }`,
      { q: `tag:${TAG} status:open created_at:<'${antes}'` }
    );
    const ids = (data?.draftOrders?.nodes ?? []).map((n) => n.id);
    if (!ids.length) break;
    for (const id of ids) {
      const d = await shopifyAdmin(
        `mutation borrar($input: DraftOrderDeleteInput!) { draftOrderDelete(input: $input) { deletedId userErrors { message } } }`,
        { input: { id } }
      );
      if (d?.draftOrderDelete?.deletedId) borrados++;
    }
    if (ids.length < 50) break;
  }
  return { borrados };
}
