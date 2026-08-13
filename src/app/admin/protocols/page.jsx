"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Trash2, ChevronDown, ChevronUp, Save,
  Globe, Lock, Package, Search, X, Check, User, Eye,
} from "lucide-react";

// ── Precio formateado ─────────────────────────────────────────
function fmt(price) {
  if (!price && price !== 0) return "";
  return new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", maximumFractionDigits: 0,
  }).format(price);
}

// ── Modal preview de producto ─────────────────────────────────
function ProductPreviewModal({ productId, title, onClose }) {
  const [html, setHtml]       = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/product-catalog?description=${productId}`)
      .then(r => r.json())
      .then(d => setHtml(d.descriptionHtml || "<p>Sin descripción</p>"))
      .finally(() => setLoading(false));
  }, [productId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-800 line-clamp-1">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-3 shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Contenido */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-10">Cargando descripción...</p>
          ) : (
            <div
              className="prose prose-sm max-w-none text-gray-700 [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-200 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-gray-50 [&_th]:font-semibold"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Card de producto ──────────────────────────────────────────
function ProductCard({ item, selected, onToggle }) {
  const [preview, setPreview] = useState(false);
  const showDesde  = item.variant_count > 1 && item.min_price !== item.price;
  const priceLabel = showDesde
    ? `desde ${fmt(item.min_price)}`
    : fmt(item.price);

  return (
    <>
      {preview && (
        <ProductPreviewModal
          productId={item.product_id}
          title={item.title}
          onClose={() => setPreview(false)}
        />
      )}

      <div
        onClick={() => onToggle(item)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onToggle(item)}
        className={`relative text-left rounded-xl border overflow-hidden transition-all hover:shadow-md cursor-pointer ${
          selected
            ? "border-[#1e3a5f] ring-2 ring-[#1e3a5f]/20 shadow-md"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        {/* Imagen */}
        <div className="aspect-square bg-gray-50 relative overflow-hidden">
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-200">
              <Package size={32} />
            </div>
          )}
          {/* Badge Pro flotante — esquina superior izquierda */}
          {item.is_professional && (
            <span className="absolute top-2 left-2 bg-[#1e8fa8] text-white text-sm font-normal px-3 py-1.5 rounded-full shadow-md ring-2 ring-white/60 tracking-widest leading-none">
              PRO
            </span>
          )}
          {selected && (
            <div className="absolute top-2 right-2 w-6 h-6 bg-[#1e3a5f] rounded-full flex items-center justify-center shadow-md">
              <Check size={12} className="text-white" />
            </div>
          )}
          {/* Badge comisión — esquina inferior izquierda */}
          {(() => {
            const pct = item.commission_percent ?? 0;
            return (
              <span className={`absolute bottom-2 left-2 text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-md ring-2 ring-white/60 leading-none ${
                pct > 0 ? "bg-emerald-500" : "bg-gray-400"
              }`}>
                {pct}%
              </span>
            );
          })()}
          {/* Eye button */}
          <button
            onClick={e => { e.stopPropagation(); setPreview(true); }}
            className="absolute bottom-2 right-2 w-7 h-7 bg-white/90 hover:bg-white rounded-full flex items-center justify-center shadow-sm text-gray-500 hover:text-[#1e3a5f] transition-all"
            title="Ver descripción"
          >
            <Eye size={13} />
          </button>
        </div>

      {/* Info */}
      <div className="p-2.5">
        <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug">
          {item.title}
        </p>
        {item.variant_title && (
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">{item.variant_title}</p>
        )}
        {item.brand && (
          <p className="text-[11px] text-[#1e8fa8] mt-1 truncate font-medium">{item.brand}</p>
        )}
        {/* Ingrediente principal */}
        {item.primary_ingredient && (
          <p className="text-[11px] text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 mt-1.5 truncate font-medium">
            {item.primary_ingredient}
            {item.primary_amount && ` ${item.primary_amount}${item.primary_unit ?? ''}`}
          </p>
        )}
        {priceLabel && (
          <p className="text-xs font-bold text-gray-700 mt-1">{priceLabel}</p>
        )}
      </div>
    </div>
    </>
  );
}

// ── Editor de un componente ───────────────────────────────────
function ComponentEditor({ comp, index, onUpdate, onRemove, componentes }) {
  const [products, setProducts]       = useState([]);
  const [loadingProds, setLoadingProds] = useState(false);
  const [open, setOpen]               = useState(true);
  const [compSearch, setCompSearch]   = useState(comp.componente || "");
  const [rankBy, setRankBy]           = useState("");

  // Cargar productos cuando cambia el componente seleccionado
  useEffect(() => {
    if (!comp.componente) { setProducts([]); setRankBy(""); return; }
    setLoadingProds(true);
    setRankBy("");
    fetch(`/api/product-catalog?componente=${encodeURIComponent(comp.componente)}`)
      .then(r => r.json())
      .then(d => setProducts(d.items || []))
      .finally(() => setLoadingProds(false));
  }, [comp.componente]);

  // Actualizar buscador cuando el componente se resetea externamente
  useEffect(() => {
    if (!comp.componente) setCompSearch("");
  }, [comp.componente]);

  const filteredComps = componentes.filter(c =>
    c.name.toLowerCase().includes(compSearch.toLowerCase())
  );

  // Nutrientes únicos disponibles en los productos cargados
  const availableNutrients = [...new Set(
    products.flatMap(p => (p.nutrients || []).map(n => n.name))
  )].sort((a, b) => a.localeCompare(b));

  // Productos ordenados por nutriente seleccionado (mayor concentración primero)
  const sortedProducts = rankBy
    ? [...products].sort((a, b) => {
        const amtA = (a.nutrients || []).find(n => n.name === rankBy)?.amount ?? -1;
        const amtB = (b.nutrients || []).find(n => n.name === rankBy)?.amount ?? -1;
        return amtB - amtA;
      })
    : products;

  const selectComponent = (name) => {
    setCompSearch(name);
    onUpdate({ ...comp, componente: name, items: [] });
  };

  const clearComponent = () => {
    setCompSearch("");
    onUpdate({ ...comp, componente: "", items: [] });
  };

  const toggleItem = (item) => {
    const exists = comp.items.find(i => i.variant_id === item.variant_id);
    const next   = exists
      ? comp.items.filter(i => i.variant_id !== item.variant_id)
      : [
          ...comp.items,
          {
            variant_id:    item.variant_id,
            product_id:    item.product_id,
            title:         item.title,
            variant_title: item.variant_title,
            sku:           item.sku,
          },
        ];
    onUpdate({ ...comp, items: next });
  };

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
        <span className="w-6 h-6 rounded-full bg-[#1e3a5f] text-white text-xs flex items-center justify-center font-bold shrink-0">
          {index + 1}
        </span>

        <input
          value={comp.label || ""}
          onChange={e => onUpdate({ ...comp, label: e.target.value })}
          placeholder="Etiqueta (opcional)"
          className="flex-1 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#1e3a5f] min-w-0"
        />

        <button onClick={() => setOpen(o => !o)} className="text-gray-400 hover:text-gray-600">
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <button onClick={onRemove} className="text-gray-300 hover:text-red-500 transition-colors">
          <Trash2 size={16} />
        </button>
      </div>

      {open && (
        <div className="p-4 space-y-4">
          {/* Selector de componente */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Componente principal
            </p>

            {/* Search input */}
            <div className="relative mb-2">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={compSearch}
                onChange={e => { setCompSearch(e.target.value); }}
                placeholder="Buscar componente..."
                className="w-full pl-8 pr-8 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#1e3a5f] bg-white"
              />
              {compSearch && (
                <button
                  onClick={clearComponent}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Chips */}
            {(() => {
              const visibles = compSearch
                ? filteredComps
                : filteredComps.filter(c => c.count >= 25);
              return (
                <div className="max-h-36 overflow-y-auto">
                  {!compSearch && (
                    <p className="text-xs text-gray-400 px-1 mb-1.5">
                      Más populares · <span className="italic">buscá para ver todos</span>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5 p-1">
                    {visibles.length === 0 && (
                      <p className="text-xs text-gray-400 py-2 px-1">Sin resultados</p>
                    )}
                    {visibles.map(c => (
                      <button
                        key={c.name}
                        onClick={() => selectComponent(c.name)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          comp.componente === c.name
                            ? "bg-[#1e3a5f] text-white border-[#1e3a5f] shadow-sm"
                            : "bg-white text-gray-600 border-gray-200 hover:border-[#1e3a5f] hover:text-[#1e3a5f]"
                        }`}
                      >
                        {c.name}
                        <span className={`ml-1.5 ${comp.componente === c.name ? "text-blue-200" : "text-gray-400"}`}>
                          {c.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Productos */}
          {comp.componente && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Productos disponibles
                </p>
                {comp.items.length > 0 && (
                  <span className="text-xs text-[#1e3a5f] font-semibold">
                    {comp.items.length} seleccionado{comp.items.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Ordenar por nutriente */}
              {availableNutrients.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] text-gray-400 shrink-0">Ordenar por</span>
                  <select
                    value={rankBy}
                    onChange={e => setRankBy(e.target.value)}
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1e3a5f] bg-white text-gray-700"
                  >
                    <option value="">— sin ordenar —</option>
                    {availableNutrients.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  {rankBy && (
                    <button
                      onClick={() => setRankBy("")}
                      className="text-gray-300 hover:text-gray-500 shrink-0"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}

              {loadingProds ? (
                <p className="text-sm text-gray-400 text-center py-6">Cargando...</p>
              ) : products.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">
                  Sin productos catalogados para este componente
                </p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                  {sortedProducts.map(p => (
                    <ProductCard
                      key={p.variant_id}
                      item={p}
                      selected={!!comp.items.find(i => i.variant_id === p.variant_id)}
                      onToggle={toggleItem}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {!comp.componente && (
            <p className="text-sm text-gray-400 text-center py-4">
              Elegí un componente para ver sus productos
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Picker de afiliado ────────────────────────────────────────
function AffiliatePicker({ value, onChange }) {
  const [query, setQuery]     = useState(value?.name || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const debounceRef           = useRef(null);
  const containerRef          = useRef(null);

  const search = useCallback((q) => {
    if (!q || q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    fetch(`/api/admin/affiliates?search=${encodeURIComponent(q)}&limit=8`)
      .then(r => r.json())
      .then(d => {
        setResults(d.data || []);
        setOpen(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    if (!q) { onChange(null); setOpen(false); }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 300);
  };

  const select = (a) => {
    const name = `${a.first_name || ""} ${a.last_name || ""}`.trim();
    setQuery(name);
    setOpen(false);
    setResults([]);
    onChange({ id: a.shopify_customer_id, name, email: a.email });
  };

  const clear = () => {
    setQuery("");
    onChange(null);
    setOpen(false);
  };

  // Cerrar al hacer click fuera
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={handleChange}
          placeholder="Buscar afiliado por nombre o email..."
          className="w-full pl-8 pr-8 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-[#1e3a5f]"
        />
        {query && (
          <button onClick={clear} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {loading ? (
            <p className="text-sm text-gray-400 p-3 text-center">Buscando...</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-400 p-3 text-center">Sin resultados</p>
          ) : (
            results.map(a => {
              const name = `${a.first_name || ""} ${a.last_name || ""}`.trim();
              return (
                <button
                  key={a.shopify_customer_id}
                  onClick={() => select(a)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 text-left border-b border-gray-100 last:border-none"
                >
                  <div className="w-7 h-7 rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f] flex items-center justify-center text-xs font-bold shrink-0">
                    {(name[0] || "?").toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{name || "Sin nombre"}</p>
                    <p className="text-xs text-gray-400 truncate">{a.email}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {value && (
        <p className="text-xs text-[#1e3a5f] mt-1.5 font-medium">
          ✓ Asignado a {value.name} ({value.email})
        </p>
      )}
    </div>
  );
}

// ── Formulario de nuevo protocolo ─────────────────────────────
function ProtocolForm({ onSaved, onCancel }) {
  const [name, setName]               = useState("");
  const [description, setDesc]        = useState("");
  const [isPublic, setPublic]         = useState(true);
  const [owner, setOwner]             = useState(null);
  const [components, setComps]        = useState([{ componente: "", label: "", items: [] }]);
  const [componentes, setComponentes] = useState([]);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  useEffect(() => {
    fetch("/api/product-catalog")
      .then(r => r.json())
      .then(d => setComponentes(d.componentes || []));
  }, []);

  const addComp   = () => setComps(c => [...c, { componente: "", label: "", items: [] }]);
  const updateComp = useCallback((i, val) => setComps(c => c.map((x, idx) => idx === i ? val : x)), []);
  const removeComp = useCallback((i) => setComps(c => c.filter((_, idx) => idx !== i)), []);

  const handleSave = async () => {
    setError("");
    const valid = components.filter(c => c.componente && c.items.length);
    if (!name.trim())      return setError("El nombre es requerido");
    if (!valid.length)     return setError("Necesitás al menos un componente con productos seleccionados");
    if (!isPublic && !owner) return setError("Para protocolo privado, elegí el afiliado dueño");

    setSaving(true);
    try {
      const res  = await fetch("/api/protocols", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name:        name.trim(),
          description: description || null,
          is_public:   isPublic,
          owner_id:    isPublic ? null : (owner?.id || null),
          components:  valid,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      onSaved(data.protocol);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Info básica */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Nombre del protocolo"
          className="w-full text-lg font-semibold text-gray-800 border-b border-gray-200 pb-2 outline-none focus:border-[#1e3a5f] bg-transparent"
        />
        <textarea
          value={description}
          onChange={e => setDesc(e.target.value)}
          placeholder="Descripción, indicaciones, objetivo del protocolo..."
          rows={2}
          className="w-full text-sm text-gray-600 resize-none outline-none bg-transparent"
        />

        {/* Toggle público/privado */}
        <div className="space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <button
              type="button"
              onClick={() => setPublic(p => !p)}
              className={`relative w-10 h-5.5 rounded-full transition-colors flex items-center ${
                isPublic ? "bg-[#1e3a5f]" : "bg-gray-200"
              }`}
              style={{ height: 22, width: 40 }}
            >
              <span
                className={`absolute w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  isPublic ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
            <span className="flex items-center gap-1.5 text-sm text-gray-700">
              {isPublic
                ? <><Globe size={14} className="text-green-500" /> Visible para todos los afiliados</>
                : <><Lock size={14} className="text-gray-400" /> Privado (solo el afiliado asignado)</>
              }
            </span>
          </label>

          {/* Picker de afiliado (solo si es privado) */}
          {!isPublic && (
            <div className="pl-12">
              <p className="text-xs text-gray-500 mb-1.5 font-medium">Afiliado dueño del protocolo</p>
              <AffiliatePicker value={owner} onChange={setOwner} />
            </div>
          )}
        </div>
      </div>

      {/* Componentes */}
      <div className="space-y-3">
        {components.map((comp, i) => (
          <ComponentEditor
            key={i}
            comp={comp}
            index={i}
            componentes={componentes}
            onUpdate={val => updateComp(i, val)}
            onRemove={() => removeComp(i)}
          />
        ))}

        <button
          onClick={addComp}
          className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-[#1e3a5f] hover:text-[#1e3a5f] transition-colors"
        >
          <Plus size={16} /> Agregar paso / componente
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 bg-[#1e3a5f] text-white py-3 rounded-xl font-semibold text-sm hover:bg-[#162d4a] disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
        >
          <Save size={16} /> {saving ? "Guardando..." : "Guardar protocolo"}
        </button>
        <button
          onClick={onCancel}
          className="px-6 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────
export default function ProtocolsAdminPage() {
  const [protocols, setProtocols] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/protocols")          // sin owner_id → admin: trae todos
      .then(r => r.json())
      .then(d => setProtocols(d.protocols || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (_protocol) => {
    setCreating(false);
    load();                          // re-fetch para estar sincronizado con DB
  };

  const handleDelete = async (id) => {
    if (!confirm("¿Eliminar este protocolo?")) return;
    await fetch(`/api/protocols/${id}`, { method: "DELETE" });
    setProtocols(p => p.filter(x => x.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#1e3a5f]">Builder de Protocolos</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Carritos preseteados por componente para afiliados
            </p>
          </div>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-2 bg-[#1e3a5f] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#162d4a] transition-colors"
            >
              <Plus size={16} /> Nuevo protocolo
            </button>
          )}
        </div>

        {/* Formulario */}
        {creating && (
          <div className="mb-8">
            <ProtocolForm onSaved={handleSaved} onCancel={() => setCreating(false)} />
          </div>
        )}

        {/* Lista */}
        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando...</div>
        ) : protocols.length === 0 && !creating ? (
          <div className="text-center py-16">
            <Package size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No hay protocolos todavía</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {protocols.map(p => {
              const totalItems = (p.components || []).reduce((acc, c) => acc + (c.items?.length || 0), 0);
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                  {/* Accent bar */}
                  <div className="h-1 bg-gradient-to-r from-[#1e3a5f] to-[#1e8fa8]" />

                  <div className="p-4 flex-1 flex flex-col gap-3">
                    {/* Nombre + visibilidad + delete */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-[#1e3a5f] text-sm leading-snug line-clamp-2">
                          {p.name}
                        </h3>
                        {p.description && (
                          <p className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{p.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDelete(p.id)}
                        className="text-gray-200 hover:text-red-400 transition-colors shrink-0 mt-0.5"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    {/* Componentes como chips */}
                    <div className="flex flex-wrap gap-1 flex-1">
                      {(p.components || []).map((c, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-medium bg-[#1e8fa8]/10 text-[#1e8fa8] px-2 py-0.5 rounded-full"
                        >
                          {c.label || c.componente}
                          {c.items?.length ? ` · ${c.items.length}` : ''}
                        </span>
                      ))}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      {p.is_public
                        ? <span className="flex items-center gap-1 text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                            <Globe size={8} /> Público
                          </span>
                        : <span className="flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            <Lock size={8} /> Privado
                          </span>
                      }
                      <span className="text-[10px] text-gray-400">
                        {totalItems} producto{totalItems !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
