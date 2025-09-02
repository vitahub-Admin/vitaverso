// src/app/api/shopify/debug-auth/route.js
import { NextResponse } from "next/server";

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

export async function GET() {
  try {
    console.log("Store:", SHOPIFY_STORE);
    console.log("Token exists:", !!SHOPIFY_ACCESS_TOKEN);
    console.log("Token starts with:", SHOPIFY_ACCESS_TOKEN?.substring(0, 10) + "...");

    // 1. Verificar scopes del token
    const scopesResponse = await fetch(
      `https://${SHOPIFY_STORE}/admin/oauth/access_scopes.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        },
      }
    );

    console.log("Scopes status:", scopesResponse.status);
    const scopesText = await scopesResponse.text();
    console.log("Scopes response:", scopesText);

    let scopesData;
    try {
      scopesData = JSON.parse(scopesText);
    } catch (e) {
      return NextResponse.json({
        success: false,
        error: "Cannot parse scopes response",
        rawResponse: scopesText,
        status: scopesResponse.status
      });
    }

    // 2. Verificar permisos de files específicamente
    const hasWriteFiles = scopesData.access_scopes?.some(scope => 
      scope.handle === 'write_files' || scope.handle === 'write_files,read_files'
    );

    const hasReadFiles = scopesData.access_scopes?.some(scope => 
      scope.handle === 'read_files' || scope.handle === 'write_files,read_files'
    );

    // 3. Intentar una operación SIMPLE de files
    const testFilesResponse = await fetch(
      `https://${SHOPIFY_STORE}/admin/api/2025-07/files.json?limit=1`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        },
      }
    );

    console.log("Files test status:", testFilesResponse.status);
    const filesText = await testFilesResponse.text();
    console.log("Files test response:", filesText);

    return NextResponse.json({
      success: true,
      store: SHOPIFY_STORE,
      tokenPreview: SHOPIFY_ACCESS_TOKEN?.substring(0, 10) + "...",
      scopes: scopesData.access_scopes,
      hasWriteFiles,
      hasReadFiles,
      filesTest: {
        status: testFilesResponse.status,
        response: filesText.substring(0, 200) + "..."
      }
    });

  } catch (err) {
    console.error("Debug error:", err);
    return NextResponse.json({
      success: false,
      error: err.message
    });
  }
}