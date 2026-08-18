"use client";

import { useState, useMemo } from "react";
import {
  User, ShoppingCart, Search, Package,
  CheckCircle2, XCircle, Stethoscope, Filter,
  ExternalLink, ChevronDown, TrendingUp,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN_IDS — Agrega aquí los Shopify customer IDs del equipo admin.
// Cuando el toggle "Sin admins" está activo, se ocultan los carritos de estos owners.
// ─────────────────────────────────────────────────────────────────────────────
const ADMIN_IDS = new Set([
  // "9672878457153",
  // "1234567890123",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) =>
  n != null
    ? `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 0 })}`
    : null;

const dateStr = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("es-MX", {
        day: "numeric", month: "short", year: "2-digit",
      })
    : null;

// ── Sub-componentes ───────────────────────────────────────────────────────────
const isProtocol = (origen) =>
  origen === "protocolo" || origen === "armador-carritos" || origen === "armador-checkout";

function OriginBadge({ origen, hasProtocolId }) {
  if (isProtocol(origen)) {
    return hasProtocolId ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700 shrink-0">
        <Stethoscope size={10} />
        Protocolo
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-50 text-indigo-500 shrink-0">
        <Stethoscope size={10} />
        Armador
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 shrink-0">
      <ShoppingCart size={10} />
      Carrito
    </span>
  );
}

function ConversionBadge({ converted, orderName, orderTotal }) {
  if (converted) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700 shrink-0">
        <CheckCircle2 size={10} />
        {orderName || "Vendido"}
        {orderTotal ? ` · ${fmt(orderTotal)}` : ""}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-400 shrink-0">
      <XCircle size={10} />
      Sin orden
    </span>
  );
}

function CartRow({ cart }) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <div
        className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        {/* Nombre + protocolo */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800 truncate">
              {cart.name || "Sin nombre"}
            </span>
            {cart.protocol_name && (
              <span className="text-xs text-gray-400 truncate hidden sm:block">
                {cart.protocol_name}
              </span>
            )}
          </div>
          <div className="text-xs text-gray-400 mt-0.5 sm:hidden">
            {dateStr(cart.created_at)}
          </div>
        </div>

        {/* Badges + fecha */}
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          <OriginBadge origen={cart.origen} hasProtocolId={!!cart.protocol_id} />
          <ConversionBadge
            converted={cart.converted}
            orderName={cart.order_name}
            orderTotal={cart.order_total}
          />
          <span className="text-xs text-gray-300 hidden sm:block">
            {dateStr(cart.created_at)}
          </span>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1.5 ml-1 shrink-0">
          <a
            href={`https://vitahub.mx/cart?shared-cart-id=${cart.token}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="p-1.5 text-gray-300 hover:text-[#1b3f7a] transition-colors"
            title="Abrir carrito"
          >
            <ExternalLink size={13} />
          </a>
          <ChevronDown
            size={13}
            className={`text-gray-300 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </div>
      </div>

      {/* Detalle expandido */}
      {open && (
        <div className="px-4 pb-3 pt-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
          <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3">
            <span>Token: <code className="font-mono text-gray-600">{cart.token}</code></span>
            {cart.phone    && <span>Tel: {cart.phone}</span>}
            {cart.order_date && <span>Orden: {dateStr(cart.order_date)}</span>}
            {cart.order_total && (
              <span>Ingreso: <strong className="text-emerald-600">{fmt(cart.order_total)}</strong></span>
            )}
          </div>

          {cart.products_detail?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cart.products_detail.map((p, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                  <div className="font-medium text-gray-700">{p.product_title || p.title}</div>
                  {p.variant_title && <div className="text-gray-400">{p.variant_title}</div>}
                  {p.quantity > 1 && <div className="text-gray-400">×{p.quantity}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProtocolCard({ protocolId, protocol_name, carts }) {
  const converted = carts.filter(c => c.converted);
  const pct       = carts.length ? Math.round((converted.length / carts.length) * 100) : 0;
  const revenue   = carts.reduce((s, c) => s + (c.order_total || 0), 0);

  // Owners únicos que usaron este protocolo
  const owners = [...new Map(
    carts.filter(c => c.owner_name || c.owner_id)
         .map(c => [c.owner_id, c.owner_name || c.owner_id])
  ).values()];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-50">
        <div className="flex items-start gap-2 mb-1">
          <Stethoscope size={15} className="text-[#1b3f7a] mt-0.5 shrink-0" />
          <h3 className="font-semibold text-gray-800 text-sm leading-snug">
            {protocol_name}
          </h3>
        </div>

        {/* Dueño(s) del protocolo */}
        {owners.length > 0 && (
          <div className="flex items-center gap-1 mb-3 ml-5">
            <User size={10} className="text-gray-400 shrink-0" />
            <span className="text-[11px] text-gray-400 truncate">
              {owners.length === 1
                ? owners[0]
                : `${owners[0]} +${owners.length - 1}`}
            </span>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xl font-bold text-gray-800">{carts.length}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Enviados</div>
          </div>
          <div>
            <div className={`text-xl font-bold ${pct > 0 ? "text-emerald-600" : "text-gray-300"}`}>
              {pct}%
            </div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">
              {converted.length} vendido{converted.length !== 1 ? "s" : ""}
            </div>
          </div>
          <div>
            <div className="text-xl font-bold text-gray-800 truncate">{fmt(revenue) || "$0"}</div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">Ingresos</div>
          </div>
        </div>
      </div>

      {/* Lista de prescripciones */}
      <div className="divide-y divide-gray-50 overflow-y-auto max-h-52 flex-1">
        {carts.map(cart => (
          <div key={cart.id} className="flex items-center gap-2 px-4 py-2 text-xs hover:bg-gray-50">
            {cart.converted
              ? <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
              : <XCircle     size={12} className="text-gray-300 shrink-0" />
            }
            <span className="flex-1 truncate text-gray-700">
              {cart.name || "Sin nombre"}
            </span>
            <div className="flex items-center gap-2 ml-1 shrink-0">
              {cart.order_total && (
                <span className="text-emerald-600 font-medium">{fmt(cart.order_total)}</span>
              )}
              <span className="text-gray-300">{dateStr(cart.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="text-center py-16 text-gray-400">
      <ShoppingCart size={36} className="mx-auto mb-3 opacity-20" />
      <p>{text || "No se encontraron carritos"}</p>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function SharecartsClient({ carts = [] }) {
  const [query,      setQuery]      = useState("");
  const [view,       setView]       = useState("todos");
  const [hideAdmins, setHideAdmins] = useState(true);

  // ── Filtrado ──────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let result = carts;
    if (hideAdmins && ADMIN_IDS.size > 0) {
      result = result.filter(c => !ADMIN_IDS.has(String(c.owner_id)));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      result = result.filter(c =>
        c.name?.toLowerCase().includes(q)          ||
        c.phone?.toLowerCase().includes(q)         ||
        c.owner_name?.toLowerCase().includes(q)    ||
        c.owner_id?.toString().includes(q)         ||
        c.protocol_name?.toLowerCase().includes(q) ||
        c.token?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [carts, hideAdmins, query]);

  // ── Stats globales ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total     = filtered.length;
    const converted = filtered.filter(c => c.converted).length;
    const protocols = filtered.filter(c => isProtocol(c.origen)).length;
    const revenue   = filtered.reduce((s, c) => s + (c.order_total || 0), 0);
    const convPct   = total ? Math.round((converted / total) * 100) : 0;
    return { total, converted, convPct, protocols, revenue };
  }, [filtered]);

  // ── Agrupado por owner ────────────────────────────────────────────────────
  const byOwner = useMemo(() => {
    if (view !== "todos") return [];
    const map = new Map();
    for (const cart of filtered) {
      const key = cart.owner_id || "NO_OWNER";
      if (!map.has(key)) map.set(key, { owner_name: cart.owner_name, carts: [] });
      map.get(key).carts.push(cart);
    }
    return [...map.entries()].sort((a, b) => b[1].carts.length - a[1].carts.length);
  }, [filtered, view]);

  // ── Agrupado por protocolo ────────────────────────────────────────────────
  // Solo incluye carts con protocol_id definido (de mis-protocolos).
  // Los de armador-carritos (sin protocol_id) aparecen en "Todos" pero no aquí.
  const byProtocol = useMemo(() => {
    if (view !== "protocolos") return [];
    const map = new Map();
    for (const cart of filtered) {
      if (!isProtocol(cart.origen)) continue;
      if (!cart.protocol_id) continue; // armador libre → no agrupar aquí
      const key = cart.protocol_id;
      if (!map.has(key)) {
        map.set(key, {
          protocol_name: cart.protocol_name || `Protocolo ${key}`,
          carts: [],
        });
      }
      map.get(key).carts.push(cart);
    }
    return [...map.entries()].sort((a, b) => b[1].carts.length - a[1].carts.length);
  }, [filtered, view]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header con stats ─────────────────────────────────────────────── */}
      <div className="bg-[#1b3f7a] px-6 py-5">
        <h1 className="text-xl font-semibold text-white mb-4">Sharecarts General</h1>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total",       value: stats.total },
            { label: "Convertidos", value: `${stats.converted} (${stats.convPct}%)` },
            { label: "Protocolos",  value: stats.protocols },
            { label: "Ingresos",    value: fmt(stats.revenue) || "$0" },
          ].map(s => (
            <div key={s.label} className="bg-white/10 rounded-lg px-4 py-3">
              <div className="text-white/60 text-[10px] font-semibold uppercase tracking-wider">
                {s.label}
              </div>
              <div className="text-white text-lg font-bold mt-1">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Controles ────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Buscador */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Nombre, owner, protocolo, token..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]/20"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Tabs de vista */}
          <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
            {[
              ["todos",      "Todos"],
              ["protocolos", "Protocolos"],
            ].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  view === v
                    ? "bg-white text-[#1b3f7a] shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Toggle admins */}
          <button
            onClick={() => setHideAdmins(h => !h)}
            title={ADMIN_IDS.size === 0 ? "Agrega IDs en ADMIN_IDS (SharecartsClient.jsx)" : ""}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              hideAdmins
                ? "bg-[#1b3f7a] text-white border-[#1b3f7a]"
                : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
            } ${ADMIN_IDS.size === 0 ? "opacity-50" : ""}`}
          >
            <Filter size={12} />
            {hideAdmins ? "Sin admins" : "Todos"}
          </button>
        </div>
      </div>

      {/* ── Contenido ────────────────────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-5 max-w-7xl mx-auto">

        {/* Vista Todos */}
        {view === "todos" && (
          byOwner.length === 0
            ? <EmptyState />
            : <div className="space-y-4">
                {byOwner.map(([ownerId, { owner_name, carts: ownerCarts }]) => {
                  const conv    = ownerCarts.filter(c => c.converted).length;
                  const convPct = ownerCarts.length
                    ? Math.round((conv / ownerCarts.length) * 100) : 0;

                  return (
                    <div
                      key={ownerId}
                      className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
                    >
                      {/* Cabecera del owner */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100">
                        <div className="flex items-center gap-2 min-w-0">
                          <User size={14} className="text-[#1b3f7a] shrink-0" />
                          <span className="font-semibold text-[#1b3f7a] text-sm truncate">
                            {owner_name || ownerId}
                          </span>
                          {owner_name && (
                            <span className="text-xs text-gray-400 hidden sm:block">
                              ({ownerId})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 shrink-0 ml-2">
                          <span>{ownerCarts.length} carritos</span>
                          <span className={`font-semibold ${conv > 0 ? "text-emerald-600" : "text-gray-300"}`}>
                            {conv} vendido{conv !== 1 ? "s" : ""} ({convPct}%)
                          </span>
                        </div>
                      </div>

                      {/* Filas de carritos */}
                      <div className="divide-y divide-gray-50">
                        {ownerCarts.map(cart => (
                          <CartRow key={cart.id} cart={cart} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
        )}

        {/* Vista Protocolos */}
        {view === "protocolos" && (
          byProtocol.length === 0
            ? <EmptyState text="No hay protocolos compartidos con los filtros actuales" />
            : <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {byProtocol.map(([protocolId, data]) => (
                  <ProtocolCard key={protocolId} protocolId={protocolId} {...data} />
                ))}
              </div>
        )}
      </div>
    </div>
  );
}
