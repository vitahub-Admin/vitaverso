import { NextResponse } from "next/server";

export async function POST(req, { params }) {
  try {
    // ✅ CORREGIDO: Usar await para obtener los params
    const { collectionId } = await params;
    
    console.log("📦 Collection ID recibido en API:", collectionId);
    console.log("📦 Tipo de ID:", typeof collectionId);
    
    const body = await req.json();
    const { title, body_html } = body;
    
    console.log("📦 Datos recibidos:", { title, body_html });

    // Validación básica
    if (!title && !body_html) {
      return NextResponse.json(
        { success: false, error: "No hay campos para actualizar." },
        { status: 400 }
      );
    }

    // Construimos el objeto
    const updateData = { id: collectionId };
    if (title) updateData.title = title;
    if (body_html) updateData.body_html = body_html;

    console.log("📦 Datos a enviar a Shopify:", updateData);

    // Llamada a Shopify Admin API
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
    console.log("📦 Respuesta de Shopify - Status:", response.status);
    console.log("📦 Respuesta de Shopify - Data:", data);

    if (!response.ok) {
      return NextResponse.json(
        { 
          success: false, 
          error: data.errors || "Error desconocido de Shopify",
          details: data 
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      collection: data.custom_collection,
    });
  } catch (err) {
    console.error("❌ Error actualizando colección:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}