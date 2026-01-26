"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCustomer } from "../context/CustomerContext.jsx";

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
  Layers,
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const { customer } = useCustomer();
  const [novedadesPendientes, setNovedadesPendientes] = useState(0);

  // ✅ Transformar tags del context en array limpio
  const tagsArray =
    customer?.tags
      ?.split(",")
      ?.map((t) => t.trim().toLowerCase()) || [];

  const isVitahuber = tagsArray.includes("vitahuber");

  // 🔵 Check de novedades
  useEffect(() => {
    async function checkNovedades() {
      try {
        const res = await fetch("/api/sheet/news");
        const data = await res.json();

        if (!data.noticias) return;

        const ultimoId =
          data.noticias[data.noticias.length - 1]?.id || 0;

        const lastSeenId = parseInt(
          localStorage.getItem("lastSeenId") || "0",
          10
        );

        if (pathname === "/notificaciones") {
          localStorage.setItem("lastSeenId", ultimoId);
          setNovedadesPendientes(0);
        } else {
          const nuevas = data.noticias.filter(
            (n) => n.id > lastSeenId
          ).length;
          setNovedadesPendientes(nuevas);
        }
      } catch (err) {
        console.error("Error revisando novedades:", err);
      }
    }

    checkNovedades();
  }, [pathname]);

  const whatsappNumber = "5215548592403";
  const whatsappMessage = encodeURIComponent(
    "Estoy en el programa de afiliados y tengo una duda"
  );
  const whatsappLink = `https://wa.me/${whatsappNumber}?text=${whatsappMessage}`;

  // 🔵 Definimos menú
  const navItems = [
    { href: "/ganancias", label: "Ganancias", icon: <DollarSign size={20} /> },
    { href: "/ordenes", label: "Órdenes", icon: <ShoppingBag size={20} /> },
    { href: "/mis-carritos-merge", label: "Mis Carritos", icon: <ShoppingCart size={20} /> },
    { href: "/contactos", label: "Mis Contactos", icon: <Contact size={20} /> },
    { href: "/mi-tienda", label: "Mi Tienda", icon: <Store size={20} /> },
    { href: "/manual", label: "Manual", icon: <BookOpen size={20} />, requireTag: "vitahuber" },
    { href: "/academia-vitahub", label: "Academia Vitahub", icon: <GraduationCap size={20} /> },
    { href: "/notificaciones", label: "Novedades", icon: <Newspaper size={20} /> },
    { href: "/referral", label: "Invita y gana", icon: <UserPlus size={20} /> },
    { href: "/mis-datos", label: "Mis Datos", icon: <Settings size={20} /> },
  
    // 🔥 Estos solo lo ven usuarios con tag "vitahuber"  
    { href: "/vitahuber", label: "Vitahuber", icon: <Settings size={20} />, requireTag: "vitahuber" },
    { href: "/admin", label: "admin", icon: <ShoppingCart size={20} />, requireTag: "vitahuber" },
    { href: "/admin-sharecarts", label: "sharecarts General", icon: <Layers size={20} />, requireTag: "vitahuber" },
    { href: "/admin-datos-afiliados", label: "afiliados Data General", icon: <Layers size={20} />, requireTag: "vitahuber" },
    { href: "/admin-datos-analytics", label: "afiliados Analytics", icon: <Layers size={20} />, requireTag: "vitahuber" },
  ];

  // Filtrar items según permisos
  const filteredItems = navItems.filter((item) => {
    if (item.requireTag === "vitahuber" && !isVitahuber) return false;
    return true;
  });

  return (
    <aside className="bg-[#fafafa] border-r shadow-inner p-2 flex flex-col justify-between w-16 sm:w-56 transition-all h-full">
      {/* Contenedor principal con scroll */}
      <div className="flex-grow overflow-y-auto pr-1 custom-scrollbar">
        <nav className="flex flex-col gap-2 text-[#1b3f7a]">
          {filteredItems.map(({ href, label, icon }) => {
            const isActive = pathname.startsWith(href);
            const isNovedades = href === "/notificaciones";

            return (
              <Link
                key={href}
                href={href}
                className={`relative flex items-center justify-center sm:justify-start gap-2 px-2 py-2 rounded transition text-sm
                  ${
                    isActive
                      ? "bg-[#1b3f7a] text-white"
                      : "hover:bg-[#e6e6e6] text-[#1b3f7a]"
                  }`}
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
      </div>

      {/* Botón de Ayuda - fijo abajo */}
      <div className="mt-4 pt-2 border-t border-gray-200 flex-shrink-0">
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

      {/* Estilos para scrollbar personalizado */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
        
        /* Para Firefox */
        .custom-scrollbar {
          scrollbar-width: thin;
          scrollbar-color: #c1c1c1 #f1f1f1;
        }
      `}</style>
    </aside>
  );
}