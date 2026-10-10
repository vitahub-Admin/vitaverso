"use client";

// Notificaciones a clientes de la app Mi Vitahub: envío + historial de campañas
// con destinatarios, enviados, leídas y abiertas.
import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Users, User, Smartphone, Stethoscope, RefreshCw } from "lucide-react";

const MODOS = [
  { key: "all",          label: "Todos los clientes",     icon: Users },
  { key: "con_app",      label: "Solo con notificaciones", icon: Smartphone },
  { key: "usuario",      label: "Cliente específico",     icon: User },
  { key: "especialista", label: "Pacientes de un profesional", icon: Stethoscope },
];

function pct(n, total) {
  if (!total) return "—";
  return `${Math.round((n / total) * 100)}%`;
}

function fecha(iso) {
  return new Date(iso).toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function audienciaTexto(a) {
  if (!a) return "";
  if (a.tipo === "all") return "Todos";
  if (a.tipo === "con_app") return "Con notificaciones";
  if (a.tipo === "usuario") return "1 cliente";
  if (a.tipo === "especialista") return `Pacientes de ${a.especialista}`;
  if (a.tipo === "emails") return `${a.emails?.length ?? 0} correos`;
  return a.tipo;
}

export default function ClientesNotificaciones() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState("all");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [campanas, setCampanas] = useState([]);
  const [totales, setTotales] = useState(null);
  const [loadingHist, setLoadingHist] = useState(true);
  const debounceRef = useRef(null);

  const cargarHistorial = useCallback(async () => {
    setLoadingHist(true);
    try {
      const [h, u] = await Promise.all([
        fetch("/api/admin/customer-notifications").then((r) => r.json()),
        fetch("/api/admin/customer-app-users?limit=1").then((r) => r.json()),
      ]);
      setCampanas(h.campanas ?? []);
      setTotales(u.ok ? { total: u.total, conApp: u.con_app } : null);
    } catch {} finally {
      setLoadingHist(false);
    }
  }, []);

  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);

  // Búsqueda de cliente o de profesional según el modo
  useEffect(() => {
    if (mode !== "usuario" && mode !== "especialista") return;
    if (search.trim().length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ search: search.trim(), limit: "20" });
        const endpoint = mode === "usuario" ? "/api/admin/customer-app-users" : "/api/admin/affiliates";
        const d = await fetch(`${endpoint}?${params}`).then((r) => r.json());
        setResults(d.data ?? []);
      } catch {} finally {
        setSearching(false);
      }
    }, 350);
  }, [search, mode]);

  function cambiarModo(m) {
    setMode(m);
    setSelected(null);
    setSearch("");
    setResults([]);
  }

  function target() {
    if (mode === "usuario") return { usuario: selected.id };
    if (mode === "especialista") return { especialista: selected.shopify_customer_id };
    return mode;
  }

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      setFeedback({ ok: false, msg: "Completa el título y el mensaje." });
      return;
    }
    if ((mode === "usuario" || mode === "especialista") && !selected) {
      setFeedback({ ok: false, msg: mode === "usuario" ? "Selecciona un cliente." : "Selecciona un profesional." });
      return;
    }
    if (mode === "all" || mode === "con_app") {
      const n = mode === "all" ? totales?.total : totales?.conApp;
      if (!window.confirm(`Se va a enviar a ${n ?? "todos los"} clientes. ¿Continuar?`)) return;
    }

    setSending(true);
    setFeedback(null);
    try {
      const d = await fetch("/api/admin/customer-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), url: url.trim() || undefined, target: target() }),
      }).then((r) => r.json());

      if (d.ok) {
        setFeedback({
          ok: true,
          msg: `Enviada a ${d.destinatarios} cliente${d.destinatarios !== 1 ? "s" : ""}: ${d.enviados} con push, ${d.sin_token} solo en su historial${d.fallidos ? `, ${d.fallidos} fallidas` : ""}.`,
        });
        setTitle(""); setBody(""); setUrl(""); setSelected(null); setSearch("");
        cargarHistorial();
      } else {
        setFeedback({ ok: false, msg: d.error ?? "Error al enviar." });
      }
    } catch {
      setFeedback({ ok: false, msg: "Error de red." });
    } finally {
      setSending(false);
    }
  }

  const nombreSel = selected
    ? mode === "usuario"
      ? [selected.first_name, selected.last_name].filter(Boolean).join(" ") || selected.email
      : `${selected.first_name ?? ""} ${selected.last_name ?? ""}`.trim()
    : "";

  return (
    <div className="flex flex-col gap-6">
      {totales ? (
        <p className="text-xs text-[#5B7A8C]">
          <span className="font-bold text-[#1b3f7a] tabular-nums">{totales.total}</span> clientes con cuenta ·{" "}
          <span className="font-bold text-[#1b3f7a] tabular-nums">{totales.conApp}</span> con notificaciones activas.
          Quien no tiene push la recibe igual en su historial dentro de la app.
        </p>
      ) : null}

      {/* Destinatario */}
      <div className="bg-white rounded-2xl border border-[#D0E4EC] p-6 flex flex-col gap-4">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Destinatario</p>
        <div className="grid grid-cols-2 gap-3">
          {MODOS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => cambiarModo(key)}
              className={`flex items-center justify-center gap-2 py-3 px-2 rounded-xl border text-sm font-bold transition-colors ${
                mode === key
                  ? "bg-[#1b3f7a] text-white border-[#1b3f7a]"
                  : "bg-white text-[#5B7A8C] border-[#D0E4EC] hover:border-[#1E8FA8]"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {(mode === "usuario" || mode === "especialista") && (
          selected ? (
            <div className="flex items-center justify-between bg-[#E6F4F8] border border-[#C2DFE8] rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-bold text-[#1b3f7a]">{nombreSel}</p>
                <p className="text-xs text-[#5B7A8C]">{selected.email}</p>
              </div>
              <button onClick={() => { setSelected(null); setSearch(""); }} className="text-xs text-[#5B7A8C] underline">
                Cambiar
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                placeholder={mode === "usuario" ? "Buscar cliente por nombre o correo..." : "Buscar profesional por nombre o correo..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border border-[#D0E4EC] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E8FA8]/30"
              />
              {search.length >= 2 && (
                <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[#D0E4EC] rounded-xl overflow-hidden max-h-56 overflow-y-auto shadow-lg">
                  {searching ? (
                    <p className="text-sm text-[#8AAAB8] px-4 py-3">Buscando...</p>
                  ) : results.length === 0 ? (
                    <p className="text-sm text-[#8AAAB8] px-4 py-3">Sin resultados</p>
                  ) : results.map((r) => (
                    <button
                      key={r.id ?? r.shopify_customer_id}
                      onClick={() => { setSelected(r); setSearch(""); setResults([]); }}
                      className="w-full text-left px-4 py-3 text-sm hover:bg-[#F4FAFB] border-b border-[#EEF3F7] last:border-0 flex items-center gap-2"
                    >
                      <span className="font-semibold text-[#1b3f7a]">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "Sin nombre"}</span>
                      <span className="text-[#8AAAB8]">{r.email}</span>
                      {(r.has_push || r.push_token) && <Smartphone size={12} className="text-[#1E8FA8] ml-auto shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Mensaje */}
      <div className="bg-white rounded-2xl border border-[#D0E4EC] p-6 flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Título</label>
          <input
            type="text"
            placeholder="Ej: 20% en tu Omega 3 este fin de semana"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={65}
            className="border border-[#D0E4EC] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E8FA8]/30"
          />
          <span className="text-xs text-[#B0C8D4] text-right tabular-nums">{title.length}/65</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Mensaje</label>
          <textarea
            placeholder="Escribe el cuerpo de la notificación..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={240}
            className="border border-[#D0E4EC] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E8FA8]/30 resize-none"
          />
          <span className="text-xs text-[#B0C8D4] text-right tabular-nums">{body.length}/240</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">
            Link <span className="normal-case tracking-normal font-normal text-[#B0C8D4]">(opcional)</span>
          </label>
          <input
            type="url"
            placeholder="https://vitahub.mx/collections/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="border border-[#D0E4EC] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E8FA8]/30"
          />
          <span className="text-xs text-[#B0C8D4]">Se abre cuando el cliente toca la notificación.</span>
        </div>

        {feedback && (
          <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
            feedback.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200"
          }`}>
            {feedback.msg}
          </div>
        )}

        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center justify-center gap-2 bg-[#1b3f7a] hover:bg-[#2a5298] disabled:opacity-60 text-white font-bold rounded-xl px-6 py-3 text-sm transition-colors"
        >
          {sending ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send size={16} />
              {selected ? `Enviar a ${nombreSel}` : mode === "con_app" ? "Enviar a clientes con notificaciones" : "Enviar a todos los clientes"}
            </>
          )}
        </button>
      </div>

      {/* Historial */}
      <div className="bg-white rounded-2xl border border-[#D0E4EC] overflow-hidden">
        <div className="px-6 py-4 border-b border-[#EEF3F7] flex items-center justify-between">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Historial de envíos a clientes</p>
          <button onClick={cargarHistorial} className="text-[#5B7A8C] hover:text-[#1b3f7a]" aria-label="Actualizar">
            <RefreshCw size={14} className={loadingHist ? "animate-spin" : ""} />
          </button>
        </div>
        {campanas.length === 0 ? (
          <p className="text-sm text-[#8AAAB8] px-6 py-6">{loadingHist ? "Cargando..." : "Todavía no hay envíos."}</p>
        ) : (
          <div className="max-h-[480px] overflow-y-auto divide-y divide-[#EEF3F7]">
            {campanas.map((c) => (
              <div key={c.id} className="px-6 py-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#1b3f7a]">{c.title}</p>
                    <p className="text-xs text-[#5B7A8C] leading-relaxed">{c.body}</p>
                  </div>
                  <span className="text-[11px] text-[#8AAAB8] whitespace-nowrap">{fecha(c.created_at)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span className="text-[#8AAAB8]">{audienciaTexto(c.audience)}{c.source === "webhook" ? " · automatización" : ""}</span>
                  <span className="text-[#5B7A8C]">Destinatarios <b className="tabular-nums text-[#1b3f7a]">{c.destinatarios}</b></span>
                  <span className="text-[#5B7A8C]">Push <b className="tabular-nums text-[#1b3f7a]">{c.enviados}</b></span>
                  <span className="text-[#5B7A8C]">Leídas <b className="tabular-nums text-[#1b3f7a]">{c.leidas}</b> <span className="text-[#8AAAB8]">({pct(c.leidas, c.destinatarios)})</span></span>
                  <span className="text-[#5B7A8C]">Abiertas <b className="tabular-nums text-[#1E8FA8]">{c.abiertas}</b> <span className="text-[#8AAAB8]">({pct(c.abiertas, c.destinatarios)})</span></span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
