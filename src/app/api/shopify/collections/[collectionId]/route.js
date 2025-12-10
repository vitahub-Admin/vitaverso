// pages/api/get-collection-products.js
import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function GET(req, { params }) {
  const { collectionId } = await params;

  const query = `
    {
      collection(id: "gid://shopify/Collection/${collectionId}") {
        id
        title
        handle
        descriptionHtml
        image { src }
        products(first: 150) {
          edges {
            node {
              id
              title
              handle
              images(first: 1) { edges { node { src } } }
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    metafield(namespace: "custom", key: "comision_afiliado") {
                      value
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(`https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const data = await res.json();
    const collection = data.data.collection;
    const products = collection.products.edges.map(e => e.node);

    return NextResponse.json({ success: true, collection, products });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
