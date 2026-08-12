"use client";

import { useState, useEffect, useMemo } from "react";
import {
  TrendingUp,
  DollarSign,
  ShoppingBag,
  BarChart2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  RefreshCw,
  PackageOpen,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ─── Constantes de diseño ──────────────────────────────────────────────────
const C = {
  bg: "#F7F9FB",
  header: "#0D2133",
  accent: "#1E8FA8",
  textSec: "#5B7A8C",
  border: "#D0E4EC",
  tealLight: "#E6F4F8",
};

const MONTH_NAMES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

// ─── Helpers ──────────────────────────────────────────────────────────────
const fmt = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function groupByMonth(orders) {
  const map = {};
  orders.forEach((o) => {
    const d = new Date(o.createdAt);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()).padStart(2, "0")}`;
    const label = `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    if (!map[key]) map[key] = { key, label, total: 0 };
    map[key].total += Number(o.total) || 0;
  });

  return Object.values(map)
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((m) => ({
      mes: m.label,
      total: Math.round(m.total),
      ganancia: Math.round(m.total * 0.01),
    }));
}

function currentMonthLabel() {
  const d = new Date();
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Tooltip custom recharts ───────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const total = payload.find((p) => p.dataKey === "total")?.value ?? 0;
  const ganancia = payload.find((p) => p.dataKey === "ganancia")?.value ?? 0;
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: "10px 14px",
        boxShadow: "0 4px 16px rgba(13,33,51,0.08)",
        minWidth: 170,
      }}
    >
      <p
        style={{
          fontWeight: 700,
          color: C.header,
          marginBottom: 6,
          fontSize: 13,
        }}
      >
        {label}
      </p>
      <p style={{ color: C.textSec, fontSize: 12, marginBottom: 2 }}>
        Facturación:{" "}
        <span style={{ color: C.header, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {fmt(total)}
        </span>
      </p>
      <p style={{ color: C.textSec, fontSize: 12 }}>
        Ganancia est.:{" "}
        <span style={{ color: C.accent, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
          {fmt(ganancia)}
        </span>
      </p>
    </div>
  );
}

// ─── Skeleton loading ──────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>
      {/* Header skeleton */}
      <div style={{ background: C.header, padding: "28px 24px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div className="h-7 w-48 rounded-lg bg-white/10 animate-pulse mb-2" />
          <div className="h-4 w-64 rounded bg-white/10 animate-pulse" />
        </div>
      </div>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        {/* Stat cards skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="rounded-2xl p-5 animate-pulse"
              style={{ background: "#fff", border: `1px solid ${C.border}` }}
            >
              <div className="h-3 w-20 rounded bg-gray-100 mb-3" />
              <div className="h-7 w-28 rounded bg-gray-100" />
            </div>
          ))}
        </div>
        {/* Chart + list skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div
            className="md:col-span-3 rounded-2xl animate-pulse"
            style={{ background: "#fff", border: `1px solid ${C.border}`, height: 280 }}
          />
          <div
            className="md:col-span-2 rounded-2xl animate-pulse"
            style={{ background: "#fff", border: `1px solid ${C.border}`, height: 280 }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, teal = false }) {
  return (
    <div
      className="rounded-2xl p-5 flex items-center justify-between gap-3"
      style={{ background: "#fff", border: `1px solid ${C.border}` }}
    >
      <div className="min-w-0">
        <p
          className="text-xs font-semibold uppercase tracking-wider mb-1 truncate"
          style={{ color: C.textSec }}
        >
          {label}
        </p>
        <p
          className="text-2xl font-bold tabular-nums leading-none"
          style={{ color: teal ? C.accent : C.header }}
        >
          {value}
        </p>
      </div>
      <div
        className="rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: C.tealLight,
          width: 42,
          height: 42,
          color: C.accent,
        }}
      >
        <Icon size={19} strokeWidth={1.8} />
      </div>
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────
function Badge({ children, color = "green" }) {
  const styles = {
    green: { background: "#ECFDF5", color: "#047857" },
    blue:  { background: "#EFF6FF", color: "#1D4ED8" },
    gray:  { background: "#F3F4F6", color: "#6B7280" },
  };
  const s = styles[color] ?? styles.gray;
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={s}
    >
      {children}
    </span>
  );
}

// ─── Orden card ───────────────────────────────────────────────────────────
function OrdenCard({ order }) {
  const ganancia = Number(order.total) * 0.01;
  const isPaid = order.financialStatus === "paid";

  return (
    <div
      className="px-4 py-3.5 flex flex-col gap-1.5 border-b last:border-b-0"
      style={{ borderColor: C.border }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-sm" style={{ color: C.header }}>
            {order.name}
          </span>
          {isPaid && <Badge color="green">Pagada</Badge>}
          {order.sharecartToken && <Badge color="blue">Sharecart</Badge>}
          {!isPaid && <Badge color="gray">{order.financialStatus}</Badge>}
        </div>
        <div className="text-right shrink-0">
          <p
            className="font-bold text-sm tabular-nums"
            style={{ color: C.header }}
          >
            {fmt(order.total)}
          </p>
          <p
            className="text-xs tabular-nums"
            style={{ color: C.accent }}
          >
            +{fmt(ganancia)} est.
          </p>
        </div>
      </div>
      <p className="text-xs" style={{ color: C.textSec }}>
        {fmtDate(order.createdAt)}
      </p>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────
export default function OrdenesV2Page() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const fetchOrders = () => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem("token");
    fetch("/api/customer-app/orders", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setOrders(d.orders ?? []);
        else setError(d.error ?? "Error al cargar órdenes");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // ── Cálculos de métricas
  const stats = useMemo(() => {
    const totalFac = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
    const count = orders.length;
    return {
      totalFac,
      ganancia: totalFac * 0.01,
      count,
      ticket: count > 0 ? totalFac / count : 0,
    };
  }, [orders]);

  const chartData = useMemo(() => groupByMonth(orders), [orders]);

  const visibleOrders = showAll ? orders : orders.slice(0, 5);
  const hasMore = orders.length > 5;

  // ── Renderizado condicional ─────────────────────────────────────────────
  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div
        style={{ background: C.bg, minHeight: "100vh" }}
        className="flex flex-col items-center justify-center gap-4 px-6"
      >
        <AlertCircle size={36} strokeWidth={1.4} style={{ color: C.accent }} />
        <p className="text-center text-sm" style={{ color: C.textSec }}>
          {error}
        </p>
        <button
          onClick={fetchOrders}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: C.accent }}
        >
          <RefreshCw size={14} />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh" }}>

      {/* ── Header ── */}
      <div style={{ background: C.header, padding: "28px 24px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={20} color="#1E8FA8" strokeWidth={2} />
                <h1 className="text-xl font-bold text-white tracking-tight leading-none">
                  Panel de Ventas
                </h1>
              </div>
              <p className="text-sm" style={{ color: "#8BAEC0" }}>
                Seguimiento de tu actividad comercial
              </p>
            </div>
            <span
              className="text-xs font-semibold px-3 py-1.5 rounded-full shrink-0 mt-0.5"
              style={{ background: "rgba(30,143,168,0.18)", color: "#7FD4E8" }}
            >
              {currentMonthLabel()}
            </span>
          </div>
        </div>
      </div>

      {/* ── Cuerpo ── */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px 40px" }}>

        {/* ── Stat cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <StatCard
            icon={DollarSign}
            label="Total facturado"
            value={fmt(stats.totalFac)}
          />
          <StatCard
            icon={TrendingUp}
            label="Ganancia estimada"
            value={fmt(stats.ganancia)}
            teal
          />
          <StatCard
            icon={ShoppingBag}
            label="Órdenes"
            value={stats.count}
          />
          <StatCard
            icon={BarChart2}
            label="Ticket promedio"
            value={fmt(stats.ticket)}
          />
        </div>

        {/* ── Fila chart + lista ── */}
        {orders.length === 0 ? (
          /* Estado vacío */
          <div
            className="rounded-2xl flex flex-col items-center justify-center gap-3 py-20"
            style={{ background: "#fff", border: `1px solid ${C.border}` }}
          >
            <PackageOpen size={40} strokeWidth={1.2} style={{ color: C.border }} />
            <p className="text-sm font-medium" style={{ color: C.textSec }}>
              Aún no tenés órdenes
            </p>
            <p className="text-xs" style={{ color: "#A8C5D2" }}>
              Tus ventas aparecerán aquí cuando se registre la primera orden.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">

            {/* ── Gráfico de área ── */}
            <div
              className="md:col-span-3 rounded-2xl p-5"
              style={{ background: "#fff", border: `1px solid ${C.border}` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2
                    className="text-sm font-bold"
                    style={{ color: C.header }}
                  >
                    Facturación mensual
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: C.textSec }}>
                    {chartData.length > 0
                      ? `${chartData[0].mes} — ${chartData[chartData.length - 1].mes}`
                      : "Sin datos"}
                  </p>
                </div>
                <span
                  className="text-xs px-2 py-1 rounded-lg font-medium"
                  style={{ background: C.tealLight, color: C.accent }}
                >
                  MXN
                </span>
              </div>

              <ResponsiveContainer width="100%" height={200}>
                <AreaChart
                  data={chartData}
                  margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradTeal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#1E8FA8" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#1E8FA8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="mes"
                    tick={{ fontSize: 11, fill: C.textSec }}
                    axisLine={false}
                    tickLine={false}
                    dy={6}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: C.textSec }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`
                    }
                    width={42}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="#1E8FA8"
                    strokeWidth={2}
                    fill="url(#gradTeal)"
                    dot={{ r: 3, fill: "#1E8FA8", strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "#1E8FA8", strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* ── Órdenes recientes ── */}
            <div
              className="md:col-span-2 rounded-2xl overflow-hidden"
              style={{ background: "#fff", border: `1px solid ${C.border}` }}
            >
              <div
                className="px-4 py-3.5 border-b flex items-center justify-between"
                style={{ borderColor: C.border }}
              >
                <h2 className="text-sm font-bold" style={{ color: C.header }}>
                  Órdenes recientes
                </h2>
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: C.tealLight, color: C.accent }}
                >
                  {orders.length}
                </span>
              </div>

              <div>
                {visibleOrders.map((order) => (
                  <OrdenCard key={order.id} order={order} />
                ))}
              </div>

              {hasMore && (
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="w-full flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors"
                  style={{ color: C.accent, borderTop: `1px solid ${C.border}` }}
                >
                  {showAll ? (
                    <>
                      <ChevronUp size={14} />
                      Ver menos
                    </>
                  ) : (
                    <>
                      <ChevronDown size={14} />
                      Ver {orders.length - 5} más
                    </>
                  )}
                </button>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
