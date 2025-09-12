"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  DollarSign,
  ShoppingBag,
  ShoppingCart,
  Store,
  BookOpen,
  GraduationCap,
  HelpCircle,
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();

  const whatsappNumber = "5215534532104";
  const whatsappMessage = encodeURIComponent(
    "Estoy en el programa de afiliados y tengo una duda"
  );
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  const navItems = [
    { href: "/ganancias", label: "Ganancias", icon: <DollarSign size={20} /> },
    { href: "/ordenes", label: "Órdenes", icon: <ShoppingBag size={20} /> },
    { href: "/mis-carritos", label: "Mis Carritos", icon: <ShoppingCart size={20} /> },
    { href: "/mi-tienda", label: "Mi Tienda", icon: <Store size={20} /> },
    { href: "/manual", label: "Manual", icon: <BookOpen size={20} /> },
    { href: "/academia-vitahub", label: "Academia Vitahub", icon: <GraduationCap size={20} /> },
  ];

  return (
    <aside className="bg-[#fafafa] border-r shadow-inner p-2 flex flex-col justify-between
                      w-16 sm:w-56 transition-all">
      {/* Nav links */}
      <nav className="flex flex-col gap-2 text-[#1b3f7a]">
        {navItems.map(({ href, label, icon }) => {
          const isActive = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-center sm:justify-start gap-2 px-2 py-2 rounded transition text-sm
                ${isActive ? "bg-[#1b3f7a] text-white" : "hover:bg-[#e6e6e6] text-[#1b3f7a]"}`}
            >
              {icon}
              <span className="hidden sm:inline">{label}</span>
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
          className="flex items-center justify-center sm:justify-start gap-2 px-2 py-2 rounded bg-[#228f34] text-white text-sm hover:bg-[#12571d]"
        >
          <HelpCircle size={20} />
          <span className="hidden sm:inline">Ayuda</span>
        </Link>
      </div>
    </aside>
  );
}
