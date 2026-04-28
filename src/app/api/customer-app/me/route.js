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

  const { customerId } = payload;
  const gid = `gid://shopify/Customer/${customerId}`;

  try {
    // 1. Obtener customer + metafield "referido"
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
              id
              firstName
              lastName
              email
              phone
              referido: metafield(namespace: "custom", key: "referido") {
                value
              }
            }
          }`,
          variables: { id: gid },
        }),
      }
    );

    const data = await res.json();
    const customer = data?.data?.customer;

    if (!customer) {
      return NextResponse.json(
        { ok: false, error: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    const specialistRef = customer.referido?.value;

    // 2. Si tiene referido, buscar el afiliado en Supabase
    let specialist = null;
    if (specialistRef) {
      const { data: affiliateData } = await supabase
        .from("affiliates")
        .select("id, first_name, last_name, email, phone, profession, social_media")
        .eq("shopify_customer_id", Number(specialistRef))
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

    return NextResponse.json({
      ok: true,
      customer: {
        id: customerId,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
      },
      specialist,
    });

  } catch (err) {
    console.error("customer-app/me error:", err);
    return NextResponse.json(
      { ok: false, error: "Error del servidor" },
      { status: 500 }
    );
  }
}
