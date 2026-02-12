import 'dotenv/config';

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

// 👇 CAMBIÁ ESTE ID por uno real
const PRODUCT_ID = "9618680250689"; 

async function testProduct(productId) {
  const query = `
    {
      product(id: "gid://shopify/Product/${productId}") {
        id
        title
        variants(first: 50) {
          edges {
            node {
              id
              title
              metafield(namespace: "custom", key: "comision_afiliado") {
                value
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2025-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    }
  );

  const json = await res.json();

  if (json.errors) {
    console.error("❌ GraphQL error:", json.errors);
    return;
  }

  const product = json.data.product;

  if (!product) {
    console.log("❌ Producto no encontrado");
    return;
  }

  console.log("🛍 Producto:", product.title);

  product.variants.edges.forEach(({ node }) => {
    const variantId = node.id.split("/").pop();
    const commissionRaw = node.metafield?.value ?? "0";
    const commission = Number(commissionRaw) || 0;

    console.log("------");
    console.log("Variant ID:", variantId);
    console.log("Title:", node.title);
    console.log("Commission RAW:", commissionRaw);
    console.log("Commission Parsed:", commission);
  });
}

testProduct(PRODUCT_ID).catch(console.error);
