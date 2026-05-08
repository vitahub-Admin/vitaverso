// GET /api/customer-app/me
// Perfil del cliente + info del especialista vinculado via metafield "referido"
import { NextResponse } from "next/server";
import { verifyCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { createClient } from "@supabase/supabase-js";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function GET(req) {
  const payload = verifyCustomerToken(req);
  if (!payload) return unauthorized();

  const { userId, email, shopifyCustomerId } = payload;

  try {
    // 1. Datos base desde customer_app_users
    const { data: appUser } = await supabase
      .from("customer_app_users")
      .select("id, first_name, last_name, email, phone, shopify_customer_id")
      .eq("id", userId)
      .maybeSingle();

    let customer = {
      id: userId,
      firstName: appUser?.first_name ?? null,
      lastName: appUser?.last_name ?? null,
      email: appUser?.email ?? email,
      phone: appUser?.phone ?? null,
      shopifyLinked: !!shopifyCustomerId,
    };

    let specialist = null;

    // 2. Si tiene cuenta Shopify linkeada, enriquecemos con datos de Shopify
    if (shopifyCustomerId) {
      const gid = `gid://shopify/Customer/${shopifyCustomerId}`;
      const res = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2024-04/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
          },
          body: JSON.stringify({
            query: `query getCustomerMe($id: ID!) {
              customer(id: $id) {
                firstName lastName email phone
                referido: metafield(namespace: "custom", key: "referido") { value }
              }
            }`,
            variables: { id: gid },
          }),
        }
      );

      const data = await res.json();
      const shopifyCustomer = data?.data?.customer;

      if (shopifyCustomer) {
        customer = {
          ...customer,
          firstName: shopifyCustomer.firstName,
          lastName: shopifyCustomer.lastName,
          email: shopifyCustomer.email,
          phone: shopifyCustomer.phone,
        };

        const specialistRef = shopifyCustomer.referido?.value;
        if (specialistRef) {
          const specialistShopifyId = Number(specialistRef);

          // Persistir specialist_shopify_id en customer_app_users
          await supabase
            .from("customer_app_users")
            .update({ specialist_shopify_id: specialistShopifyId })
            .eq("id", userId);

          const { data: affiliateData } = await supabase
            .from("affiliates")
            .select("id, first_name, last_name, email, phone, profession, social_media")
            .eq("shopify_customer_id", specialistShopifyId)
            .maybeSingle();

          if (affiliateData) {
            specialist = {
              id: affiliateData.id,
              firstName: affiliateData.first_name,
              lastName: affiliateData.last_name,
              email: affiliateData.email,
              phone: affiliateData.phone,
              profession: affiliateData.profession,
              socialMedia: affiliateData.social_media,
            };
          }
        }
      }
    }

    return NextResponse.json({ ok: true, customer, specialist });
  } catch (err) {
    console.error("customer-app/me error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
