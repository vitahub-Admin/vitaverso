"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Send, Users, User, Smartphone } from "lucide-react";

export default function AdminNotificacionesPage() {
  const [title,    setTitle]    = useState("");
  const [body,     setBody]     = useState("");
  const [sending,  setSending]  = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [mode,     setMode]     = useState("all"); // "all" | "single"
  const [onlyWithApp, setOnlyWithApp] = useState(true);
  const [results,  setResults]  = useState([]);
  const [searching, setSearching] = useState(false);
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (mode !== "single") return;
    if (search.trim().length < 2) { setResults([]); return; }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({
          search: search.trim(),
          limit: "20",
          ...(onlyWithApp ? { has_app: "true" } : {}),
        });
        const res = await fetch(`/api/admin/affiliates?${params}`);
        const d   = await res.json();
        setResults(d.data ?? []);
      } catch {} finally {
        setSearching(false);
      }
    }, 350);
  }, [search, onlyWithApp, mode]);

  async function handleSend() {
    if (!title.trim() || !body.trim()) {
      setFeedback({ ok: false, msg: "Completá el título y el mensaje." });
      return;
    }
    if (mode === "single" && !selected) {
      setFeedback({ ok: false, msg: "Seleccioná un afiliado." });
      return;
    }

    setSending(true);
    setFeedback(null);

    try {
      const res  = await fetch("/api/admin/notifications/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          title: title.trim(),
          body:  body.trim(),
          target: mode === "single" ? String(selected.shopify_customer_id) : "all",
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setFeedback({
          ok: true,
          msg: mode === "single"
            ? `Notificación enviada a ${selected.nombre} ${selected.apellido}.`
            : "Notificación enviada a todos los afiliados.",
        });
        setTitle("");
        setBody("");
        setSelected(null);
        setSearch("");
      } else {
        setFeedback({ ok: false, msg: data.error ?? "Error al enviar." });
      }
    } catch {
      setFeedback({ ok: false, msg: "Error de red." });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="w-full border-b border-gray-100 bg-white px-6">
        <div className="max-w-[720px] mx-auto py-6 flex items-center gap-3">
          <Bell size={22} className="text-[#1b3f7a]" />
          <div>
            <h1 className="text-2xl font-extrabold text-[#1b3f7a] leading-none">
              Notificaciones
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Enviá mensajes push a tus afiliados
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-[720px] mx-auto px-6 py-8 flex flex-col gap-6">

        {/* Selector de destinatario */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-4">
          <p className="text-sm font-bold text-gray-700">Destinatario</p>
          <div className="flex gap-3">
            <button
              onClick={() => { setMode("all"); setSelected(null); setSearch(""); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-colors ${
                mode === "all"
                  ? "bg-[#1b3f7a] text-white border-[#1b3f7a]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-[#1b3f7a]/40"
              }`}
            >
              <Users size={16} />
              Todos los afiliados
            </button>
            <button
              onClick={() => setMode("single")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-colors ${
                mode === "single"
                  ? "bg-[#1b3f7a] text-white border-[#1b3f7a]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-[#1b3f7a]/40"
              }`}
            >
              <User size={16} />
              Afiliado específico
            </button>
          </div>

          {mode === "single" && (
            <div className="flex flex-col gap-2">
              {/* Toggle solo con app */}
              <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
                <div
                  onClick={() => { setOnlyWithApp((v) => !v); setResults([]); setSearch(""); }}
                  className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${onlyWithApp ? "bg-[#1b3f7a]" : "bg-gray-300"}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${onlyWithApp ? "translate-x-4" : "translate-x-0"}`} />
                </div>
                <Smartphone size={14} className="text-gray-500" />
                <span className="text-xs text-gray-500">Solo con app instalada</span>
              </label>

              {selected ? (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-[#1b3f7a]">{selected.first_name} {selected.last_name}</p>
                    <p className="text-xs text-gray-400">{selected.email}</p>
                  </div>
                  <button
                    onClick={() => { setSelected(null); setSearch(""); setResults([]); }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    placeholder="Buscar por nombre o email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]/30"
                  />
                  {search.length >= 2 && (
                    <div className="border border-gray-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                      {searching ? (
                        <p className="text-sm text-gray-400 px-4 py-3">Buscando...</p>
                      ) : results.length === 0 ? (
                        <p className="text-sm text-gray-400 px-4 py-3">Sin resultados</p>
                      ) : results.map((a) => (
                        <button
                          key={a.shopify_customer_id}
                          onClick={() => { setSelected(a); setSearch(""); setResults([]); }}
                          className="w-full text-left px-4 py-3 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center gap-2"
                        >
                          <span className="font-semibold text-gray-800">{a.first_name} {a.last_name}</span>
                          <span className="text-gray-400">{a.email}</span>
                          {a.push_token && <Smartphone size={12} className="text-[#1b3f7a] ml-auto shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Mensaje */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-700">Título</label>
            <input
              type="text"
              placeholder="Ej: ¡Nueva capacitación disponible!"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={65}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]/30"
            />
            <span className="text-xs text-gray-400 text-right">{title.length}/65</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-bold text-gray-700">Mensaje</label>
            <textarea
              placeholder="Escribí el cuerpo de la notificación..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={200}
              className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]/30 resize-none"
            />
            <span className="text-xs text-gray-400 text-right">{body.length}/200</span>
          </div>

          {feedback && (
            <div className={`rounded-xl px-4 py-3 text-sm font-medium ${
              feedback.ok
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-600 border border-red-200"
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
                {mode === "single" && selected
                  ? `Enviar a ${selected.first_name}`
                  : "Enviar a todos los afiliados"}
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
