import { NextResponse } from 'next/server';

const SHOPIFY_STORE    = process.env.SHOPIFY_STORE;
const SHOPIFY_SF_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;

export async function POST(req) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ ok: false, error: 'Email requerido' }, { status: 400 });

    const res = await fetch(`https://${SHOPIFY_STORE}/api/2024-07/graphql.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_SF_TOKEN,
      },
      body: JSON.stringify({
        query: `mutation customerRecover($email: String!) {
          customerRecover(email: $email) {
            customerUserErrors { code field message }
          }
        }`,
        variables: { email },
      }),
    });

    const data = await res.json();
    const errors = data.data?.customerRecover?.customerUserErrors;

    if (errors?.length > 0) {
      return NextResponse.json({ ok: false, error: errors[0].message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('❌ recover:', err);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
