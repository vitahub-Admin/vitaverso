// POST /api/customer-app/link-shopify
// Linkea una cuenta de Shopify a la cuenta nativa de la app
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyCustomerToken, unauthorized, signCustomerToken } from "@/lib/customerAppAuth";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

export async function POST(req) {
  const payload = verifyCustomerToken(req);
  if (!payload) return unauthorized();

  const { userId, email } = payload;

  try {
    const { email: shopifyEmail, password } = await req.json();

    if (!shopifyEmail || !password) {
      return NextResponse.json(
        { ok: false, error: "Email y contraseña de Vitahub requeridos" },
        { status: 400 }
      );
    }

    // 1. Autenticar en Shopify Storefront
    const res = await fetch(
      `https://${SHOPIFY_STORE}/api/2024-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
        },
        body: JSON.stringify({
          query: `mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
            customerAccessTokenCreate(input: $input) {
              customerAccessToken { accessToken }
              customerUserErrors { code message }
            }
          }`,
          variables: { input: { email: shopifyEmail, password } },
        }),
      }
    );

    const authData = await res.json();
    const userErrors = authData?.data?.customerAccessTokenCreate?.customerUserErrors ?? [];

    if (userErrors.length > 0) {
      return NextResponse.json(
        { ok: false, error: "Credenciales de Vitahub incorrectas" },
        { status: 401 }
      );
    }

    const shopifyToken = authData?.data?.customerAccessTokenCreate?.customerAccessToken?.accessToken;
    if (!shopifyToken) {
      return NextResponse.json({ ok: false, error: "No se pudo verificar la cuenta de Vitahub" }, { status: 401 });
    }

    // 2. Obtener datos del customer de Shopify
    const customerRes = await fetch(
      `https://${SHOPIFY_STORE}/api/2024-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
        },
        body: JSON.stringify({
          query: `query { customer(customerAccessToken: "${shopifyToken}") { id firstName lastName email phone } }`,
        }),
      }
    );

    const customerData = await customerRes.json();
    const shopifyCustomer = customerData?.data?.customer;
    if (!shopifyCustomer) {
      return NextResponse.json({ ok: false, error: "No se pudieron obtener los datos de Vitahub" }, { status: 500 });
    }

    const shopifyCustomerId = Number(shopifyCustomer.id.split("/").pop());

    // 3. Verificar que ese shopify_customer_id no esté ya linkeado a otra cuenta
    const { data: existing } = await supabase
      .from("customer_app_users")
      .select("id")
      .eq("shopify_customer_id", shopifyCustomerId)
      .maybeSingle();

    if (existing && existing.id !== userId) {
      return NextResponse.json(
        { ok: false, error: "Esa cuenta de Vitahub ya está vinculada a otra cuenta de la app" },
        { status: 409 }
      );
    }

    // 4. Linkear: actualizar customer_app_users con los datos de Shopify
    await supabase
      .from("customer_app_users")
      .update({
        shopify_customer_id: shopifyCustomerId,
        first_name: shopifyCustomer.firstName,
        last_name: shopifyCustomer.lastName,
        phone: shopifyCustomer.phone ?? null,
      })
      .eq("id", userId);

    // 5. Emitir nuevo JWT con shopifyCustomerId incluido
    const newToken = signCustomerToken(userId, email, shopifyCustomerId);

    return NextResponse.json({
      ok: true,
      token: newToken,
      shopifyCustomerId,
      message: "Cuenta de Vitahub vinculada correctamente",
    });
  } catch (err) {
    console.error("customer-app/link-shopify error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
