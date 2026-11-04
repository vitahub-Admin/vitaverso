// POST   /api/customer-app/me/foto  { photoBase64, photoType? } → guarda la foto de perfil
// DELETE /api/customer-app/me/foto                              → la quita
// La foto vive en el bucket privado de fotos de la app (CUSTOM_BUCKET) en <userId>/perfil.jpg:
// una por usuario, se pisa al cambiarla y se borra con la cuenta (DELETE me borra la carpeta).
// GET me devuelve la URL firmada (fotoPerfilUrl).
import { NextResponse } from "next/server";
import { verifyAppCustomerToken, unauthorized } from "@/lib/customerAppAuth";
import { supabase, getAppUser, CUSTOM_BUCKET } from "@/lib/customerSupplements";

export const maxDuration = 30;

const MAX_FOTO_BYTES = 3 * 1024 * 1024;
// La misma ruta usa GET me para firmar la URL
const rutaFotoPerfil = (userId) => `${userId}/perfil.jpg`;

export async function POST(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();
  try {
    const user = await getAppUser(payload.userId);
    if (!user) return unauthorized();

    const body = await req.json();
    const tipo = ["image/jpeg", "image/png", "image/webp"].includes(body.photoType) ? body.photoType : "image/jpeg";
    const buf = Buffer.from(String(body.photoBase64 ?? "").replace(/^data:[^,]+,/, ""), "base64");
    if (!buf.length || buf.length > MAX_FOTO_BYTES) {
      return NextResponse.json({ ok: false, error: "La foto es muy pesada. Intenta con otra." }, { status: 400 });
    }

    const { error } = await supabase.storage
      .from(CUSTOM_BUCKET)
      .upload(rutaFotoPerfil(user.id), buf, { contentType: tipo, upsert: true });
    if (error) {
      console.error("me/foto upload:", error.message);
      return NextResponse.json({ ok: false, error: "No se pudo guardar la foto" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("customer-app/me/foto:", err);
    return NextResponse.json({ ok: false, error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const payload = verifyAppCustomerToken(req);
  if (!payload) return unauthorized();
  try {
    const user = await getAppUser(payload.userId);
    if (!user) return unauthorized();
    await supabase.storage.from(CUSTOM_BUCKET).remove([rutaFotoPerfil(user.id)]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("customer-app/me/foto delete:", err);
    return NextResponse.json({ ok: false, error: "No se pudo quitar la foto" }, { status: 500 });
  }
}
