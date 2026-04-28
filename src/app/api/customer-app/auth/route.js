// POST /api/customer-app/auth
// Login para clientes regulares via Shopify Storefront API
import { NextResponse } from "next/server";
import { signCustomerToken } from "@/lib/customerAppAuth";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;

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
    const { email, password } = await req.json();

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

    // GID → numeric ID  (gid://shopify/Customer/1234567890 → 1234567890)
    const numericId = customer.id.split("/").pop();

    const jwtToken = signCustomerToken(numericId, customer.email);

    return NextResponse.json({
      ok: true,
      token: jwtToken,
      customer: {
        id: numericId,
        firstName: customer.firstName,
        lastName: customer.lastName,
        email: customer.email,
        phone: customer.phone,
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
