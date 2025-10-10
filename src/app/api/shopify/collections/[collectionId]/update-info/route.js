import { NextResponse } from "next/server";

export async function POST(req, { params }) {
  const { collectionId } = params; // <-- esto es lo correcto
  const id = collectionId

  try {
    const { title, body_html } = await req.json();

    // Validación básica
    if (!title && !body_html) {
      return NextResponse.json(
        { success: false, error: "No hay campos para actualizar." },
        { status: 400 }
      );
    }

    // Construimos el objeto con solo los campos enviados
    const updateData = { id };
    if (title) updateData.title = title;
    if (body_html) updateData.body_html = body_html;

    // Llamada a Shopify Admin API
    const response = await fetch(
      
      `https://${process.env.SHOPIFY_STORE}/admin/api/2024-04/custom_collections/${id}.json`,
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
        { success: false, error: data.errors || data },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      collection: data.custom_collection,
    });
  } catch (err) {
    console.error("Error actualizando colección:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
