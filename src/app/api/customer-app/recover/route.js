// POST /api/customer-app/recover
// Dispara email de recuperación de contraseña via Shopify Storefront API
import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;

export async function POST(req) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ ok: false, error: "Email requerido" }, { status: 400 });
    }

    const res = await fetch(
      `https://${SHOPIFY_STORE}/api/2024-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
        },
        body: JSON.stringify({
          query: `mutation customerRecover($email: String!) {
            customerRecover(email: $email) {
              customerUserErrors { code message }
            }
          }`,
          variables: { email: email.trim().toLowerCase() },
        }),
      }
    );

    const data = await res.json();
    const errors = data?.data?.customerRecover?.customerUserErrors ?? [];

    if (errors.length > 0) {
      return NextResponse.json({ ok: false, error: errors[0].message }, { status: 400 });
    }

    // Siempre respondemos ok aunque el email no exista (seguridad)
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("customer-app/recover error:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}
