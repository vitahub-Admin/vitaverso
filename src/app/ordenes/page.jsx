"use client";

import { useEffect, useState, useMemo } from "react";
import Cookies from "js-cookie";
import OrdersTable from "./components/Sheet";
import Banner from "../components/Banner";
import Chart1 from "./components/Chart1";
import Chart2 from "./components/Chart2";
import { TrendingUp, ShoppingCart, Package, SlidersHorizontal } from "lucide-react";

function fmt(n) {
  return Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function OrdenesPage() {
  const [error, setError]           = useState("");
  const [ordenesData, setOrdenesData] = useState([]);
  const [startDate, setStartDate]   = useState("");
  const [endDate, setEndDate]       = useState("");
  const [loading, setLoading]       = useState(false);

  useEffect(() => {
    const today     = new Date();
    const priorDate = new Date();
    priorDate.setDate(today.getDate() - 30);

    const start = priorDate.toISOString().split("T")[0];
    const end   = today.toISOString().split("T")[0];

    setStartDate(start);
    setEndDate(end);

    const customerId = Cookies.get("customerId");
    if (!customerId) { setError("No hay customerId disponible"); return; }
    fetchData(customerId, start, end);
  }, []);

  const fetchData = async (customerId, from, to) => {
    setLoading(true);
    setError("");
    try {
      let url = `/api/google/${customerId}`;
      if (from && to) url += `?from=${from}&to=${to}`;
      const res  = await fetch(url);
      const data = await res.json();
      if (!data.success) { setError(data.message); return; }
      setOrdenesData(data.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = () => {
    const customerId = Cookies.get("customerId");
    if (!customerId) return;
    fetchData(customerId, startDate, endDate);
  };

  const totals = useMemo(() => {
    let ganancia = 0;
    let items    = 0;
    const uniqueOrders = new Set();
    ordenesData.forEach((order) => {
      ganancia += Number(order.ganancia_total) || 0;
      items    += Number(order.total_items)    || 0;
      uniqueOrders.add(order.order_number);
    });
    return { ganancia, items, carritos: uniqueOrders.size };
  }, [ordenesData]);

  return (
    <div className="min-h-screen bg-white text-gray-900">

      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=LL-jZPoVZXg" />

      {/* ── Título ── */}
      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[960px] mx-auto py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
              Órdenes
            </h1>
            <p className="text-sm text-gray-400 font-medium">Seguí tus ventas y ganancias</p>
          </div>

          {/* Filtros de fecha */}
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={14} className="text-gray-400 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#1b3f7a] transition"
            />
            <span className="text-gray-400 text-sm">a</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#1b3f7a] transition"
            />
            <button
              onClick={handleFilter}
              disabled={loading}
              className="px-4 py-2 bg-[#1b3f7a] text-white text-sm font-semibold rounded-lg hover:bg-[#163264] disabled:opacity-50 transition"
            >
              {loading ? "Cargando..." : "Filtrar"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-[960px] mx-auto px-6 py-7 flex flex-col gap-5">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {/* ══ Cards de resumen ══ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <StatCard
            icon={TrendingUp}
            label="Ganancias"
            value={`$${fmt(totals.ganancia)}`}
            color="emerald"
          />
          <StatCard
            icon={Package}
            label="Items vendidos"
            value={totals.items}
            color="blue"
          />
          <StatCard
            icon={ShoppingCart}
            label="Carritos"
            value={totals.carritos}
            color="amber"
          />

        </div>

        {/* ══ Charts ══ */}
        {ordenesData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <Chart1 data={ordenesData} />
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
              <Chart2 data={ordenesData} />
            </div>
          </div>
        )}

        {/* ══ Tabla ══ */}
        {ordenesData.length > 0 ? (
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <OrdersTable data={ordenesData} />
          </div>
        ) : (
          !loading && (
            <div className="flex flex-col items-center gap-2 py-16 text-gray-300">
              <ShoppingCart size={32} strokeWidth={1.5} />
              <p className="text-sm text-gray-400">
                No se encontraron órdenes en el período seleccionado
              </p>
            </div>
          )
        )}

      </div>
    </div>
  );
}

// ── Componente stat card ────────────────────────────────────
const colorMap = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-400" },
  blue:    { bg: "bg-blue-50",    text: "text-[#1b3f7a]",   dot: "bg-blue-400"    },
  amber:   { bg: "bg-amber-50",   text: "text-amber-600",   dot: "bg-amber-400"   },
};

function StatCard({ icon: Icon, label, value, color }) {
  const c = colorMap[color];
  return (
    <div className="relative bg-white border border-gray-100 rounded-2xl p-6 shadow-sm overflow-hidden">
      <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-gray-50 opacity-60 pointer-events-none" />
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0 ${c.text}`}>
          <Icon size={18} />
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">
            {label}
          </p>
          <p className={`text-2xl font-extrabold tracking-tight ${c.text}`}>
            {value}
          </p>
        </div>
      </div>
    </div>
  );
}
