"use client";

/**
 * Mis Protocolos: el lugar donde el profesional encuentra todo su trabajo.
 *
 * Tres pestañas sobre la misma idea:
 *   · Enviados   → carritos del armador que ya salieron al paciente
 *   · Borradores → protocolos a medio armar, para seguir después
 *   · Plantillas → protocolos guardados para reutilizar
 *
 * Los enviados vienen del sharecart; borradores y plantillas de la tabla
 * `protocols`. Ambos se abren en el armador con ?fromProtocol=ID.
 */

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import {
  Stethoscope, CheckCircle2, TrendingUp, Search,
  FileClock, Bookmark, Trash2, ChevronRight,
} from "lucide-react";
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

// Tarjeta de un borrador o una plantilla. Misma forma que en el armador para
// que el profesional reconozca lo mismo en los dos lados.
function GuardadoCard({ protocolo, onAbrir, onBorrar }) {
  const [confirmando, setConfirmando] = useState(false);
  const productos = (protocolo.components || []).length;
  const fecha = new Date(protocolo.updated_at || protocolo.created_at)
    .toLocaleDateString("es-MX", { day: "numeric", month: "short" });

  return (
    <div className="bg-white border border-[#D0E4EC] rounded-xl p-4 flex items-start justify-between gap-3 hover:border-[#1E8FA8] transition-colors">
      <button onClick={() => onAbrir(protocolo)} className="text-left flex-1 min-w-0">
        <p className="text-sm font-bold text-[#1b3f7a] leading-snug line-clamp-2">{protocolo.name}</p>
        <p className="text-[11px] text-[#5B7A8C] mt-1">
          {productos} producto{productos !== 1 ? "s" : ""} · {fecha}
        </p>
        <p className="text-[11px] font-semibold text-[#1E8FA8] mt-2 flex items-center gap-1">
          Abrir en el armador <ChevronRight size={11} />
        </p>
      </button>
      {confirmando ? (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => onBorrar(protocolo.id)}
            className="text-[11px] font-semibold text-red-500 hover:underline">Borrar</button>
          <button onClick={() => setConfirmando(false)}
            className="text-[11px] text-[#8AAAB8] hover:text-[#1b3f7a]">No</button>
        </div>
      ) : (
        <button onClick={() => setConfirmando(true)} aria-label="Borrar"
          className="text-[#B0C8D4] hover:text-red-400 transition-colors shrink-0">
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}

// Panel de una pestaña de guardados (borradores o plantillas)
function PanelGuardados({ titulo, ayuda, icono: Icono, lista, vacio, pista, onAbrir, onBorrar }) {
  if (lista.length === 0) {
    return (
      <div className="bg-white border border-[#D0E4EC] rounded-2xl p-10 text-center">
        <Icono size={28} className="mx-auto mb-3 text-[#B0C8D4]" strokeWidth={1.5} />
        <p className="text-sm text-[#5B7A8C]">{vacio}</p>
        <p className="text-xs text-[#B0C8D4] mt-1">{pista}</p>
      </div>
    );
  }
  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <Icono size={14} className="text-[#1E8FA8]" />
        <h2 className="text-sm font-bold text-[#1b3f7a]">{titulo}</h2>
      </div>
      <p className="text-xs text-[#5B7A8C] mb-3">{ayuda}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {lista.map(p => (
          <GuardadoCard key={p.id} protocolo={p} onAbrir={onAbrir} onBorrar={onBorrar} />
        ))}
      </div>
    </section>
  );
}

export default function ProtocolosCompartidos() {
  const router = useRouter();
  const [carts, setCarts]     = useState([]);
  const [guardados, setGuardados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [tab, setTab]         = useState("enviados"); // enviados | borradores | plantillas
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

    // Borradores y plantillas propias: no bloquean la vista si fallan
    fetch(`/api/protocols?owner_id=${customerId}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setGuardados(d.protocols || []); })
      .catch(() => {});
  }, []);

  const borradores = useMemo(
    () => guardados.filter(p => p.status === "borrador"), [guardados]);
  const plantillas = useMemo(
    () => guardados.filter(p => p.status !== "borrador"), [guardados]);

  const abrirGuardado = useCallback(
    p => router.push(`/armador-carritos?fromProtocol=${p.id}`), [router]);

  const borrarGuardado = useCallback(async id => {
    const previos = guardados;
    setGuardados(g => g.filter(p => p.id !== id));
    const r = await fetch(`/api/protocols/${id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) setGuardados(previos); // si falla, lo devolvemos a la lista
  }, [guardados]);

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
      <PageHeader title="Mis Protocolos"
        subtitle="Lo que enviaste, lo que dejaste a medias y tus plantillas" />

      <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-6 space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-2xl px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Pestañas: enviados / borradores / plantillas */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {[
            { key: "enviados",   label: "Enviados",   icon: Stethoscope, n: carts.length },
            { key: "borradores", label: "Borradores", icon: FileClock,   n: borradores.length },
            { key: "plantillas", label: "Plantillas", icon: Bookmark,    n: plantillas.length },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
                tab === t.key
                  ? "bg-[#1b3f7a] text-white"
                  : "bg-white border border-[#D0E4EC] text-[#5B7A8C] hover:border-[#1E8FA8]"
              }`}>
              <t.icon size={13} />
              {t.label} <span className="tabular-nums opacity-60">{t.n}</span>
            </button>
          ))}
        </div>

        {tab === "enviados" && carts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard icon={Stethoscope}  label="Compartidos"     value={stats.total} />
            <StatCard icon={CheckCircle2} label="Con venta"       value={stats.vendidos}
              accent="text-emerald-600" />
            <StatCard icon={TrendingUp}   label="Valor generado"  value={fmtMXN(stats.valor)}
              accent="text-[#1E8FA8]" />
          </div>
        )}

        {tab === "enviados" && carts.length > 0 && (
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

        {tab === "enviados" && (
          <>
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
          </>
        )}

        {tab !== "enviados" && (
          <PanelGuardados
            titulo={tab === "borradores" ? "Continúa donde lo dejaste" : "Listos para reutilizar"}
            ayuda={tab === "borradores"
              ? "Protocolos a medio armar. Se abren en el armador con todo lo que ya elegiste."
              : "Los protocolos que guardaste como plantilla. Al abrirlos armas uno nuevo sin empezar de cero."}
            icono={tab === "borradores" ? FileClock : Bookmark}
            lista={tab === "borradores" ? borradores : plantillas}
            vacio={tab === "borradores"
              ? "No tienes borradores guardados"
              : "Todavía no guardaste ninguna plantilla"}
            pista={tab === "borradores"
              ? "Cuando armes un protocolo, usa «Guardar borrador» para seguirlo después"
              : "Desde el armador, guarda un protocolo como plantilla para reutilizarlo"}
            onAbrir={abrirGuardado}
            onBorrar={borrarGuardado}
          />
        )}
      </div>
    </div>
  );
}
