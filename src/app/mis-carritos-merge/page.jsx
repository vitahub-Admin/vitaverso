"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import {
  User, ShoppingCart, Phone, Package,
  ChevronDown, ExternalLink, Calendar, Clock,
  CheckCircle, DollarSign, Eye, AlertCircle, Copy,
} from "lucide-react";
import Banner from "../components/Banner";

// ── helpers ────────────────────────────────────────────────
const extractValue = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "value" in value) return value.value;
  return value;
};

const fmtCurrency = (n) =>
  Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (dateStr) => {
  const v = extractValue(dateStr);
  if (!v) return null;
  try {
    return new Intl.DateTimeFormat("es-MX", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(new Date(v));
  } catch { return String(v); }
};

const timeAgo = (dateString) => {
  const v = extractValue(dateString);
  if (!v) return "";
  try {
    const diff  = Date.now() - new Date(v).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins  < 1)  return "Justo ahora";
    if (mins  < 60) return `Hace ${mins}m`;
    if (hours < 24) return `Hace ${hours}h`;
    if (days  < 7)  return `Hace ${days}d`;
    return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(v));
  } catch { return ""; }
};

const transformCart = (cart) => {
  const getVal    = (key) => extractValue(cart[key]);
  const cartSource = getVal("source");
  const isPaid    = getVal("status") === "Completed" || getVal("status") === "paid" || cart.is_paid;
  const createdAt = getVal("created_at");
  const updatedAt = getVal("updated_at") || createdAt;

  let patient_notes = "";
  if (cartSource === "bigquery") patient_notes = getVal("note") || "";
  if (cartSource === "supabase" && cart.extra?.patient_info?.notes)
    patient_notes = cart.extra.patient_info.notes;

  return {
    id:           getVal("id") || getVal("code") || getVal("token"),
    token:        getVal("token"),
    source:       cartSource,
    type:         cartSource === "bigquery" ? "legacy" : "new",
    name:         getVal("client_name") || getVal("name") || getVal("email") || "Sin nombre",
    email:        getVal("email"),
    phone:        getVal("phone"),
    patient_notes,
    patient_info: cart.extra?.patient_info || {},
    status:       isPaid ? "completed" : "pending",
    items_count:  getVal("items_count") || cart.items?.length || 0,
    items_value:  getVal("items_value") || null,
    opens_count:  getVal("opens_count") || 0,
    order_number: getVal("order_number"),
    items:        cart.items || cart.items_details || [],
    products_detail: cart.extra?.products_detail || [],
    created_at:          createdAt,
    created_at_formatted: fmtDate(createdAt) || "-",
    updated_at:          updatedAt,
    updated_at_formatted: fmtDate(updatedAt) || "-",
    extra:        cart.extra || {},
  };
};

// ── status badges ──────────────────────────────────────────
const STATUS = {
  completed: { label: "Completado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending:   { label: "Pendiente",  cls: "bg-amber-50  text-amber-700  border-amber-200"   },
};
const TYPE = {
  new:    { label: "Nuevo",    cls: "bg-purple-50 text-purple-700 border-purple-200" },
  legacy: { label: "Histórico", cls: "bg-blue-50  text-blue-700  border-blue-200"   },
};

// ── StatCard ───────────────────────────────────────────────
const colorMap = {
  blue:    { bg: "bg-blue-50",    text: "text-[#1b3f7a]"  },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
  purple:  { bg: "bg-purple-50",  text: "text-purple-600"  },
  amber:   { bg: "bg-amber-50",   text: "text-amber-600"   },
};
function StatCard({ icon: Icon, label, value, color }) {
  const c = colorMap[color];
  return (
    <div className="relative bg-white border border-gray-100 rounded-2xl p-5 shadow-sm overflow-hidden">
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-gray-50 opacity-60 pointer-events-none" />
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center shrink-0 ${c.text}`}>
          <Icon size={16} />
        </div>
        <div>
          <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">{label}</p>
          <p className={`text-xl font-extrabold tracking-tight ${c.text}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────
export default function FusionCartsPage() {
  const router = useRouter();
  const [carts, setCarts]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState("");
  const [copiedToken, setCopiedToken]   = useState("");
  const [selectedFilter, setSelectedFilter] = useState("all");

  useEffect(() => {
    async function load() {
      try {
        const customerId = Cookies.get("customerId");
        if (!customerId) { setError("No hay customerId disponible."); return; }

        const res  = await fetch(`/api/sharecart/merged/${customerId}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Error obteniendo datos");

        const transformed = data.data.map(transformCart)
          .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

        setCarts(transformed);
      } catch (err) {
        setError(err.message || "Error al cargar los carritos");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(""), 2000);
  };

  const stats = {
    total:      carts.length,
    new:        carts.filter(c => c.type === "new").length,
    legacy:     carts.filter(c => c.type === "legacy").length,
    completed:  carts.filter(c => c.status === "completed").length,
    pending:    carts.filter(c => c.status === "pending").length,
    totalValue: carts.reduce((s, c) => s + (Number(c.items_value) || 0), 0),
  };

  const filtered = carts.filter(c => {
    if (selectedFilter === "new")       return c.type   === "new";
    if (selectedFilter === "legacy")    return c.type   === "legacy";
    if (selectedFilter === "completed") return c.status === "completed";
    if (selectedFilter === "pending")   return c.status === "pending";
    return true;
  });

  const FILTERS = [
    { key: "all",       label: `Todos (${stats.total})`,            cls: "bg-[#1b3f7a] text-white",      active: "bg-[#1b3f7a] text-white",      inactive: "bg-gray-100 text-gray-600 hover:bg-gray-200"       },
    { key: "new",       label: `Nuevos (${stats.new})`,             active: "bg-purple-600 text-white",   inactive: "bg-purple-50 text-purple-700 hover:bg-purple-100"  },
    { key: "legacy",    label: `Histórico (${stats.legacy})`,       active: "bg-blue-600 text-white",     inactive: "bg-blue-50 text-blue-700 hover:bg-blue-100"        },
    { key: "completed", label: `Completados (${stats.completed})`,  active: "bg-emerald-600 text-white",  inactive: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"},
    { key: "pending",   label: `Pendientes (${stats.pending})`,     active: "bg-amber-500 text-white",    inactive: "bg-amber-50 text-amber-700 hover:bg-amber-100"     },
  ];

  // ── Loading ──
  if (loading) return (
    <div className="min-h-screen bg-white">
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=-GYlDydre00" />
      <div className="max-w-[960px] mx-auto px-6 py-16 flex flex-col items-center gap-3">
        <div className="w-9 h-9 rounded-full border-[3px] border-gray-200 border-t-[#1b3f7a] animate-spin" />
        <p className="text-sm text-gray-400">Cargando carritos…</p>
      </div>
    </div>
  );

  // ── Error ──
  if (error) return (
    <div className="min-h-screen bg-white">
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=-GYlDydre00" />
      <div className="max-w-[960px] mx-auto px-6 py-16">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <p className="text-red-600 font-semibold mb-2">Error</p>
          <p className="text-gray-600 text-sm mb-6">{error}</p>
          <button onClick={() => router.push("/")}
            className="px-4 py-2 bg-[#1b3f7a] text-white rounded-lg text-sm font-semibold hover:bg-[#163264] transition">
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=-GYlDydre00" />

      {/* ── Título ── */}
      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[960px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
            Carritos Compartidos
          </h1>
          <p className="text-sm text-gray-400 font-medium">
            {carts.length === 0
              ? "No tenés carritos compartidos aún"
              : `${stats.total} carrito${stats.total !== 1 ? "s" : ""} · ${stats.new} nuevos · ${stats.legacy} históricos`}
          </p>
        </div>
      </div>

      <div className="max-w-[960px] mx-auto px-6 py-7 flex flex-col gap-5">

        {/* ══ Stats ══ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={ShoppingCart} label="Total"       value={stats.total}              color="blue"    />
          <StatCard icon={CheckCircle}  label="Completados" value={stats.completed}           color="emerald" />
          <StatCard icon={Package}      label="Nuevos"      value={stats.new}                 color="purple"  />
          <StatCard icon={DollarSign}   label="Valor total" value={`$${fmtCurrency(stats.totalValue)}`} color="amber" />
        </div>

        {/* ══ Filtros ══ */}
        <div className="bg-white border border-gray-100 rounded-2xl px-5 py-4 shadow-sm">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <button key={f.key}
                onClick={() => setSelectedFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  selectedFilter === f.key ? f.active : f.inactive
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* ══ Lista vacía ══ */}
        {carts.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-16 text-gray-300">
            <ShoppingCart size={36} strokeWidth={1.5} />
            <p className="text-sm text-gray-400">No hay carritos compartidos todavía</p>
            <button onClick={() => router.push("/")}
              className="mt-2 px-4 py-2 bg-[#1b3f7a] text-white rounded-lg text-sm font-semibold hover:bg-[#163264] transition">
              Ir al inicio
            </button>
          </div>
        )}

        {/* ══ Cards de carritos ══ */}
        {filtered.length > 0 && (
          <div className="flex flex-col gap-3">
            {filtered.map((cart) => (
              <CartCard
                key={cart.id}
                cart={cart}
                copiedToken={copiedToken}
                onCopy={copyToClipboard}
              />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}

// ── CartCard ───────────────────────────────────────────────
function CartCard({ cart, copiedToken, onCopy }) {
  const [open, setOpen] = useState(false);
  const cartUrl = `https://vitahub.mx/cart?shared-cart-id=${cart.token}`;
  const st = STATUS[cart.status];
  const tp = TYPE[cart.type];

  return (
    <div className={`bg-white border rounded-2xl shadow-sm transition-all ${open ? "border-[#1b3f7a]/30" : "border-gray-100"}`}>

      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-5 py-4 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex-1 min-w-0 flex flex-col gap-1.5">

          {/* Fila 1: nombre + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-gray-800 truncate">
              {String(cart.name || `Carrito ${cart.token?.substring?.(0, 8) || ""}`)}
            </span>
            <span className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded-full border ${st.cls}`}>
              {st.label}
            </span>
            <span className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded-full border ${tp.cls}`}>
              {tp.label}
            </span>
          </div>

          {/* Fila 2: meta */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
            {cart.phone && (
              <span className="flex items-center gap-1"><Phone size={11} />{String(cart.phone)}</span>
            )}
            {cart.email && (
              <span className="hidden md:flex items-center gap-1"><User size={11} />{String(cart.email)}</span>
            )}
            <span className="flex items-center gap-1">
              <Calendar size={11} />{cart.created_at_formatted}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} />{timeAgo(cart.updated_at)}
            </span>
            {cart.items_value > 0 && (
              <span className="flex items-center gap-1 text-emerald-600 font-semibold">
                <DollarSign size={11} />${fmtCurrency(cart.items_value)}
              </span>
            )}
            {cart.opens_count > 0 && (
              <span className="flex items-center gap-1"><Eye size={11} />{cart.opens_count}</span>
            )}
            {cart.items_count > 0 && (
              <span className="flex items-center gap-1"><Package size={11} />{cart.items_count} items</span>
            )}
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-2 shrink-0">
          <a href={cartUrl} target="_blank" rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 px-3 py-1.5 bg-[#1b3f7a] text-white rounded-lg text-xs font-semibold hover:bg-[#163264] transition">
            <ExternalLink size={13} />
            <span className="hidden sm:inline">Abrir</span>
          </a>
          <div className={`text-gray-300 transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
            <ChevronDown size={18} />
          </div>
        </div>
      </div>

      {/* ── Detalle expandido ── */}
      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-50 flex flex-col gap-4">

          {/* Grid info cliente + métricas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Cliente + enlace */}
            <div className="flex flex-col gap-3">
              <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">Cliente</p>
              <div className="flex flex-col gap-2 text-sm">
                {cart.name !== "Sin nombre" && <MetaRow label="Nombre" value={cart.name} />}
                {cart.phone && <MetaRow label="Teléfono" value={cart.phone} />}
                {cart.email && <MetaRow label="Email" value={cart.email} />}
              </div>

              <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400 mt-2">Enlace</p>
              <div className="flex items-center gap-2">
                <a href={cartUrl} target="_blank" rel="noopener noreferrer"
                  className="flex-1 text-xs text-[#1b3f7a] underline truncate">{cartUrl}</a>
                <button onClick={() => onCopy(cartUrl)}
                  className="w-7 h-7 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center transition"
                  title="Copiar enlace">
                  {copiedToken === cartUrl
                    ? <CheckCircle size={13} className="text-emerald-500" />
                    : <Copy size={13} className="text-gray-500" />}
                </button>
              </div>
            </div>

            {/* Métricas */}
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">Detalles</p>
              <MetaRow label="Tipo"       value={cart.type === "new" ? "Nuevo sistema" : "Sistema histórico"} />
              <MetaRow label="Estado"     value={STATUS[cart.status].label} />
              {cart.order_number && <MetaRow label="Orden #" value={String(cart.order_number)} mono />}
              <MetaRow label="Creado"     value={cart.created_at_formatted} />
              <MetaRow label="Actualizado" value={cart.updated_at_formatted} />
              {cart.items_value > 0 && (
                <MetaRow label="Valor total" value={`$${fmtCurrency(cart.items_value)}`} green />
              )}
              {cart.opens_count > 0 && (
                <MetaRow label="Aperturas" value={String(cart.opens_count)} />
              )}
            </div>
          </div>

          {/* Notas */}
          {cart.patient_notes && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-blue-400 mb-2">
                Notas {cart.type === "legacy" ? "del carrito" : "adicionales"}
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{cart.patient_notes}</p>
            </div>
          )}

          {/* Productos */}
          {(cart.products_detail?.length > 0 || cart.items?.length > 0) ? (
            <div className="flex flex-col gap-3">
              <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">
                Productos ({cart.products_detail?.length || cart.items?.length})
              </p>

              {cart.products_detail?.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cart.products_detail.map((p, i) => (
                    <div key={i} className="bg-white border border-gray-100 rounded-xl p-3 flex flex-col gap-2">
                      <p className="text-xs font-semibold text-gray-800 line-clamp-2">
                        {p.product_title || "Producto sin nombre"}
                      </p>
                      {p.variant_title && (
                        <p className="text-[0.7rem] text-gray-400">{p.variant_title}</p>
                      )}
                      <div className="flex items-center justify-between mt-auto pt-2 border-t border-gray-50">
                        <span className="text-[0.67rem] text-gray-400 uppercase tracking-wide">Cant.</span>
                        <span className="text-xs font-bold text-[#1b3f7a]">{p.quantity}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {cart.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 text-xs">
                      <span className="text-gray-500">Item #{i + 1} — <span className="font-mono">{item.variant_id || "Sin ID"}</span></span>
                      <span className="font-semibold text-[#1b3f7a]">× {item.quantity || 1}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
              <AlertCircle size={15} className="text-amber-500 shrink-0" />
              <p className="text-xs text-amber-700">No hay información detallada de productos para este carrito.</p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

// ── MetaRow ────────────────────────────────────────────────
function MetaRow({ label, value, mono, green }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-gray-400 text-xs shrink-0">{label}</span>
      <span className={`text-xs font-medium truncate ${mono ? "font-mono text-gray-500" : green ? "text-emerald-600 font-bold" : "text-gray-700"}`}>
        {value}
      </span>
    </div>
  );
}