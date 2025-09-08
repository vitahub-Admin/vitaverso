"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const whatsappNumber = "5215534532104";
  const whatsappMessage = encodeURIComponent(
    "Estoy en el programa de afiliados y tengo una duda"
  );
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  const navItems = [
    { href: "/ganancias", label: "Ganancias" },
    { href: "/ordenes", label: "Órdenes" },
    { href: "/mis-carritos", label: "Mis Carritos" },
    { href: "/mi-tienda", label: "Mi Tienda" },
    { href: "/manual", label: "Manual" },
    { href: "/academia-vitahub", label: "Academia Vitahub" },
  ];

  return (
    <aside className="w-56 bg-[#fafafa] border-r shadow-inner p-4 flex flex-col justify-between">
      {/* Nav links */}
      <nav className="flex flex-col gap-2 text-[#1b3f7a]">
        {navItems.map(({ href, label }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`px-3 py-2 rounded transition ${
                isActive
                  ? "bg-[#1b3f7a] text-white"
                  : "hover:bg-[#e6e6e6] text-[#1b3f7a]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Ayuda (pegado abajo) */}
      <div className="mt-4">
        <Link
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="block px-3 py-2 rounded bg-[#228f34] text-white text-center hover:bg-[#12571d]"
        >
          Ayuda
        </Link>
      </div>
    </aside>
  );
}
