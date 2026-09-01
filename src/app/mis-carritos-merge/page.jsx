"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ShoppingCart, TrendingUp, DollarSign, Package } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", maximumFractionDigits: 0,
  }).format(Number(n) || 0);

const extractValue = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && "value" in v) return v.value;
  return v;
};

/**
 * Agrupa una lista por mes y devuelve array ordenado cronológicamente.
 * dateKey: campo con la fecha
 * valueKey: campo numérico a sumar (opcional)
 */
function groupByMonth(items, dateKey, valueKey = null) {
  const map = new Map();
  for (const item of items) {
    const raw = extractValue(item[dateKey]);
    const d   = raw ? new Date(raw) : null;
    if (!d || isNaN(d)) continue;
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
    if (!map.has(key)) map.set(key, { key, label, count: 0, value: 0 });
    map.get(key).count += 1;
    if (valueKey != null) map.get(key).value += Number(extractValue(item[valueKey])) || 0;
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, currency = false }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-gray-600 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-bold">
          {currency ? fmtMXN(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide truncate">{label}</p>
        <p className="text-2xl font-extrabold text-[#1b3f7a] leading-tight tabular-nums">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────
export default function MisCarritosMerge() {
  const [carts, setCarts]             = useState([]);
  const [walletData, setWalletData]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  useEffect(() => {
    async function load() {
      const customerId = Cookies.get("customerId");
      if (!customerId) { setError("Sin sesión."); setLoading(false); return; }
      try {
        const [cartRes, walletRes] = await Promise.all([
          fetch(`/api/sharecart/merged/${customerId}`),
          fetch("/api/affiliates/wallet"),
        ]);
        const [cartData, wData] = await Promise.all([cartRes.json(), walletRes.json()]);

        if (cartData.success) {
          setCarts(
            (cartData.data || [])
              .map(c => ({
                created_at:  extractValue(c.created_at),
                status:      extractValue(c.status),
                items_value: Number(extractValue(c.items_value)) || 0,
              }))
              .filter(c => c.created_at)
          );
        }
        if (wData.success) setWalletData(wData);
      } catch (e) {
        setError(e.message || "Error al cargar datos");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-[3px] border-gray-200 border-t-[#1b3f7a] animate-spin" />
        <p className="text-sm text-gray-400">Cargando analytics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-8">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  // ── Datos para charts ──
  const cartsPerMonth = groupByMonth(carts, "created_at");
  const valuePerMonth = groupByMonth(carts, "created_at", "items_value");

  // Ganancias desde transacciones de wallet
  const transactions  = walletData?.transactions || [];
  const earningsPerMonth = groupByMonth(
    transactions.filter(t => Number(t.amount || t.points_amount || 0) > 0),
    "created_at",
    (t => t.amount || t.points_amount || 0)  // resolveremos abajo
  );
  // groupByMonth espera un campo string, así que lo hacemos manualmente
  const earnMap = new Map();
  for (const t of transactions) {
    const amt = Number(t.amount || t.points_amount || 0);
    if (amt <= 0) continue;
    const raw = t.created_at;
    const d   = raw ? new Date(raw) : null;
    if (!d || isNaN(d)) continue;
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("es-MX", { month: "short", year: "2-digit" });
    if (!earnMap.has(key)) earnMap.set(key, { key, label, value: 0 });
    earnMap.get(key).value += amt;
  }
  const earningsData = [...earnMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  // ── Stats ──
  const totalCarts     = carts.length;
  const totalValor     = carts.reduce((s, c) => s + c.items_value, 0);
  const completados    = carts.filter(c => c.status === "completed").length;
  const walletBalance  = walletData?.wallet?.available ?? 0;

  const chartColor1 = "#1b3f7a";
  const chartColor2 = "#1e8fa8";

  return (
    <div className="min-h-screen bg-[#F7F9FB]">
      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="max-w-[1100px] mx-auto py-6">
          <h1 className="text-2xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
            Analytics
          </h1>
          <p className="text-xs text-gray-400 font-medium">
            Evolución de tus sharecarts y ganancias a través del tiempo
          </p>
        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={ShoppingCart}
            label="Total sharecarts"
            value={totalCarts}
            accent="bg-[#1b3f7a]"
          />
          <StatCard
            icon={Package}
            label="Completados"
            value={completados}
            sub={`${totalCarts > 0 ? Math.round(completados / totalCarts * 100) : 0}% de conversión`}
            accent="bg-emerald-500"
          />
          <StatCard
            icon={TrendingUp}
            label="Valor total generado"
            value={fmtMXN(totalValor)}
            accent="bg-[#1e8fa8]"
          />
          <StatCard
            icon={DollarSign}
            label="Saldo disponible"
            value={fmtMXN(walletBalance)}
            sub="En wallet"
            accent="bg-purple-500"
          />
        </div>

        {/* Chart 1: Sharecarts por mes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-1">Sharecarts por mes</h2>
          <p className="text-xs text-gray-400 mb-5">Número de carritos compartidos cada mes</p>
          {cartsPerMonth.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">
              Sin datos suficientes
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={cartsPerMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Bar
                  dataKey="count"
                  fill={chartColor1}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 2: Valor de carritos por mes */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
          <h2 className="text-sm font-bold text-gray-700 mb-1">Valor generado por mes</h2>
          <p className="text-xs text-gray-400 mb-5">Suma del valor de los productos en tus sharecarts</p>
          {valuePerMonth.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-300 text-sm">
              Sin datos suficientes
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={valuePerMonth} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={chartColor2} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={chartColor2} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip currency />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={chartColor2}
                  strokeWidth={2}
                  fill="url(#gradValue)"
                  dot={{ r: 3, fill: chartColor2 }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Chart 3: Ganancias (wallet) por mes */}
        {earningsData.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 sm:p-6">
            <h2 className="text-sm font-bold text-gray-700 mb-1">Ganancias a través del tiempo</h2>
            <p className="text-xs text-gray-400 mb-5">Créditos acumulados en tu wallet por mes</p>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={earningsData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradEarn" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip currency />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#gradEarn)"
                  dot={{ r: 3, fill: "#10b981" }}
                  activeDot={{ r: 5 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
