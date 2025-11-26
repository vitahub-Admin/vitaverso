// app/api/verify-token/route.js
import { NextResponse } from "next/server";
import crypto from 'crypto';

export async function POST(req) {
  const { enc, t, sig } = await req.json();

  try {
    const secret = process.env.SHOPIFY_TOKEN_SECRET;
    const key1 = 7919;   // MISMO que en Shopify
    const key2 = 99991;  // MISMO que en Shopify

    // DESCIFRADO EXACTO
    const customerId = (parseInt(enc) - key2) / key1;
    
    console.log("🔐 Descifrado:", {
      encrypted: enc,
      decrypted: customerId,
      isValid: Number.isInteger(customerId)
    });

    // Verificar que sea entero válido
    if (!Number.isInteger(customerId) || customerId < 1) {
      return NextResponse.json({ 
        ok: false, 
        error: "Customer ID inválido después de descifrar" 
      }, { status: 401 });
    }

    // Verificar firma HMAC
    const message = `${customerId}|${t}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    // Verificar timestamp (5 minutos)
    const now = Math.floor(Date.now() / 1000);
    const isExpired = (now - parseInt(t)) > 36000;

    if (expectedSig !== sig) {
      return NextResponse.json({ 
        ok: false, 
        error: "Firma HMAC inválida" 
      }, { status: 401 });
    }

    if (isExpired) {
      return NextResponse.json({ 
        ok: false, 
        error: "Token expirado" 
      }, { status: 401 });
    }

    // ✅ TODO CORRECTO
    return NextResponse.json({ 
      ok: true, 
      customerId: customerId 
    });

  } catch (error) {
    console.error("❌ Error descifrando:", error);
    return NextResponse.json({ 
      ok: false, 
      error: "Error en el proceso de descifrado" 
    }, { status: 500 });
  }
}