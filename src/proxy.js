import { NextResponse } from "next/server";

export default function proxy(req) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const customerId = req.cookies.get("customerId")?.value;

  if (!customerId) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const ADMIN_IDS = process.env.ADMIN_IDS?.split(",") || [];

  if (!ADMIN_IDS.map(id => id.trim()).includes(customerId.trim())) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/admin-sharecarts/:path*",
    "/admin-sharecarts",
    "/admin-datos-afiliados"
  ],
};
