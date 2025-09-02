// src/app/api/shopify/collections/[collectionId]/update/route.js
import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function POST(req, { params }) {
  try {
    const { collectionId } = await params;
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ 
        success: false, 
        error: "No se proporcionó ningún archivo" 
      }, { status: 400 });
    }

    console.log("📤 Iniciando upload para:", file.name, "tipo:", file.type, "tamaño:", file.size);

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64Image = buffer.toString('base64');

    // 1. PRIMERO: Usar stagedUploadsCreate (método correcto)
    try {
      console.log("🔄 Creando staged upload...");

      const stagedUploadMutation = `
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters {
                name
                value
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const stagedUploadVariables = {
        input: [{
          resource: "FILE",
          filename: file.name,
          mimeType: file.type,
          fileSize: file.size.toString()
        }]
      };

      const stagedResponse = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2024-07/graphql.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: stagedUploadMutation,
            variables: stagedUploadVariables
          }),
        }
      );

      const stagedData = await stagedResponse.json();
      console.log("📨 Staged upload response:", JSON.stringify(stagedData, null, 2));

      if (stagedData.errors || stagedData.data?.stagedUploadsCreate?.userErrors?.length > 0) {
        throw new Error(`Staged upload failed: ${JSON.stringify(stagedData.errors || stagedData.data.stagedUploadsCreate.userErrors)}`);
      }

      const stagedTargets = stagedData.data.stagedUploadsCreate.stagedTargets;
      if (!stagedTargets || stagedTargets.length === 0) {
        throw new Error("No staged targets returned");
      }

      const stagedTarget = stagedTargets[0];
      console.log("✅ Staged target obtenido");

      // 2. Subir el archivo al URL temporal
      const baseUrl = stagedTarget.url.split('?')[0];
      const urlParams = new URLSearchParams(stagedTarget.url.split('?')[1]);
      
      const uploadFormData = new FormData();
      
      // Agregar parámetros de la URL como campos del form
      for (const [name, value] of urlParams.entries()) {
        uploadFormData.append(name, value);
      }

      // Agregar parámetros adicionales
      stagedTarget.parameters.forEach(param => {
        uploadFormData.append(param.name, param.value);
      });

      // Agregar el archivo
      uploadFormData.append('file', new Blob([buffer], { type: file.type }), file.name);

      console.log("🔄 Subiendo archivo a URL temporal...");
      const uploadResponse = await fetch(baseUrl, {
        method: "POST",
        body: uploadFormData,
      });

      const uploadText = await uploadResponse.text();
      console.log("📨 Upload response status:", uploadResponse.status);

      if (!uploadResponse.ok) {
        console.error("❌ Upload error details:", uploadText);
        throw new Error(`Upload to staged URL failed: ${uploadResponse.status}`);
      }

      console.log("✅ Archivo subido a staged URL");

      // 3. Crear el archivo permanente usando fileCreate
      const fileCreateMutation = `
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              ... on File {
                id
                fileStatus
                alt
                fileErrors {
                  code
                  message
                }
              }
              ... on MediaImage {
                id
                image {
                  url
                  altText
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const fileCreateVariables = {
        files: [{
          alt: file.name.split('.')[0],
          contentType: "IMAGE",
          originalSource: stagedTarget.resourceUrl
        }]
      };

      console.log("🔄 Creando archivo permanente...");
      const fileCreateResponse = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2024-07/graphql.json`,
        {
          method: "POST",
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: fileCreateMutation,
            variables: fileCreateVariables
          }),
        }
      );

      const fileCreateData = await fileCreateResponse.json();
      console.log("📨 File create response:", JSON.stringify(fileCreateData, null, 2));

      if (fileCreateData.errors || fileCreateData.data?.fileCreate?.userErrors?.length > 0) {
        throw new Error(`File create failed: ${JSON.stringify(fileCreateData.errors || fileCreateData.data.fileCreate.userErrors)}`);
      }

      const createdFile = fileCreateData.data.fileCreate.files[0];
      if (!createdFile) {
        throw new Error("No file returned from fileCreate");
      }

      // Obtener la URL dependiendo del tipo de archivo
      let imageUrl;
      if (createdFile.image && createdFile.image.url) {
        imageUrl = createdFile.image.url; // MediaImage
      } else {
        throw new Error("No image URL found in response");
      }

      console.log("✅ Archivo creado. URL:", imageUrl);

      // 4. Actualizar la colección
      const updateResponse = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2024-07/custom_collections/${collectionId}.json`,
        {
          method: "PUT",
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            custom_collection: {
              id: collectionId,
              image: {
                src: imageUrl,
                alt: file.name.split('.')[0] || "Collection image"
              }
            }
          }),
        }
      );

      const updateData = await updateResponse.json();
      console.log("🔄 Update response status:", updateResponse.status);

      if (!updateResponse.ok) {
        throw new Error(`Collection update failed: ${JSON.stringify(updateData)}`);
      }

      return NextResponse.json({ 
        success: true, 
        collection: updateData.custom_collection,
        imageUrl: imageUrl,
        message: "Imagen subida y colección actualizada exitosamente"
      });

    } catch (stagedError) {
      console.error("❌ Staged upload falló:", stagedError.message);

      // FALLBACK: Método alternativo usando REST API para collections
      console.log("🔄 Intentando método alternativo...");

      try {
        // Intentar actualizar la colección directamente con base64
        const updateResponse = await fetch(
          `https://${SHOPIFY_STORE}/admin/api/2024-07/custom_collections/${collectionId}.json`,
          {
            method: "PUT",
            headers: {
              "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              custom_collection: {
                id: collectionId,
                image: {
                  attachment: base64Image,
                  filename: file.name,
                  alt: file.name.split('.')[0] || "Collection image"
                }
              }
            }),
          }
        );

        const updateData = await updateResponse.json();
        console.log("📨 Direct update response:", JSON.stringify(updateData, null, 2));

        if (!updateResponse.ok) {
          throw new Error(`Direct update failed: ${JSON.stringify(updateData)}`);
        }

        if (updateData.custom_collection && updateData.custom_collection.image) {
          return NextResponse.json({ 
            success: true, 
            collection: updateData.custom_collection,
            imageUrl: updateData.custom_collection.image.src,
            message: "Imagen subida directamente a la colección"
          });
        } else {
          throw new Error("No image in response");
        }

      } catch (directError) {
        console.error("❌ Método alternativo también falló:", directError.message);
        throw new Error(`Todos los métodos fallaron: ${directError.message}`);
      }
    }

  } catch (err) {
    console.error("❌ Error completo:", err);
    
    return NextResponse.json({ 
      success: false, 
      error: "Error al subir la imagen",
      details: err.message,
      diagnostic: {
        problem: "Problema con la API de Shopify",
        solution: "Verificar la documentación actualizada de la API",
        action: "Revisar https://shopify.dev/docs/api/admin-graphql"
      }
    }, { status: 500 });
  }
}