"use client";
import { useState, useEffect, useRef } from "react";
import { useCustomer } from "../context/CustomerContext";
import { ShoppingCart, RotateCcw, Wallet, Bell, ChevronRight, TrendingUp, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import Cookies from "js-cookie";

// ── Helpers ───────────────────────────────────────────────────────────────────
function saludo() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

function fmtRelative(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `hace ${m || 1} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return fmtDate(iso);
}

function notifIcon(data) {
  const type = data?.type || "";
  if (type.includes("recompra")) return { icon: RotateCcw, color: "text-purple-500", bg: "bg-purple-50" };
  if (type.includes("commission") || type.includes("earning")) return { icon: ShoppingCart, color: "text-[#1E8FA8]", bg: "bg-[#E6F4F8]" };
  if (type.includes("credit") || type.includes("retiro") || type.includes("exchange")) return { icon: Wallet, color: "text-emerald-500", bg: "bg-emerald-50" };
  return { icon: Bell, color: "text-[#5B7A8C]", bg: "bg-[#F7F9FB]" };
}

// ── Mini bar chart 7 días ─────────────────────────────────────────────────────
function WeekChart({ sharecarts }) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("es-MX", { weekday: "short" }).slice(0, 2);
    const items = sharecarts.filter(c => (c.created_at || c.full_created_at || "").startsWith(key));
    days.push({ label, total: items.length, converted: items.filter(c => c.has_sale).length });
  }

  const maxVal = Math.max(...days.map(d => d.total), 1);
  const totalSent = days.reduce((s, d) => s + d.total, 0);
  const totalConv  = days.reduce((s, d) => s + d.converted, 0);
  const convRate   = totalSent > 0 ? Math.round((totalConv / totalSent) * 100) : 0;

  return (
    <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Última semana</p>
          <p className="text-lg font-extrabold text-[#0D2133] mt-0.5">Protocolos compartidos</p>
        </div>
        <Link href="/mis-carritos-merge" className="text-xs text-[#1E8FA8] font-semibold hover:underline flex items-center gap-1">
          Ver todo <ChevronRight size={12} />
        </Link>
      </div>

      {/* KPIs */}
      <div className="flex gap-4">
        <div className="flex-1 bg-[#F7F9FB] rounded-xl px-3 py-2.5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Enviados</p>
          <p className="text-2xl font-extrabold text-[#0D2133] tabular-nums mt-0.5">{totalSent}</p>
        </div>
        <div className="flex-1 bg-[#F7F9FB] rounded-xl px-3 py-2.5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Convertidos</p>
          <p className="text-2xl font-extrabold text-[#1E8FA8] tabular-nums mt-0.5">{totalConv}</p>
        </div>
        <div className="flex-1 bg-[#F7F9FB] rounded-xl px-3 py-2.5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Tasa</p>
          <p className="text-2xl font-extrabold text-[#0D2133] tabular-nums mt-0.5">{convRate}%</p>
        </div>
      </div>

      {/* Barras */}
      <div className="flex items-end gap-1.5 h-16">
        {days.map((d, i) => {
          const pct = d.total / maxVal;
          const convPct = d.total > 0 ? d.converted / d.total : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col justify-end rounded-t-sm overflow-hidden" style={{ height: "44px" }}>
                <div className="w-full bg-[#D0E4EC] rounded-t-sm relative" style={{ height: `${Math.max(pct * 44, d.total > 0 ? 4 : 0)}px` }}>
                  {d.converted > 0 && (
                    <div className="absolute bottom-0 w-full bg-[#1E8FA8] rounded-t-sm"
                      style={{ height: `${convPct * 100}%` }} />
                  )}
                </div>
              </div>
              <span className="text-[9px] font-semibold text-[#B0C8D4] capitalize">{d.label}</span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-[#5B7A8C]">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#D0E4EC] inline-block" /> Enviados</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#1E8FA8] inline-block" /> Convertidos</span>
      </div>
    </div>
  );
}

// ── Feed de notificaciones ────────────────────────────────────────────────────
function NotifFeed({ notificaciones }) {
  return (
    <div className="bg-white border border-[#D0E4EC] rounded-2xl flex flex-col overflow-hidden">
      <div className="px-5 py-4 border-b border-[#EEF3F7]">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Actividad</p>
        <p className="text-lg font-extrabold text-[#0D2133] mt-0.5">Notificaciones</p>
      </div>
      <div className="flex-1 overflow-y-auto divide-y divide-[#F0F5F8] max-h-72
        [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[#D0E4EC] [&::-webkit-scrollbar-thumb]:rounded-full">
        {notificaciones.length === 0 && (
          <div className="px-5 py-8 text-center text-[#B0C8D4] text-xs">
            Sin notificaciones aún
          </div>
        )}
        {notificaciones.map(n => {
          const { icon: Icon, color, bg } = notifIcon(n.data);
          return (
            <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-[#F7F9FB] transition-colors">
              <div className={`w-8 h-8 rounded-full ${bg} flex items-center justify-center shrink-0 mt-0.5`}>
                <Icon size={14} className={color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-[#0D2133] leading-snug">{n.title}</p>
                <p className="text-[11px] text-[#5B7A8C] mt-0.5 leading-snug">{n.body}</p>
              </div>
              <span className="text-[10px] text-[#B0C8D4] shrink-0 mt-0.5">{fmtRelative(n.created_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Novedades verticales ──────────────────────────────────────────────────────
function NovedadesPanel({ noticias, lastSeenId }) {
  if (!noticias.length) return null;
  return (
    <div className="bg-white border border-[#D0E4EC] rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-[#EEF3F7] flex items-center justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Comunidad</p>
          <p className="text-lg font-extrabold text-[#0D2133] mt-0.5">Novedades</p>
        </div>
        <Link href="/notificaciones" className="text-xs text-[#1E8FA8] font-semibold hover:underline flex items-center gap-1">
          Ver todas <ChevronRight size={12} />
        </Link>
      </div>
      <div className="divide-y divide-[#F0F5F8]">
        {noticias.slice(0, 6).map(n => {
          const isNew = n.id > lastSeenId;
          return (
            <Link href="/notificaciones" key={n.id}
              className="flex items-start gap-3 px-5 py-3.5 hover:bg-[#F7F9FB] transition-colors">
              <div className="mt-1.5 shrink-0">
                {isNew
                  ? <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                  : <span className="w-2 h-2 rounded-full bg-[#D0E4EC] inline-block" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${isNew ? "font-bold text-[#0D2133]" : "font-medium text-[#5B7A8C]"}`}>
                  {n.titulo || n.title || "Novedad"}
                </p>
                {n.fecha && <p className="text-[10px] text-[#B0C8D4] mt-0.5">{n.fecha}</p>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function HomePage() {
  const { customer } = useCustomer();
  const customerId = customer?.id || Cookies.get("customerId");

  const [banner, setBanner]               = useState(null);
  const [sharecarts, setSharecarts]       = useState([]);
  const [notificaciones, setNotificaciones] = useState([]);
  const [noticias, setNoticias]           = useState([]);
  const [lastSeenId, setLastSeenId]       = useState(0);
  const [loadingCarts, setLoadingCarts]   = useState(true);
  const [walletData, setWalletData]       = useState(null);

  // Banner
  useEffect(() => {
    fetch("/api/data/banner")
      .then(r => r.json())
      .then(d => { if (d?.url) setBanner(d); })
      .catch(() => {});
  }, []);

  // Sharecarts última semana
  useEffect(() => {
    if (!customerId) return;
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to   = new Date().toISOString();
    fetch(`/api/sharecart/merged/${customerId}?from=${from}&to=${to}`)
      .then(r => r.json())
      .then(d => setSharecarts(d.data || []))
      .catch(() => {})
      .finally(() => setLoadingCarts(false));
  }, [customerId]);

  // Notificaciones
  useEffect(() => {
    if (!customerId) return;
    fetch(`/api/home/notifications?customerId=${customerId}`)
      .then(r => r.json())
      .then(d => setNotificaciones(d.notifications || []))
      .catch(() => {});
  }, [customerId]);

  // Wallet — usa la cookie proJwt, no necesita parámetros
  useEffect(() => {
    if (!customerId) return;
    fetch("/api/affiliates/wallet")
      .then(r => r.json())
      .then(d => { if (d?.ok) setWalletData(d.wallet); })
      .catch(() => {});
  }, [customerId]);

  // Novedades
  useEffect(() => {
    try {
      const lsi = parseInt(localStorage.getItem("lastSeenId") || "0", 10);
      setLastSeenId(lsi);
    } catch {}
    fetch("/api/sheet/news")
      .then(r => r.json())
      .then(d => {
        const sorted = (d.noticias || []).slice().sort((a, b) => b.id - a.id);
        setNoticias(sorted);
      })
      .catch(() => {});
  }, []);

  const nombre = customer?.first_name || "Especialista";
  const fecha  = new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="min-h-full bg-[#F7F9FB]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Saludo */}
        <div>
          <p className="text-xs text-[#5B7A8C] capitalize">{fecha}</p>
          <h1 className="text-2xl font-extrabold text-[#0D2133] mt-0.5">
            {saludo()}, {nombre} 👋
          </h1>
        </div>

        {/* Accesos rápidos */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_auto]">

          {/* Wallet card */}
          <Link href="/wallet"
            className="group bg-[#0D2133] text-white rounded-2xl p-4 flex flex-col gap-3 hover:bg-[#162d60] transition-colors col-span-2 sm:col-span-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                  <Wallet size={16} className="text-[#1E8FA8]" />
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-white/60">Mi Wallet</span>
              </div>
              <ArrowUpRight size={15} className="text-white/30 group-hover:text-white/60 transition-colors" />
            </div>
            <div>
              {walletData != null ? (
                <>
                  <p className="text-2xl font-extrabold tabular-nums leading-none">
                    ${Number(walletData.available || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[11px] text-white/50 mt-1">Saldo disponible</p>
                </>
              ) : (
                <div className="h-7 w-28 bg-white/10 rounded-lg animate-pulse" />
              )}
            </div>
            {walletData != null && walletData.total_earned > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] text-white/40">
                <TrendingUp size={11} />
                <span>Ganado en total: ${Number(walletData.total_earned).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </Link>

          {/* Acceso rápido al armador */}
          <Link href="/armador-carritos"
            className="group bg-white border border-[#D0E4EC] rounded-2xl p-4 flex flex-col justify-between gap-2 hover:border-[#1E8FA8]/40 hover:shadow-sm transition-all sm:min-w-[168px]">
            <div className="w-8 h-8 rounded-xl bg-[#E6F4F8] flex items-center justify-center">
              <ShoppingCart size={16} className="text-[#1E8FA8]" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#0D2133] leading-snug">Armar protocolo</p>
              <p className="text-[11px] text-[#5B7A8C] mt-0.5">Crear y enviar</p>
            </div>
            <ChevronRight size={14} className="text-[#B0C8D4] group-hover:text-[#1E8FA8] group-hover:translate-x-0.5 transition-all" />
          </Link>

        </div>

        {/* Banner */}
        {banner?.url && (
          <div className="rounded-2xl overflow-hidden border border-[#D0E4EC] shadow-sm">
            {banner.link
              ? <a href={banner.link} target="_blank" rel="noopener noreferrer">
                  <img src={banner.url} alt={banner.description || "Banner"} className="w-full h-auto object-cover" />
                </a>
              : <img src={banner.url} alt={banner.description || "Banner"} className="w-full h-auto object-cover" />
            }
          </div>
        )}

        {/* Chart + Notificaciones */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {loadingCarts
            ? <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5 h-48 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-[#D0E4EC] border-t-[#1E8FA8] rounded-full animate-spin" />
              </div>
            : <WeekChart sharecarts={sharecarts} />
          }
          <NotifFeed notificaciones={notificaciones} />
        </div>

        {/* Novedades */}
        <NovedadesPanel noticias={noticias} lastSeenId={lastSeenId} />

      </div>
    </div>
  );
}
