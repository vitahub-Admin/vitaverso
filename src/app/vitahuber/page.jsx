import { createClient } from "@supabase/supabase-js";
import SharecartsClient from "./components/SharecartsClient";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function getData() {
  // 1. Carritos + órdenes en paralelo (incluye `items` para enriquecer productos)
  const [cartsResult, ordersResult] = await Promise.all([
    supabase
      .from("sharecarts")
      .select("id, token, name, phone, owner_id, created_at, extra, items")
      .order("created_at", { ascending: false })
      .limit(3000),
    supabase
      .from("orders")
      .select("order_id, order_name, share_cart, total, shopify_created_at")
      .not("share_cart", "is", null),
  ]);

  const carts  = cartsResult.data  || [];
  const orders = ordersResult.data || [];

  // 2. Mapa token → orden
  const orderMap = new Map();
  for (const o of orders) {
    if (o.share_cart) orderMap.set(o.share_cart, o);
  }

  // 3. IDs únicos de protocolos → nombres
  const protocolIds = [
    ...new Set(carts.map(c => c.extra?.protocol_id).filter(Boolean).map(String)),
  ];
  let protocolMap = {};
  if (protocolIds.length > 0) {
    const { data: protocols } = await supabase
      .from("protocols")
      .select("id, name")
      .in("id", protocolIds);
    protocolMap = Object.fromEntries(
      (protocols || []).map(p => [String(p.id), p.name || `Protocolo ${p.id}`])
    );
  }

  // 4. IDs únicos de owners → nombres de afiliados
  const ownerIds = [
    ...new Set(carts.map(c => c.owner_id).filter(Boolean).map(String)),
  ];
  let affiliateMap = {};
  if (ownerIds.length > 0) {
    const { data: affiliates } = await supabase
      .from("affiliates")
      .select("shopify_customer_id, first_name, last_name")
      .in("shopify_customer_id", ownerIds);
    affiliateMap = Object.fromEntries(
      (affiliates || []).map(a => [
        String(a.shopify_customer_id),
        `${a.first_name || ""} ${a.last_name || ""}`.trim() || null,
      ])
    );
  }

  // 5. Variant IDs sin products_detail → enriquecer desde product_catalog
  //    (carritos creados por checkout guardan items como [{ variant_id, quantity }])
  const cartsNeedingEnrichment = carts.filter(
    c => !c.extra?.products_detail?.length && c.items?.length > 0
  );
  const variantIds = [
    ...new Set(
      cartsNeedingEnrichment
        .flatMap(c => (c.items || []).map(i => i.variant_id ?? i.id).filter(Boolean))
        .map(Number)
    ),
  ];
  let catalogMap = {};
  if (variantIds.length > 0) {
    const { data: catalog } = await supabase
      .from("product_catalog")
      .select("variant_id, title, variant_title")
      .in("variant_id", variantIds);
    catalogMap = Object.fromEntries(
      (catalog || []).map(r => [r.variant_id, r])
    );
  }

  // 6. Enriquecer cada carrito
  return carts.map(cart => {
    const order      = orderMap.get(cart.token);
    const protocolId = cart.extra?.protocol_id ? String(cart.extra.protocol_id) : null;

    // products_detail: usar el guardado en extra, o construirlo desde items + catalog
    const products_detail =
      cart.extra?.products_detail?.length
        ? cart.extra.products_detail
        : (cart.items || []).map(item => {
            const vid = Number(item.variant_id ?? item.id ?? 0);
            const cat = catalogMap[vid] || {};
            return {
              product_title: cat.title         || `Variante ${vid}`,
              variant_title: cat.variant_title || item.variant_title || null,
              quantity:      item.quantity     || 1,
            };
          });

    return {
      id:            cart.id,
      token:         cart.token,
      name:          cart.name   || null,
      phone:         cart.phone  || null,
      owner_id:      String(cart.owner_id || ""),
      owner_name:    affiliateMap[String(cart.owner_id)] || null,
      created_at:    cart.created_at,
      origen:        cart.extra?.origen        || null,
      protocol_id:   protocolId,
      protocol_name: protocolId
                       ? (protocolMap[protocolId] || cart.extra?.protocol_name || null)
                       : null,
      products_detail,
      converted:     !!order,
      order_id:      order?.order_id   || null,
      order_name:    order?.order_name || null,
      order_total:   order?.total      ? Number(order.total) : null,
      order_date:    order?.shopify_created_at || null,
    };
  });
}

export default async function SharecartsPage() {
  const carts = await getData();
  return <SharecartsClient carts={carts} />;
}
