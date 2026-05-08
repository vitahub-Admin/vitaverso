// POST /api/customer-app/auth
// Login para clientes regulares via Shopify Storefront API
import { NextResponse } from "next/server";
import { signCustomerToken } from "@/lib/customerAppAuth";
import { createClient } from "@supabase/supabase-js";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function storefrontRequest(query, variables = {}) {
  const res = await fetch(
    `https://${SHOPIFY_STORE}/api/2024-04/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
    }
  );
  return res.json();
}

export async function POST(req) {
  try {
    const { email, password, platform } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: "Email y contraseña requeridos" },
        { status: 400 }
      );
    }

    // 1. Crear token de acceso en Shopify
    const authData = await storefrontRequest(
      `mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
        customerAccessTokenCreate(input: $input) {
          customerAccessToken { accessToken expiresAt }
          customerUserErrors { code field message }
        }
      }`,
      { input: { email, password } }
    );

    const userErrors =
      authData?.data?.customerAccessTokenCreate?.customerUserErrors ?? [];
    if (userErrors.length > 0) {
      const msg =
        userErrors[0].code === "UNIDENTIFIED_CUSTOMER"
          ? "Email o contraseña incorrectos"
          : userErrors[0].message;
      return NextResponse.json({ ok: false, error: msg }, { status: 401 });
    }

    const shopifyToken =
      authData?.data?.customerAccessTokenCreate?.customerAccessToken
        ?.accessToken;
    if (!shopifyToken) {
      return NextResponse.json(
        { ok: false, error: "No se pudo autenticar" },
        { status: 401 }
      );
    }

    // 2. Obtener datos del customer con el token
    const customerData = await storefrontRequest(
      `query getCustomer($token: String!) {
        customer(customerAccessToken: $token) {
          id
          firstName
          lastName
          email
          phone
        }
      }`,
      { token: shopifyToken }
    );

    const customer = customerData?.data?.customer;
    if (!customer) {
      return NextResponse.json(
        { ok: false, error: "No se pudieron obtener los datos del cliente" },
        { status: 500 }
      );
    }

    const numericId = Number(customer.id.split("/").pop());

    // 3. Upsert en Supabase y obtener el id interno
    const { data: appUser } = await supabase
      .from("customer_app_users")
      .upsert(
        {
          shopify_customer_id: numericId,
          first_name: customer.firstName,
          last_name: customer.lastName,
          email: customer.email,
          phone: customer.phone ?? null,
          platform: platform ?? null,
          last_login_at: new Date().toISOString(),
        },
        { onConflict: "shopify_customer_id", ignoreDuplicates: false }
      )
      .select("id")
      .single();

    const userId = appUser?.id ?? numericId;
    const jwtToken = signCustomerToken(userId, customer.email, numericId);

    return NextResponse.json({
      ok: true,
      token: jwtToken,
      customer: {
        id: userId,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
        shopifyLinked: true,
      },
    });
  } catch (err) {
    console.error("customer-app/auth error:", err);
    return NextResponse.json(
      { ok: false, error: "Error del servidor" },
      { status: 500 }
    );
  }
}
