import { NextResponse } from "next/server";

export async function POST(req, { params }) {
  try {
    const { collectionId } = params;

    const body = await req.json();
    const { title, body_html, social_media_url } = body;

    if (!title && !body_html && !social_media_url) {
      return NextResponse.json(
        { success: false, error: "No hay campos para actualizar." },
        { status: 400 }
      );
    }

    /* ---------------- Update colección ---------------- */
    if (title || body_html) {
      const updateData = { id: collectionId };
      if (title) updateData.title = title;
      if (body_html) updateData.body_html = body_html;

      const response = await fetch(
        `https://${process.env.SHOPIFY_STORE}/admin/api/2024-04/custom_collections/${collectionId}.json`,
        {
          method: "PUT",
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ custom_collection: updateData }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        return NextResponse.json(
          { success: false, error: data.errors || "Error Shopify" },
          { status: 400 }
        );
      }
    }

    /* ---------------- Metafield social_url ---------------- */
    if (social_media_url !== undefined) {
      const metafieldPayload = {
        metafield: {
          namespace: "custom",
          key: "social_url",
          type: "url",
          value: social_media_url || "",
          owner_resource: "custom_collection",
          owner_id: collectionId,
        },
      };

      await fetch(
        `https://${process.env.SHOPIFY_STORE}/admin/api/2024-04/metafields.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(metafieldPayload),
        }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("❌ Error actualizando colección:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
