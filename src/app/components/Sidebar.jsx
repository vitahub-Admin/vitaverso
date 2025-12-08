"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DollarSign,
  ShoppingBag,
  ShoppingCart,
  Store,
  BookOpen,
  GraduationCap,
  HelpCircle,
  Newspaper,
  Contact,
  UserPlus,
  Settings,
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const [novedadesPendientes, setNovedadesPendientes] = useState(0);
  const [isVitahuber, setIsVitahuber] = useState(false);

  // 🔵 Check de novedades
  useEffect(() => {
    async function checkNovedades() {
      try {
        const res = await fetch("/api/sheet/news");
        const data = await res.json();

        if (!data.noticias) return;

        const ultimoId = data.noticias[data.noticias.length - 1]?.id || 0;
        const lastSeenId = parseInt(localStorage.getItem("lastSeenId") || "0", 10);

        if (pathname === "/notificaciones") {
          localStorage.setItem("lastSeenId", ultimoId);
          setNovedadesPendientes(0);
        } else {
          const nuevas = data.noticias.filter((n) => n.id > lastSeenId).length;
          setNovedadesPendientes(nuevas);
        }
      } catch (err) {
        console.error("Error revisando novedades:", err);
      }
    }

    checkNovedades();
  }, [pathname]);

  // 🔵 Check de tags del usuario
  useEffect(() => {
    async function fetchCustomer() {
      try {
        const res = await fetch("/api/shopify/customer/me");
        const data = await res.json();

        const tags = data.customer?.tags
        ?.split(",")
        .map(t => t.trim().toLowerCase());
      
      if (tags?.includes("vitahuber")) {
        setIsVitahuber(true);
      }
      } catch (err) {
        console.error("Error leyendo customer:", err);
      }
    }

    fetchCustomer();
  }, []);

  const whatsappNumber = "5215548592403";
  const whatsappMessage = encodeURIComponent(
    "Estoy en el programa de afiliados y tengo una duda"
  );
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  // 🔵 Definimos menú
  const navItems = [
    { href: "/ganancias", label: "Ganancias", icon: <DollarSign size={20} /> },
    { href: "/ordenes", label: "Órdenes", icon: <ShoppingBag size={20} /> },
    { href: "/mis-carritos", label: "Mis Carritos", icon: <ShoppingCart size={20} /> },
    { href: "/contactos", label: "Mis Contactos", icon: <Contact size={20} /> },
    { href: "/mi-tienda", label: "Mi Tienda", icon: <Store size={20} /> },
    { href: "/manual", label: "Manual", icon: <BookOpen size={20} /> },
    { href: "/academia-vitahub", label: "Academia Vitahub", icon: <GraduationCap size={20} /> },
    { href: "/notificaciones", label: "Novedades", icon: <Newspaper size={20} /> },
    { href: "/referral", label: "Invita y gana", icon: <UserPlus size={20} /> },
    { href: "/mis-datos", label: "Mis Datos", icon: <Settings size={20} /> },

    // 🔥 Este solo lo ven usuarios con tag "vitahuber"
    { href: "/vitahuber", label: "Vitahuber", icon: <Settings size={20} />, requireTag: "vitahuber" },
  ];

  return (
    <aside className="bg-[#fafafa] border-r shadow-inner p-2 flex flex-col justify-between w-16 sm:w-56 transition-all">
      <nav className="flex flex-col gap-2 text-[#1b3f7a]">

        {navItems
          .filter((item) => {
            // Si pide tag y no lo tiene → ocultar
            if (item.requireTag === "vitahuber" && !isVitahuber) return false;
            return true;
          })
          .map(({ href, label, icon }) => {
            const isActive = pathname.startsWith(href);
            const isNovedades = href === "/notificaciones";

            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center justify-center sm:justify-start gap-2 px-2 py-2 rounded transition text-sm
                  ${isActive ? "bg-[#1b3f7a] text-white" : "hover:bg-[#e6e6e6] text-[#1b3f7a]"}`}
              >
                {icon}
                <span className="hidden sm:inline">{label}</span>

                {isNovedades && novedadesPendientes > 0 && (
                  <span className="absolute top-1 right-2 sm:static sm:ml-auto bg-red-600 text-white text-xs rounded-full px-2 py-0.5">
                    {novedadesPendientes}
                  </span>
                )}
              </Link>
            );
          })}
      </nav>

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
