"use client";

/**
 * Historial de protocolos compartidos.
 *
 * Es la sección que vivía al fondo de Analytics, ahora con página propia y
 * acotada a los carritos nacidos del armador. Sin gráficos: acá se viene a
 * buscar un protocolo puntual, no a mirar tendencias.
 */

import { useEffect, useState, useMemo } from "react";
import Cookies from "js-cookie";
import { Stethoscope, CheckCircle2, TrendingUp, Search } from "lucide-react";
import CartRow, { fmtMXN } from "../components/CartRow";
import PageHeader from "../components/PageHeader";

// Mismo criterio que /vitahuber: los tres valores marcan carritos del armador.
// "armador-carritos" y "armador-checkout" son etiquetas históricas que quedaron
// en registros viejos; hoy solo se escribe "protocolo".
const esProtocolo = (origen) =>
  origen === "protocolo" || origen === "armador-carritos" || origen === "armador-checkout";

function StatCard({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-white border border-[#D0E4EC] rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-[#E6F4F8] flex items-center justify-center">
          <Icon size={16} className="text-[#1E8FA8]" />
        </div>
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">
          {label}
        </span>
      </div>
      <p className={`text-2xl font-extrabold tabular-nums leading-none ${accent || "text-[#1b3f7a]"}`}>
        {value}
      </p>
    </div>
  );
}

export default function ProtocolosCompartidos() {
  const [carts, setCarts]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [filtro, setFiltro]   = useState("todos"); // todos | vendidos | pendientes
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    const customerId = Cookies.get("customerId");
    if (!customerId) { setError("Sesión no encontrada"); setLoading(false); return; }

    fetch(`/api/sharecart/merged/${customerId}`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) throw new Error(d.message || "Error cargando protocolos");
        // Analytics descarta `extra` al mapear; acá lo necesitamos para filtrar
        setCarts((d.data || []).filter(c => esProtocolo(c.extra?.origen)));
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    const vendidos = carts.filter(c => c.has_sale).length;
    const valor    = carts.reduce((a, c) => a + (Number(c.items_value) || 0), 0);
    return { total: carts.length, vendidos, valor };
  }, [carts]);

  const visibles = useMemo(() => {
    let out = carts;
    if (filtro === "vendidos")   out = out.filter(c => c.has_sale);
    if (filtro === "pendientes") out = out.filter(c => !c.has_sale);
    const q = busqueda.trim().toLowerCase();
    if (q) out = out.filter(c => (c.client_name || "").toLowerCase().includes(q));
    return out;
  }, [carts, filtro, busqueda]);

  const PILLS = [
    { key: "todos",      label: "Todos",      n: carts.length },
    { key: "vendidos",   label: "Vendidos",   n: stats.vendidos },
    { key: "pendientes", label: "Pendientes", n: carts.length - stats.vendidos },
  ];

  if (loading) {
    return (
      <div className="min-h-full bg-[#F7F9FB] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-[#B0C8D4]">
          <div className="w-8 h-8 rounded-full border-[3px] border-[#D0E4EC] border-t-[#1E8FA8] animate-spin" />
          <p className="text-sm">Cargando protocolos…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#F7F9FB]">
      <PageHeader title="Protocolos Compartidos"
        subtitle="Todo lo que enviaste desde el armador" />

      <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {carts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard icon={Stethoscope}  label="Compartidos"     value={stats.total} />
            <StatCard icon={CheckCircle2} label="Con venta"       value={stats.vendidos}
              accent="text-emerald-600" />
            <StatCard icon={TrendingUp}   label="Valor generado"  value={fmtMXN(stats.valor)}
              accent="text-[#1E8FA8]" />
          </div>
        )}

        {carts.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-1.5">
              {PILLS.map(p => (
                <button key={p.key} onClick={() => setFiltro(p.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    filtro === p.key
                      ? "bg-[#1b3f7a] text-white"
                      : "bg-white border border-[#D0E4EC] text-[#5B7A8C] hover:border-[#1E8FA8]"
                  }`}>
                  {p.label} <span className="tabular-nums opacity-60">{p.n}</span>
                </button>
              ))}
            </div>
            <div className="relative sm:ml-auto sm:w-64">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B0C8D4]" />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar por paciente…"
                className="w-full bg-white border border-[#D0E4EC] rounded-lg pl-9 pr-3 py-1.5 text-xs
                  text-[#1b3f7a] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8]"
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          {visibles.map(cart => <CartRow key={cart.token} cart={cart} />)}
        </div>

        {visibles.length === 0 && (
          <div className="bg-white border border-[#D0E4EC] rounded-2xl p-10 text-center">
            <Stethoscope size={28} className="mx-auto mb-3 text-[#B0C8D4]" strokeWidth={1.5} />
            <p className="text-sm text-[#5B7A8C]">
              {carts.length === 0
                ? "Todavía no compartiste ningún protocolo"
                : "Ningún protocolo coincide con el filtro"}
            </p>
            {carts.length === 0 && (
              <p className="text-xs text-[#B0C8D4] mt-1">
                Los protocolos que armes y envíes aparecen aquí
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
