"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { useCustomer } from "../context/CustomerContext.jsx";
import { useSidebar } from "../context/SidebarContext.jsx";
import { useTour } from "../context/TourContext.jsx";

import {
  Home, Contact, BarChart2,
  ClipboardList, Stethoscope, Store, History, CalendarCheck,
  Users, GraduationCap, Newspaper, UserPlus, Award,
  DollarSign, ShoppingBag, ShoppingCart, BookOpen,
  HelpCircle, Layers, Calendar, Settings, Compass,
  PanelLeftClose, PanelLeftOpen, User, LogOut,
} from "lucide-react";

const BOOKING_WHITELIST = [
  "9166283571521","8394066952513","8819754762561","9730042724673",
  "9375138775361","9351299400001","10324449034561","9784013783361",
  "8988042592577","9001558376769","9191677854017","9191936622913",
  "9192315781441","9300956315969","9330069766465","9362135286081",
  "9416818229569","9530796900673","9565525934401","9705885303105",
  "9772222447937","9844729905473","9851360870721",
];

// ── Estructura de nav pública — grupos separados por divisor ─────────────────
// divider: true → renderiza un divisor visual en vez de un link
const NAV_GROUPS = [
  // Grupo 1 — core
  [
    { href: "/home",               label: "Inicio",               icon: Home         },
    { href: "/contactos",          label: "Mis Contactos",        icon: Contact      },
    { href: "/mis-carritos-merge", label: "Analytics",            icon: BarChart2    }, // abierto a todos
  ],
  // Grupo 2 — protocolos y operación
  [
    { href: "/mis-protocolos",          label: "Protocolos",              icon: ClipboardList, requireProtocols: true },
    { href: "/armador-carritos",        label: "Protocolos Clínicos",     icon: Stethoscope   },
    { href: "/protocolos-compartidos",  label: "Protocolos Compartidos",  icon: History        },
    { href: "/mi-tienda",               label: "Mi Tienda",               icon: Store          },
    // Historial Protocolos quitado del nav — solo accesible desde analytics/home
    { href: "/booking-dashboard",       label: "Mis Citas",               icon: CalendarCheck, requireBooking: true },
  ],
  // Grupo 3 — comunidad y contenido
  [
    { href: "/comunidad",          label: "Comunidad",            icon: Users         },
    { href: "/academia-vitahub",   label: "Academia Vitahub",     icon: GraduationCap },
    { href: "/referral",           label: "Invita y gana",        icon: UserPlus      },
  ],
];

// ── Nav admin — solo vitahuber ────────────────────────────────────────────────
const ADMIN_ITEMS = [
  { href: "/wallet",                   label: "Wallet",                icon: DollarSign  },
  { href: "/ordenes",                  label: "Órdenes",               icon: ShoppingBag },
  { href: "/ordenes-v2",               label: "Órdenes V2",            icon: BarChart2   },
  { href: "/manual",                   label: "Manual",                icon: BookOpen    },
  { href: "/vitahuber",                label: "Sharecarts General",    icon: Layers      },
  { href: "/admin",                    label: "Admin",                 icon: ShoppingCart},
  { href: "/admin-sharecarts",         label: "Ganancia Referido",     icon: DollarSign  },
  { href: "/admin-datos-afiliados",    label: "Profesionales Data",    icon: Layers      },
  { href: "/admin-datos-analytics",    label: "Analytics Admin",       icon: Layers      },
  { href: "/admin-pagos",              label: "Pagos",                 icon: Layers      },
  { href: "/admin-resena",             label: "Reseñas tienda",        icon: Layers      },
  { href: "/admin-comunidad",          label: "Reseñas productos",     icon: Layers      },
  { href: "/calendar",                 label: "Calendar",              icon: Calendar    },
  { href: "/admin/protocols",          label: "Builder Protocolos",    icon: ClipboardList},
  { href: "/admin-capacitaciones",     label: "Capacitaciones",        icon: Layers      },
  { href: "/admin-ordenes",            label: "Órdenes Admin",         icon: ShoppingBag },
  // /mis-medallas oculto — el sistema de badges todavía no está listo para
  // producción. Badges Admin sigue visible para poder seguir trabajándolo.
  { href: "/admin-badges",             label: "Badges Admin",          icon: Award       },
  { href: "/admin-notificaciones",     label: "Notificaciones Admin",  icon: Users       },
];

const WHATSAPP = `https://wa.me/5215548592403?text=${encodeURIComponent("Soy profesional Vitahub y tengo una duda")}`;

export default function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { customer } = useCustomer();
  const { collapsed, toggle } = useSidebar();
  const tour = useTour();

  const handleLogout = () => {
    Cookies.remove("customerId");
    Cookies.remove("proJwt");
    router.replace("/");
    setTimeout(() => window.location.reload(), 50);
  };
  const [novedadesPendientes, setNovedadesPendientes] = useState(0);
  const [hasProtocols, setHasProtocols] = useState(false);

  const tagsArray = customer?.tags?.split(",")?.map(t => t.trim().toLowerCase()) || [];
  const isVitahuber = tagsArray.includes("vitahuber");
  const hasBookingAccess = isVitahuber || BOOKING_WHITELIST.includes(String(customer?.id || ""));

  useEffect(() => {
    if (!customer?.id) return;
    fetch(`/api/protocols?owner_id=${customer.id}`)
      .then(r => r.json())
      .then(data => {
        const list = data.protocols || data.items || data || [];
        const own = Array.isArray(list)
          ? list.filter(p => String(p.owner_id) === String(customer.id))
          : [];
        setHasProtocols(own.length > 0);
      })
      .catch(() => {});
  }, [customer?.id]);

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
      } catch {}
    }
    checkNovedades();
  }, [pathname]);

  // Filtrar items según permisos del usuario
  function filterItem(item) {
    if (item.requireTag === "vitahuber" && !isVitahuber) return false;
    if (item.requireBooking && !hasBookingAccess) return false;
    if (item.requireProtocols && !hasProtocols) return false;
    return true;
  }

  const w = collapsed ? "w-14" : "w-14 sm:w-52";

  function NavLink({ item }) {
    const isActive    = pathname === item.href || (item.href !== "/" && item.href !== "/home" && pathname.startsWith(item.href));
    const isNovedades = item.href === "/notificaciones";
    return (
      <Link
        key={item.href}
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={`
          relative flex items-center gap-3
          ${collapsed ? "justify-center" : "justify-start sm:justify-start"}
          px-2.5 py-2.5 rounded-xl text-sm font-medium transition-all
          ${isActive
            ? "bg-[#1b3f7a] text-white shadow-sm"
            : "text-gray-500 hover:bg-gray-50 hover:text-[#1b3f7a]"
          }
        `}
      >
        <item.icon size={17} className="shrink-0" />
        {!collapsed && <span className="hidden sm:inline truncate">{item.label}</span>}
        {isNovedades && novedadesPendientes > 0 && (
          <span className="
            absolute top-1.5 right-1.5
            min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold
            rounded-full flex items-center justify-center px-1
          ">
            {novedadesPendientes}
          </span>
        )}
      </Link>
    );
  }

  function Divider() {
    if (collapsed) return <div className="my-1.5 mx-auto w-6 h-px bg-gray-100" />;
    return (
      <div className="my-2 px-2.5 hidden sm:flex items-center gap-2">
        <div className="flex-1 h-px bg-gray-100" />
      </div>
    );
  }

  const adminItems = ADMIN_ITEMS.filter(() => isVitahuber);

  return (
    <aside className={`
      bg-white border-r border-gray-100 flex flex-col justify-between h-full
      ${w} transition-all duration-200
    `}>

      {/* ── Nav principal ── */}
      <div className="flex-1 overflow-y-auto py-2 px-2 flex flex-col gap-0.5
        [&::-webkit-scrollbar]:w-1
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:bg-gray-200
        [&::-webkit-scrollbar-thumb]:rounded-full
      ">
        {/* ── Recorrido guiado ── */}
        {tour && (
          <button
            onClick={tour.start}
            title={collapsed ? "Descubre Vitahub PRO" : undefined}
            className={`
              flex items-center gap-3 mb-1
              ${collapsed ? "justify-center" : "justify-start"}
              px-2.5 py-2.5 rounded-xl text-sm font-semibold transition-all
              bg-[#E6F4F8] text-[#1E8FA8] hover:bg-[#C2DFE8]
            `}
          >
            <Compass size={17} className="shrink-0" />
            {!collapsed && <span className="hidden sm:inline truncate">Descubre Vitahub PRO</span>}
          </button>
        )}

        {NAV_GROUPS.map((group, gi) => (
          <div key={gi}>
            {/* Divisor entre grupos (no antes del primero) */}
            {gi > 0 && <Divider />}
            {group.filter(filterItem).map(item => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        ))}

        {/* ── Sección Admin ── */}
        {adminItems.length > 0 && (
          <>
            {!collapsed && (
              <div className="my-2 px-2.5 hidden sm:flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[0.6rem] font-semibold tracking-widest uppercase text-gray-300">
                  Admin
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
            )}
            <div className="my-1 mx-2 h-px bg-gray-100 sm:hidden" />
            {adminItems.map(item => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={`
                    flex items-center gap-3
                    ${collapsed ? "justify-center" : "justify-start sm:justify-start"}
                    px-2.5 py-2 rounded-xl text-sm font-medium transition-all
                    ${isActive
                      ? "bg-[#1b3f7a] text-white shadow-sm"
                      : "text-gray-400 hover:bg-gray-50 hover:text-[#1b3f7a]"
                    }
                  `}
                >
                  <item.icon size={15} className="shrink-0" />
                  {!collapsed && <span className="hidden sm:inline truncate text-xs">{item.label}</span>}
                </Link>
              );
            })}
          </>
        )}
      </div>

      {/* ── Footer: colapsar + Mi Perfil + ayuda ── */}
      <div className="p-2 border-t border-gray-100 shrink-0 flex flex-col gap-1.5">
        {/* Toggle collapse — solo desktop */}
        <button
          onClick={toggle}
          title={collapsed ? "Expandir menú" : "Colapsar menú"}
          className="
            hidden sm:flex items-center justify-center gap-2
            px-2.5 py-2 rounded-xl text-gray-400 hover:bg-gray-50 hover:text-[#1b3f7a]
            transition-all text-xs font-medium
          "
        >
          {collapsed
            ? <PanelLeftOpen size={16} />
            : <><PanelLeftClose size={16} /><span className="hidden sm:inline">Colapsar</span></>
          }
        </button>

        {/* Mi Perfil */}
        <Link
          href="/mis-datos"
          title="Mi Perfil"
          className={`
            flex items-center gap-3 px-2.5 py-2.5 rounded-xl
            border border-gray-100 text-sm font-semibold
            hover:bg-gray-50 hover:border-gray-200 transition-all
            ${collapsed ? "justify-center" : "justify-center sm:justify-start"}
            ${pathname === "/mis-datos" ? "bg-gray-50 text-[#1b3f7a]" : "text-gray-500"}
          `}
        >
          <User size={16} className="shrink-0" />
          {!collapsed && <span className="hidden sm:inline">Mi Perfil</span>}
        </Link>

        {/* Ayuda */}
        <Link
          href={WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          title="Ayuda"
          className={`
            flex items-center gap-3 px-2.5 py-2.5 rounded-xl
            bg-emerald-500 text-white text-sm font-semibold
            hover:bg-emerald-600 transition
            ${collapsed ? "justify-center" : "justify-center sm:justify-start"}
          `}
        >
          <HelpCircle size={17} className="shrink-0" />
          {!collapsed && <span className="hidden sm:inline">Ayuda</span>}
        </Link>

        {/* Cerrar sesión */}
        {customer && (
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className={`
              flex items-center gap-3 px-2.5 py-2 rounded-xl
              text-red-400 hover:bg-red-50 hover:text-red-500 transition-all text-sm font-medium
              ${collapsed ? "justify-center" : "justify-center sm:justify-start"}
            `}
          >
            <LogOut size={15} className="shrink-0" />
            {!collapsed && <span className="hidden sm:inline">Cerrar sesión</span>}
          </button>
        )}
      </div>

    </aside>
  );
}
