"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCustomer } from "../context/CustomerContext.jsx";

import {
  DollarSign, ShoppingBag, ShoppingCart, Store,
  BookOpen, GraduationCap, HelpCircle, Newspaper,
  Contact, UserPlus, Settings, Layers,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/wallet",              label: "Wallet",               icon: DollarSign   },
  { href: "/ordenes",             label: "Órdenes",              icon: ShoppingBag  },
  { href: "/mis-carritos-merge",  label: "Mis Carritos",         icon: ShoppingCart },
  { href: "/contactos",           label: "Mis Contactos",        icon: Contact      },
  { href: "/mi-tienda",           label: "Mi Tienda",            icon: Store        },
  { href: "/manual",              label: "Manual",               icon: BookOpen,    requireTag: "vitahuber" },
  { href: "/academia-vitahub",    label: "Academia Vitahub",     icon: GraduationCap },
  { href: "/notificaciones",      label: "Novedades",            icon: Newspaper    },
  { href: "/referral",            label: "Invitá y ganá",        icon: UserPlus     },
  { href: "/mis-datos",           label: "Mis Datos",            icon: Settings     },
  // ── Vitahuber only ──
  { href: "/vitahuber",           label: "Vitahuber",            icon: Settings,    requireTag: "vitahuber" },
  { href: "/admin",               label: "Admin",                icon: ShoppingCart, requireTag: "vitahuber" },
  { href: "/admin-sharecarts",    label: "Sharecarts General",   icon: Layers,      requireTag: "vitahuber" },
  { href: "/admin-datos-afiliados", label: "Afiliados Data",     icon: Layers,      requireTag: "vitahuber" },
  { href: "/admin-datos-analytics", label: "Analytics",          icon: Layers,      requireTag: "vitahuber" },
  { href: "/admin-pagos",         label: "Pagos",                icon: Layers,      requireTag: "vitahuber" },
  { href: "/admin-resena",        label: "Reseñas",              icon: Layers,      requireTag: "vitahuber" },
];

const WHATSAPP = `https://wa.me/5215548592403?text=${encodeURIComponent("Estoy en el programa de afiliados y tengo una duda")}`;

export default function Sidebar() {
  const pathname  = usePathname();
  const { customer } = useCustomer();
  const [novedadesPendientes, setNovedadesPendientes] = useState(0);

  const tagsArray = customer?.tags?.split(",")?.map(t => t.trim().toLowerCase()) || [];
  const isVitahuber = tagsArray.includes("vitahuber");

  useEffect(() => {
    async function checkNovedades() {
      try {
        const res  = await fetch("/api/sheet/news");
        const data = await res.json();
        if (!data.noticias) return;

        const ultimoId   = data.noticias[data.noticias.length - 1]?.id || 0;
        const lastSeenId = parseInt(localStorage.getItem("lastSeenId") || "0", 10);

        if (pathname === "/notificaciones") {
          localStorage.setItem("lastSeenId", ultimoId);
          setNovedadesPendientes(0);
        } else {
          setNovedadesPendientes(data.noticias.filter(n => n.id > lastSeenId).length);
        }
      } catch (err) {
        console.error("Error revisando novedades:", err);
      }
    }
    checkNovedades();
  }, [pathname]);

  const filteredItems = NAV_ITEMS.filter(item =>
    !(item.requireTag === "vitahuber" && !isVitahuber)
  );

  // Separar items normales de los admin (vitahuber)
  const publicItems = filteredItems.filter(item => !item.requireTag);
  const adminItems  = filteredItems.filter(item => item.requireTag === "vitahuber");

  return (
    <aside className="
      bg-white border-r border-gray-100 flex flex-col justify-between
      w-14 sm:w-52 h-full transition-all duration-200
    ">

      {/* ── Nav principal ── */}
      <div className="flex-1 overflow-y-auto py-3 px-2 flex flex-col gap-0.5
        [&::-webkit-scrollbar]:w-1
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:bg-gray-200
        [&::-webkit-scrollbar-thumb]:rounded-full
      ">
        {publicItems.map(({ href, label, icon: Icon }) => {
          const isActive    = pathname.startsWith(href);
          const isNovedades = href === "/notificaciones";

          return (
            <Link
              key={href}
              href={href}
              className={`
                relative flex items-center justify-center sm:justify-start gap-3
                px-2.5 py-2.5 rounded-xl text-sm font-medium transition-all
                ${isActive
                  ? "bg-[#1b3f7a] text-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-50 hover:text-[#1b3f7a]"
                }
              `}
            >
              <Icon size={17} className="shrink-0" />
              <span className="hidden sm:inline truncate">{label}</span>

              {isNovedades && novedadesPendientes > 0 && (
                <span className="
                  absolute top-1.5 right-1.5 sm:static sm:ml-auto
                  min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold
                  rounded-full flex items-center justify-center px-1
                ">
                  {novedadesPendientes}
                </span>
              )}
            </Link>
          );
        })}

        {/* ── Sección Admin ── */}
        {adminItems.length > 0 && (
          <>
            <div className="my-2 px-2.5 hidden sm:flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[0.6rem] font-semibold tracking-widest uppercase text-gray-300">
                Admin
              </span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            <div className="sm:hidden my-1 mx-2 h-px bg-gray-100" />

            {adminItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`
                    flex items-center justify-center sm:justify-start gap-3
                    px-2.5 py-2 rounded-xl text-sm font-medium transition-all
                    ${isActive
                      ? "bg-[#1b3f7a] text-white shadow-sm"
                      : "text-gray-400 hover:bg-gray-50 hover:text-[#1b3f7a]"
                    }
                  `}
                >
                  <Icon size={15} className="shrink-0" />
                  <span className="hidden sm:inline truncate text-xs">{label}</span>
                </Link>
              );
            })}
          </>
        )}
      </div>

      {/* ── Botón Ayuda ── */}
      <div className="p-2 border-t border-gray-100 shrink-0">
        <Link
          href={WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          className="
            flex items-center justify-center sm:justify-start gap-3
            px-2.5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold
            hover:bg-emerald-600 transition
          "
        >
          <HelpCircle size={17} className="shrink-0" />
          <span className="hidden sm:inline">Ayuda</span>
        </Link>
      </div>

    </aside>
  );
}