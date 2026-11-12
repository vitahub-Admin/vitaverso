// Foto del profesional en la agenda: la imagen ACTUAL de su colección de Shopify.
//
// Al activar la agenda se copiaba la URL de esa imagen a booking_affiliates.photo_url y se quedaba
// ahí: si luego cambiaban o borraban la imagen en Shopify, la agenda mostraba una imagen rota
// (pasó con 2 de 13). Ahora se lee la vigente y, si cambió, se corrige la copia guardada.
// Si Shopify no responde se usa la guardada, para no dejar la página sin foto por una falla pasajera.
import { createClient } from "@supabase/supabase-js";
import { shopifyAdmin } from "@/lib/customerSupplements";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

const TTL_MS = 10 * 60 * 1000;
const cache = new Map(); // collectionId -> { url, t }

async function imagenDeColeccion(collectionId) {
  const hit = cache.get(collectionId);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.url;
  const data = await shopifyAdmin(
    `query($id: ID!) { collection(id: $id) { image { url } } }`,
    { id: `gid://shopify/Collection/${collectionId}` }
  );
  const url = data?.collection?.image?.url || null;
  cache.set(collectionId, { url, t: Date.now() });
  return url;
}

/**
 * @param {{ id, shopify_customer_id, photo_url }} fila  fila de booking_affiliates
 * @returns {Promise<string|null>} URL de la foto vigente (o la guardada si no se pudo consultar)
 */
export async function fotoVigente(fila) {
  const guardada = fila?.photo_url || null;
  try {
    if (!fila?.shopify_customer_id) return guardada;
    const { data: cuenta } = await supabase
      .from("affiliates")
      .select("shopify_collection_id")
      .eq("shopify_customer_id", Number(fila.shopify_customer_id))
      .maybeSingle();
    if (!cuenta?.shopify_collection_id) return guardada;

    const vigente = await imagenDeColeccion(cuenta.shopify_collection_id);
    if (vigente !== guardada && fila.id) {
      // La copia se había quedado vieja: se corrige para la próxima vez
      await supabase.from("booking_affiliates").update({ photo_url: vigente }).eq("id", fila.id);
    }
    return vigente;
  } catch (err) {
    console.error("[bookingFoto] no se pudo leer la imagen de la colección:", err?.message);
    return guardada;
  }
}
