"use client";

import { useEffect, useState } from "react";
import { History, Users, User, Bot, ShieldCheck, Cog, RefreshCw } from "lucide-react";

const ORIGEN = {
  admin:   { etiqueta: "Equipo",  icono: ShieldCheck },
  agente:  { etiqueta: "Agente",  icono: Bot },
  sistema: { etiqueta: "Sistema", icono: Cog },
};

const FILTROS = [
  { key: "manuales", label: "Equipo y agentes" },
  { key: "admin",    label: "Equipo" },
  { key: "agente",   label: "Agentes" },
  { key: "sistema",  label: "Automáticos" },
  { key: "todos",    label: "Todos" },
];

const fecha = (iso) =>
  new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function HistorialEnvios() {
  const [envios,  setEnvios]  = useState(null);
  const [error,   setError]   = useState(null);
  const [cargando, setCargando] = useState(false);
  const [filtro,  setFiltro]  = useState("manuales");
  const [alcance, setAlcance] = useState("todos"); // todos | masivo | personalizado

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/notifications/envios?limit=100");
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || "No se pudo leer el historial");
      setEnvios(d.envios);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  const visibles = (envios || []).filter(e => {
    if (filtro === "manuales" && e.origen === "sistema") return false;
    if (["admin", "agente", "sistema"].includes(filtro) && e.origen !== filtro) return false;
    if (alcance !== "todos" && e.alcance !== alcance) return false;
    return true;
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History size={16} className="text-[#1b3f7a]" />
          <p className="text-sm font-bold text-gray-700">Historial de envíos</p>
        </div>
        <button
          onClick={cargar}
          disabled={cargando}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#1b3f7a] disabled:opacity-50"
        >
          <RefreshCw size={13} className={cargando ? "animate-spin" : ""} /> Actualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              filtro === f.key
                ? "bg-[#1b3f7a] text-white border-[#1b3f7a]"
                : "bg-white text-gray-600 border-gray-200 hover:border-[#1b3f7a]/40"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="w-px bg-gray-200 mx-1" />
        {[["todos", "Cualquier alcance"], ["masivo", "Masivos"], ["personalizado", "Personalizados"]].map(([k, l]) => (
          <button
            key={k}
            onClick={() => setAlcance(k)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              alcance === k
                ? "bg-[#2BB9B8] text-[#0D2133] border-[#2BB9B8]"
                : "bg-white text-gray-600 border-gray-200 hover:border-[#2BB9B8]/40"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {envios === null && !error && <p className="text-sm text-gray-400">Cargando…</p>}

      {envios && visibles.length === 0 && (
        <p className="text-sm text-gray-400">
          No hay envíos con ese filtro. Solo aparecen los que se mandaron después de activar el registro.
        </p>
      )}

      <div className="flex flex-col divide-y divide-gray-100">
        {visibles.map(e => {
          const o = ORIGEN[e.origen] || ORIGEN.sistema;
          const Icono = o.icono;
          const masivo = e.alcance === "masivo";
          const quien =
            e.origen === "admin"  ? (e.enviado_por_nombre || "Persona del equipo") :
            e.origen === "agente" ? (e.agente || "Agente sin nombre") :
            "Plataforma";
          const aQuien = masivo
            ? `${e.destinatarios || e.registrados} profesionales`
            : (e.destinatario_nombre || "1 profesional");

          return (
            <div key={e.envio_id} className="py-3 flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-bold text-gray-800 leading-snug">{e.title}</p>
                <span className="text-[11px] text-gray-400 shrink-0 tabular-nums">{fecha(e.creado)}</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">{e.body}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
                <span className="flex items-center gap-1">
                  <Icono size={12} className="text-[#1b3f7a]" />
                  <span className="font-semibold text-gray-700">{o.etiqueta}</span> · {quien}
                </span>
                <span className="flex items-center gap-1">
                  {masivo ? <Users size={12} className="text-[#1F8383]" /> : <User size={12} className="text-[#1F8383]" />}
                  <span className={`font-bold ${masivo ? "text-[#1F8383]" : "text-gray-700"}`}>
                    {masivo ? "Masivo" : "Personalizado"}
                  </span> · {aQuien}
                </span>
                <span className="tabular-nums">
                  Leídas: {e.leidos} de {e.registrados}
                </span>
                {e.evento && <span className="text-gray-400">evento: {e.evento}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
