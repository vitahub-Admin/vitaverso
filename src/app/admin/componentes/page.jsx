"use client";
import { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, Search, Filter } from "lucide-react";

const MAX_CHARS = 250;

export default function ComponentesAdmin() {
  const [items, setItems]   = useState([]);
  const [edits, setEdits]   = useState({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery]   = useState("");
  const [filtro, setFiltro] = useState("todos"); // "todos" | "sin"

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/admin/componentes")
      .then(r => r.json())
      .then(({ items: data }) => {
        setItems(data || []);
        const init = {};
        (data || []).forEach(c => {
          init[c.slug] = { text: c.descripcion || "", saving: false, saved: false, error: null, original: c.descripcion || "" };
        });
        setEdits(init);
        setLoading(false);
      });
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const handleChange = (slug, text) => {
    setEdits(prev => ({ ...prev, [slug]: { ...prev[slug], text, saved: false, error: null } }));
  };

  const handleSave = async (slug) => {
    const text = edits[slug]?.text ?? "";
    setEdits(prev => ({ ...prev, [slug]: { ...prev[slug], saving: true, error: null } }));

    const res  = await fetch("/api/admin/componentes", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ slug, descripcion: text }),
    });
    const data = await res.json();

    if (data.ok) {
      setEdits(prev => ({ ...prev, [slug]: { ...prev[slug], saving: false, saved: true, original: text } }));
      setItems(prev => prev.map(c => c.slug === slug ? { ...c, descripcion: text } : c));
    } else {
      setEdits(prev => ({ ...prev, [slug]: { ...prev[slug], saving: false, error: data.error } }));
    }
  };

  // ── Filtrado ───────────────────────────────────────────────────────────────
  const sinDescripcion = items.filter(c => !(edits[c.slug]?.original || "").trim()).length;

  const filtered = items.filter(c => {
    const edit = edits[c.slug] || {};
    if (filtro === "sin" && (edit.original || "").trim()) return false;
    if (!query.trim()) return true;
    return c.slug.toLowerCase().includes(query.toLowerCase()) ||
           (edit.text || "").toLowerCase().includes(query.toLowerCase());
  });

  // ── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F7F9FB]">

      {/* Header estándar */}
      <div className="bg-white border-b border-gray-100 px-6">
        <div className="max-w-[1200px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] leading-none mb-1">Componentes</h1>
          <p className="text-sm text-gray-400">Descripciones genéricas para PDFs de protocolos</p>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-4">

        {/* Barra de herramientas */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Stats pills */}
          <span className="bg-[#1b3f7a]/10 text-[#1b3f7a] text-xs font-bold px-3 py-1.5 rounded-full">
            {items.length} componentes
          </span>
          {sinDescripcion > 0 && (
            <button
              onClick={() => setFiltro(f => f === "sin" ? "todos" : "sin")}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full transition-all ${
                filtro === "sin"
                  ? "bg-amber-500 text-white"
                  : "bg-amber-100 text-amber-700 hover:bg-amber-200"
              }`}
            >
              <AlertCircle size={11} />
              {sinDescripcion} sin descripción
            </button>
          )}

          {/* Buscador */}
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              type="text"
              placeholder="Filtrar por nombre o contenido..."
              value={query}
              onChange={e => { setQuery(e.target.value); setFiltro("todos"); }}
              className="w-full pl-8 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]/20 shadow-sm"
            />
          </div>

          {filtro !== "todos" || query ? (
            <button
              onClick={() => { setFiltro("todos"); setQuery(""); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Limpiar filtros
            </button>
          ) : null}
        </div>

        {/* Conteo de resultados */}
        {(query || filtro !== "todos") && !loading && (
          <p className="text-xs text-gray-400">
            Mostrando {filtered.length} de {items.length} componentes
          </p>
        )}

        {/* Tabla */}
        {loading ? (
          <div className="flex items-center justify-center h-48 gap-2 text-gray-400 text-sm">
            <div className="w-4 h-4 border-2 border-[#1b3f7a] border-t-transparent rounded-full animate-spin" />
            Cargando componentes…
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80">
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest px-5 py-3 w-52">
                    Componente
                  </th>
                  <th className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest px-5 py-3">
                    Descripción
                  </th>
                  <th className="text-right text-[10px] font-bold text-gray-400 uppercase tracking-widest px-5 py-3 w-24">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center text-sm text-gray-300 py-12">
                      Sin resultados
                    </td>
                  </tr>
                ) : filtered.map(c => {
                  const edit    = edits[c.slug] || { text: "", saving: false, saved: false, error: null, original: "" };
                  const len     = (edit.text || "").length;
                  const isDirty = edit.text !== edit.original;
                  const isOver  = len > MAX_CHARS;
                  const isEmpty = !(edit.original || "").trim();

                  return (
                    <tr key={c.slug} className="hover:bg-[#F7F9FB]/60 transition-colors group">

                      {/* Nombre */}
                      <td className="px-5 py-4 align-top">
                        <p className="text-sm font-bold text-[#1b3f7a] leading-snug break-words">{c.slug}</p>
                        {isEmpty && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] text-amber-500 font-semibold">
                            <AlertCircle size={9} /> Sin descripción
                          </span>
                        )}
                      </td>

                      {/* Textarea */}
                      <td className="px-5 py-4 align-top">
                        <textarea
                          value={edit.text}
                          onChange={e => handleChange(c.slug, e.target.value)}
                          rows={3}
                          placeholder="Escribe la descripción del componente…"
                          className={`w-full text-sm text-gray-700 border rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 transition-all leading-relaxed placeholder:text-gray-200 ${
                            isOver
                              ? "border-red-300 bg-red-50/30 focus:ring-red-200"
                              : isDirty
                              ? "border-[#1b3f7a]/30 bg-[#F7F9FB] focus:ring-[#1b3f7a]/20"
                              : "border-gray-100 bg-gray-50/50 focus:ring-[#1b3f7a]/20"
                          }`}
                        />
                        <div className="flex items-center justify-between mt-1 px-0.5">
                          <div>
                            {edit.error && (
                              <p className="text-[11px] text-red-500">{edit.error}</p>
                            )}
                            {edit.saved && !isDirty && (
                              <span className="flex items-center gap-1 text-[11px] text-emerald-500 font-semibold">
                                <CheckCircle2 size={10} /> Guardado
                              </span>
                            )}
                          </div>
                          <span className={`text-[11px] font-mono tabular-nums ${
                            isOver        ? "text-red-500 font-bold"
                            : len > 220   ? "text-amber-500"
                            : len > 0     ? "text-gray-300"
                            : "text-gray-200"
                          }`}>
                            {len}/{MAX_CHARS}
                          </span>
                        </div>
                      </td>

                      {/* Botón guardar */}
                      <td className="px-5 py-4 align-top text-right">
                        <button
                          onClick={() => handleSave(c.slug)}
                          disabled={edit.saving || isOver || !isDirty}
                          className={`text-xs font-bold px-4 py-2 rounded-lg transition-all ${
                            edit.saving
                              ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : !isDirty && edit.saved
                              ? "bg-emerald-50 text-emerald-500 border border-emerald-200"
                            : isDirty && !isOver
                              ? "bg-[#1b3f7a] text-white hover:bg-[#162d60] active:scale-95"
                              : "bg-gray-100 text-gray-300 cursor-not-allowed"
                          }`}
                        >
                          {edit.saving ? "…" : !isDirty && edit.saved ? "✓" : "Guardar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}
