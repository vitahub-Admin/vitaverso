// page.jsx (AdminDatosAnalyticsPage)
"use client";

import { useEffect, useState, useMemo } from "react";
import AGGridAnalyticsTable from "./components/AnalyticsTable";
import {
  ShoppingCart, DollarSign, Store, MessageSquare,
  ArrowUpRight, ArrowDownRight, Search, X
} from "lucide-react";

const VAMBE_COLOR = "#7c3aed";

// ── Mobile card ────────────────────────────────────────────────────────────
function MobileCard({ row }) {
  const joinDate = row.created_at
    ? new Date(row.created_at).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  function PeriodBlock({ label, sc, ord, scPrev, ordPrev, dimmed }) {
    const scDiff  = sc  - scPrev;
    const ordDiff = ord - ordPrev;

    return (
      <div className={`flex flex-col gap-1 rounded-xl border p-3 ${dimmed ? "border-gray-100 bg-gray-50/50" : "border-blue-100 bg-blue-50/40"}`}>
        <p className={`text-[0.6rem] font-bold tracking-widest uppercase ${dimmed ? "text-gray-400" : "text-blue-400"}`}>{label}</p>
        <div className="flex gap-3">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[0.6rem] text-gray-400 uppercase tracking-wide">SC</span>
            <span className={`text-base font-extrabold leading-none ${scDiff > 0 ? "text-emerald-600" : scDiff < 0 ? "text-red-500" : "text-gray-700"}`}>{sc}</span>
            {scDiff !== 0 && (
              <span className={`flex items-center text-[0.6rem] font-semibold ${scDiff > 0 ? "text-emerald-500" : "text-red-400"}`}>
                {scDiff > 0 ? <ArrowUpRight size={9}/> : <ArrowDownRight size={9}/>}{Math.abs(scDiff)}
              </span>
            )}
          </div>
          <div className="w-px bg-gray-200" />
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[0.6rem] text-gray-400 uppercase tracking-wide">Ord</span>
            <span className={`text-base font-extrabold leading-none ${ordDiff > 0 ? "text-emerald-600" : ordDiff < 0 ? "text-red-500" : "text-gray-700"}`}>{ord}</span>
            {ordDiff !== 0 && (
              <span className={`flex items-center text-[0.6rem] font-semibold ${ordDiff > 0 ? "text-emerald-500" : "text-red-400"}`}>
                {ordDiff > 0 ? <ArrowUpRight size={9}/> : <ArrowDownRight size={9}/>}{Math.abs(ordDiff)}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-4 flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <a
              href={`/admin-datos-afiliados/affiliates/${row.id}`}
              className="font-bold text-sm text-gray-800 hover:text-blue-600 hover:underline truncate"
            >
              {row.first_name} {row.last_name}
            </a>
            {row.is_new && (
              <span className="text-[0.6rem] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full shrink-0">NEW</span>
            )}
          </div>
          <p className="text-xs text-gray-400 truncate">{row.email}</p>
          {joinDate && <p className="text-[0.65rem] text-gray-300">Desde {joinDate}</p>}
        </div>

        {/* Íconos */}
        <div className="flex items-center gap-1.5 shrink-0">
          {row.activo_carrito && (
            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
              <ShoppingCart size={11} className="text-blue-600" />
            </div>
          )}
          {row.vendio && (
            <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
              <DollarSign size={11} className="text-emerald-600" />
            </div>
          )}
          {row.active_store && (
            <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center">
              <Store size={11} className="text-yellow-600" />
            </div>
          )}
          {row.vambe_url && (
            <a
              href={row.vambe_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center hover:bg-purple-200 transition-colors"
            >
              <MessageSquare size={11} style={{ color: VAMBE_COLOR }} />
            </a>
          )}
        </div>
      </div>

      {/* Períodos */}
      <div className="grid grid-cols-3 gap-2">
        <PeriodBlock label="0-30d"  sc={row.sc_30}  ord={row.ord_30} scPrev={row.sc_60}  ordPrev={row.ord_60} />
        <PeriodBlock label="31-60d" sc={row.sc_60}  ord={row.ord_60} scPrev={row.sc_90}  ordPrev={row.ord_90} dimmed />
        <PeriodBlock label="61-90d" sc={row.sc_90}  ord={row.ord_90} scPrev={0}          ordPrev={0}          dimmed />
      </div>

    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function AdminDatosAnalyticsPage() {
  const [data, setData]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [globalFilter, setGlobalFilter] = useState("");
  const [activeFilters, setActiveFilters] = useState({
    activo_carrito: false,
    vendio: false,
    activo_tienda: false,
    nuevos: false,
    con_meeting: false,
    sin_meeting: false, 
  });

  useEffect(() => {
    fetch("/api/admin/affiliates/analytics")
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredData = useMemo(() => {
    return data.filter(row => {
      const search = globalFilter.trim().toLowerCase();
      if (search) {
        const full = `${row.first_name} ${row.last_name} ${row.email}`.toLowerCase();
        if (!full.includes(search)) return false;
      }
      if (activeFilters.activo_carrito && !row.activo_carrito) return false;
      if (activeFilters.vendio        && !row.vendio)         return false;
      if (activeFilters.activo_tienda && !row.active_store)   return false;
      if (activeFilters.nuevos        && !row.is_new)         return false;
      if (activeFilters.con_meeting && !row.had_meeting) return false;
      if (activeFilters.sin_meeting &&  row.had_meeting) return false;
      return true;
    });
  }, [data, globalFilter, activeFilters]);

 const stats = useMemo(() => ({
  activo_carrito: data.filter(r => r.activo_carrito).length,
  vendio:         data.filter(r => r.vendio).length,
  activo_tienda:  data.filter(r => r.active_store).length,
  nuevos:         data.filter(r => r.is_new).length,
  con_meeting:    data.filter(r => r.had_meeting).length,
  sin_meeting:    data.filter(r => !r.had_meeting).length,
  total:          data.length,
}), [data]);

  const toggleFilter = (f) => setActiveFilters(p => ({ ...p, [f]: !p[f] }));

const clearAll = () => {
  setActiveFilters({ 
    activo_carrito: false, vendio: false, 
    activo_tienda: false, nuevos: false,
    con_meeting: false, sin_meeting: false,
  });
  setGlobalFilter("");
};

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white">
      <div className="w-9 h-9 rounded-full border-[3px] border-gray-200 border-t-[#1b3f7a] animate-spin" />
      <p className="text-sm text-gray-400">Cargando analytics…</p>
    </div>
  );

  const FILTERS = [
    { key: "activo_carrito", label: "Activo Carrito", color: "blue"   },
    { key: "vendio",         label: "Vendió",         color: "emerald" },
    { key: "activo_tienda",  label: "Activo Tienda",  color: "yellow" },
    { key: "nuevos",         label: "✨ Nuevos (7d)",  color: "purple" },
      { key: "con_meeting",    label: "📹 Con reunión",   color: "green"   }, // ← nuevo
  { key: "sin_meeting",    label: "⚠️ Sin reunión",   color: "orange"  }, // ← nuevo

  ];

  const colorMap = {
    blue:    { active: "bg-blue-100 text-blue-800 border-blue-300",    inactive: "bg-blue-50 text-blue-700 border-blue-200",    badge: "bg-blue-200 text-blue-800"    },
    emerald: { active: "bg-emerald-100 text-emerald-800 border-emerald-300", inactive: "bg-emerald-50 text-emerald-700 border-emerald-200", badge: "bg-emerald-200 text-emerald-800" },
    yellow:  { active: "bg-yellow-100 text-yellow-800 border-yellow-300", inactive: "bg-yellow-50 text-yellow-700 border-yellow-200", badge: "bg-yellow-200 text-yellow-800" },
    purple:  { active: "bg-purple-100 text-purple-800 border-purple-300", inactive: "bg-purple-50 text-purple-700 border-purple-200", badge: "bg-purple-200 text-purple-800" },
      green:  { active: "bg-green-100 text-green-800 border-green-300",   inactive: "bg-green-50 text-green-700 border-green-200",   badge: "bg-green-200 text-green-800"   },
  orange: { active: "bg-orange-100 text-orange-800 border-orange-300", inactive: "bg-orange-50 text-orange-700 border-orange-200", badge: "bg-orange-200 text-orange-800" },

  };

  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* Título */}
      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[1200px] mx-auto py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">Analytics</h1>
            <p className="text-sm text-gray-400 font-medium">{stats.total} afiliados · períodos de 30/60/90 días</p>
          </div>
          <a
            href="/api/admin/affiliates/analytics/export"
            className="hidden md:flex items-center gap-2 px-4 py-2 bg-[#1b3f7a] text-white rounded-xl text-xs font-semibold hover:bg-[#163264] transition-colors"
          >
            Exportar CSV
          </a>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-6 flex flex-col gap-5">

        {/* Buscador + filtros */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nombre o email…"
                value={globalFilter}
                onChange={e => setGlobalFilter(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#1b3f7a] focus:shadow-[0_0_0_3px_rgba(27,63,122,0.08)] transition-all"
              />
              {globalFilter && (
                <button onClick={() => setGlobalFilter("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={13} />
                </button>
              )}
            </div>
            <button
              onClick={clearAll}
              className="px-4 py-2.5 text-xs font-semibold border border-gray-200 rounded-xl text-gray-500 hover:border-gray-300 transition-colors"
            >
              Limpiar
            </button>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            {FILTERS.map(({ key, label, color }) => {
              const c = colorMap[color];
              const active = activeFilters[key];
              return (
                <button
                  key={key}
                  onClick={() => toggleFilter(key)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold border transition-colors ${active ? c.active : c.inactive}`}
                >
                  {label}
                  <span className={`text-[0.65rem] px-1.5 py-0.5 rounded-full ${c.badge}`}>{stats[key]}</span>
                </button>
              );
            })}
            <span className="ml-auto text-xs text-gray-400 font-medium">
              {filteredData.length} de {stats.total}
            </span>
          </div>
        </div>

        {/* Desktop: AG Grid */}
        <div className="hidden md:block">
          <AGGridAnalyticsTable data={filteredData} />
        </div>

        {/* Mobile: cards */}
        <div className="flex flex-col gap-3 md:hidden">
          {filteredData.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">Sin resultados</div>
          ) : (
            filteredData.map(row => <MobileCard key={row.id} row={row} />)
          )}
        </div>

      </div>
    </div>
  );
}