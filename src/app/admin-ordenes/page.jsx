"use client";

import { useEffect, useState } from "react";
import { Loader2, ExternalLink, TrendingUp, TrendingDown, Minus, AlertTriangle } from "lucide-react";
import Banner from "../components/Banner.jsx";

const MONTH_LABELS = {
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

function formatMonth(ym) {
  const [year, month] = ym.split("-");
  return `${MONTH_LABELS[month]} ${year}`;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function GrowthBadge({ value }) {
  if (value === null) return <span className="text-gray-300">—</span>;
  if (value > 0) return (
    <span className="inline-flex items-center gap-0.5 text-emerald-600 font-semibold text-xs">
      <TrendingUp size={12} />+{value}%
    </span>
  );
  if (value < 0) return (
    <span className="inline-flex items-center gap-0.5 text-red-400 font-semibold text-xs">
      <TrendingDown size={12} />{value}%
    </span>
  );
  return <span className="inline-flex items-center gap-0.5 text-gray-400 text-xs"><Minus size={12} />0%</span>;
}

export default function AdminOrdenesPage() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    fetch("/api/admin/ordenes")
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={28} className="animate-spin text-[#1b3f7a]" />
    </div>
  );

  if (error) return (
    <div className="p-6 text-center text-red-500 text-sm">{error}</div>
  );

  const { suspect = [], monthly = [], corrected_total = 0 } = data;

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Banner />

      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[1100px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
            Órdenes
          </h1>
          <p className="text-sm text-gray-400 font-medium">
            Panel admin — órdenes sospechosas y evolución mensual
          </p>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 py-8 flex flex-col gap-10">

        {/* ── Tabla mensual ─────────────────────────────────────────── */}
        <section>
          <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-4">
            Evolución mensual — últimos 12 meses
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-400 text-xs font-semibold uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Mes</th>
                  <th className="px-4 py-3 text-right">Total órdenes</th>
                  <th className="px-4 py-3 text-right">Con especialista</th>
                  <th className="px-4 py-3 text-right">Sospechosas</th>
                  <th className="px-4 py-3 text-right">% con esp.</th>
                  <th className="px-4 py-3 text-right">vs mes ant.</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((row, i) => (
                  <tr
                    key={row.month}
                    className={`border-t border-gray-50 ${i === 0 ? "bg-[#1b3f7a]/[0.03] font-medium" : "hover:bg-gray-50/60"} transition`}
                  >
                    <td className="px-4 py-3 text-gray-700">{formatMonth(row.month)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-800">{row.total.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{row.with_specialist.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={row.suspect > 0 ? "text-amber-500" : "text-gray-400"}>
                        {row.suspect.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={`
                        inline-block px-2 py-0.5 rounded-full text-xs font-semibold
                        ${row.pct_specialist >= 60 ? "bg-emerald-50 text-emerald-700"
                          : row.pct_specialist >= 30 ? "bg-amber-50 text-amber-600"
                          : "bg-red-50 text-red-500"}
                      `}>
                        {row.pct_specialist}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <GrowthBadge value={row.growth} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Sospechosas últimos 30 días ───────────────────────────── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={14} className="text-amber-500" />
            <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-400">
              Órdenes sospechosas — últimos 30 días
            </h2>
            {suspect.length > 0 && (
              <span className="ml-1 bg-amber-100 text-amber-600 text-[10px] font-bold px-2 py-0.5 rounded-full">
                {suspect.length}
              </span>
            )}
          </div>

          {suspect.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-12 border border-gray-100 rounded-2xl">
              Sin órdenes sospechosas en los últimos 30 días
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-400 text-xs font-semibold uppercase tracking-wide">
                    <th className="px-4 py-3 text-left">Orden</th>
                    <th className="px-4 py-3 text-left">Cliente</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-left">Share cart</th>
                    <th className="px-4 py-3 text-left">Fecha</th>
                    <th className="px-4 py-3 text-center">Shopify</th>
                  </tr>
                </thead>
                <tbody>
                  {suspect.map(o => (
                    <tr key={o.order_id} className="border-t border-gray-50 hover:bg-amber-50/40 transition">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{o.order_name || `#${o.order_id}`}</td>
                      <td className="px-4 py-3 text-gray-700">{o.customer_name || "—"}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{o.customer_email || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-800">
                        ${Number(o.total).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        {o.share_cart
                          ? <span className="font-mono text-[11px] bg-gray-100 px-2 py-0.5 rounded text-gray-600">{o.share_cart}</span>
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{formatDate(o.shopify_created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        <a
                          href={o.shopify_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[#1b3f7a] hover:underline text-xs font-medium"
                        >
                          Ver <ExternalLink size={11} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── Corregidas automáticamente ───────────────────────────── */}
        <section className="flex items-center justify-between border border-gray-100 rounded-2xl px-6 py-4 bg-gray-50/50">
          <div>
            <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-0.5">
              Órdenes corregidas automáticamente
            </p>
            <p className="text-xs text-gray-400">
              Llegaron sin especialista pero se rescataron vía share cart
            </p>
          </div>
          <span className="text-2xl font-extrabold text-[#1b3f7a] tabular-nums">
            {corrected_total.toLocaleString()}
          </span>
        </section>

      </div>
    </div>
  );
}
