// Auth helper para las rutas protegidas del booking dashboard.
// Reutiliza el mismo JWT que emite /api/pro/auth.
import { verifyCustomerToken } from "@/lib/customerAppAuth";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

/**
 * Verifica el JWT del afiliado y devuelve su registro en booking_affiliates.
 * Si no tiene perfil de booking aún, devuelve affiliate = null.
 *
 * @param {Request} req
 * @returns {{ payload, affiliate, error }}
 */
export async function resolveBookingAffiliate(req) {
  const payload = verifyCustomerToken(req);
  if (!payload) return { error: "Token inválido", status: 401 };

  const { data: affiliate } = await supabase
    .from("booking_affiliates")
    .select("*")
    .eq("shopify_customer_id", Number(payload.userId))
    .maybeSingle();

  return { payload, affiliate };
}
