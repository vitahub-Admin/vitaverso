import { NextResponse } from "next/server";
import { idDeSesion } from "@/lib/sesionWeb";

export default function proxy(req) {
  const { pathname } = req.nextUrl;

  const isAdminApi = pathname.startsWith("/api/admin");

  if (!pathname.startsWith("/admin") && !isAdminApi) {
    return NextResponse.next();
  }

  const customerId = idDeSesion(req.cookies);
  const ADMIN_IDS = process.env.ADMIN_IDS?.split(",") || [];
  const isAdmin =
    customerId && ADMIN_IDS.map((id) => id.trim()).includes(customerId.trim());

  if (!isAdmin) {
    if (isAdminApi) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/admin-sharecarts/:path*",
    "/admin-productos-pacientes",
    "/admin-upsell-app",
    "/admin-sharecarts",
    "/admin-datos-afiliados",
    "/api/admin/:path*",
    "/calendar"
  ],
};
