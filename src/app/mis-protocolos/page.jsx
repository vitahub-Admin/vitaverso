"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Cookies from "js-cookie";
import { useCustomer } from "../context/CustomerContext.jsx";
import {
  ArrowLeft, ChevronDown, Minus, Plus, CheckCircle2, X,
  ClipboardList, User, Phone, ExternalLink, Copy,
  ShoppingCart, TrendingUp, FileText, Eye, Search, EyeOff, PackagePlus, RotateCcw,
} from "lucide-react";

// Descripción fallback si no hay match en la tabla componentes
const DESC_FALLBACK = 'Suplemento de alta calidad formulado para complementar la alimentación y apoyar las necesidades nutricionales específicas del paciente.';

const DOSE_UNITS = ['cápsula', 'tableta', 'softgel', 'gota', 'ml', 'sobre', 'cucharada'];

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// Trunca texto en un número de caracteres
function trunc(str, max = 42) {
  if (!str) return "";
  return str.length > max ? str.slice(0, max) + "…" : str;
}

// ── Lista de protocolos ───────────────────────────────────────
function ProtocolList({ protocols, onSelect }) {
  if (!protocols.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-[#E6F4F8] flex items-center justify-center mb-4">
          <ClipboardList size={28} className="text-[#1E8FA8]" />
        </div>
        <p className="text-[#0D2133] font-semibold text-base mb-1">Sin protocolos disponibles</p>
        <p className="text-[#5B7A8C] text-sm max-w-xs">
          Los protocolos aparecerán aquí cuando el equipo los publique.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[960px] mx-auto px-6 py-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {protocols.map(p => {
          const count = p.components?.length || 0;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className="text-left bg-white border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md hover:border-[#1b3f7a]/20 transition-all group flex flex-col"
            >
              {/* Accent bar */}
              <div className="h-1 w-full bg-gradient-to-r from-[#1b3f7a] to-[#1E8FA8]" />

              <div className="p-5 flex flex-col flex-1">
                {/* Producto count pill */}
                <span className="self-start text-[10px] font-extrabold uppercase tracking-widest text-[#1E8FA8] bg-[#E6F4F8] px-2.5 py-1 rounded-full mb-3">
                  {count} producto{count !== 1 ? "s" : ""}
                </span>

                {/* Título */}
                <h3 className="text-lg font-extrabold text-[#1b3f7a] leading-snug mb-2 group-hover:text-[#1E8FA8] transition-colors">
                  {p.name}
                </h3>

                {p.description && (
                  <p className="text-xs text-[#5B7A8C] line-clamp-2 mb-3 leading-relaxed">{p.description}</p>
                )}

                {/* Component chips */}
                <div className="flex flex-wrap gap-1.5 mt-auto pt-3 border-t border-gray-50">
                  {(p.components || []).slice(0, 4).map((c, i) => (
                    <span key={i} className="text-[10px] font-semibold bg-[#F4FAFB] text-[#5B7A8C] px-2 py-0.5 rounded-full border border-[#E2EBF0]">
                      {c.label || c.componente}
                    </span>
                  ))}
                  {count > 4 && (
                    <span className="text-[10px] font-semibold text-[#B0C8D4] px-2 py-0.5">
                      +{count - 4} más
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Modal preview de producto ─────────────────────────────────
function ProductPreviewModal({ productId, title, onClose }) {
  const [html, setHtml]       = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/product-catalog?description=${productId}`)
      .then(r => r.json())
      .then(d => setHtml(d.descriptionHtml || "<p>Sin descripción disponible.</p>"))
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEF3F7]">
          <h3 className="text-sm font-bold text-[#0D2133] line-clamp-1 flex-1">{title}</h3>
          <button onClick={onClose} className="text-[#8AAAB8] hover:text-[#0D2133] ml-3 shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">
          {loading ? (
            <p className="text-sm text-[#8AAAB8] text-center py-10">Cargando descripción...</p>
          ) : (
            <div
              className="prose prose-sm max-w-none text-[#2D4A5C] [&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_td]:border [&_td]:border-[#D0E4EC] [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-[#D0E4EC] [&_th]:px-2 [&_th]:py-1.5 [&_th]:bg-[#E6F4F8] [&_th]:font-semibold [&_th]:text-[#1E8FA8]"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Helper: aplana items de un componente a nivel variante (formato nuevo y antiguo) ──
// Formato nuevo: { product_id, title, image_url, variants: [{ variant_id, variant_title, ... }] }
// Formato antiguo: { variant_id, product_id, title, variant_title, ... }
// Nota: algunas variants más antiguas usan 'id' en lugar de 'variant_id' — se normaliza aquí.
function flattenCompItems(comp) {
  return (comp.items || []).flatMap(item =>
    Array.isArray(item.variants)
      ? item.variants
          .map(v => ({
            variant_id:    v.variant_id ?? v.id,   // ← soporta ambas keys
            product_id:    item.product_id,
            title:         item.title,
            variant_title: v.variant_title || null,
            sku:           v.sku || null,
            image_url:     item.image_url || null,
          }))
          .filter(i => i.variant_id != null)       // ← descarta variants sin ID válido
      : [item]
  );
}

// ── Campo de prescripción: componente + ítem prescrito + opciones ─
function PrescriptionField({ comp, compIndex, selection, quantity, priceMap, stockMap, onSelect, onQty,
                             dosage, note, onDosageChange, onNoteChange, onRemove }) {
  const [open, setOpen]       = useState(false);
  const [preview, setPreview] = useState(null); // { product_id, title }

  const flatItems    = flattenCompItems(comp);
  const selectedItem = flatItems.find(i => selection[i.variant_id]);
  const price        = selectedItem ? (priceMap[selectedItem.variant_id] ?? null) : null;
  const qty          = selectedItem ? (quantity[selectedItem.variant_id] || 1) : 1;

  const choose = (item) => {
    if (stockMap?.[item.variant_id] === 0) return;
    // Si ya está seleccionado, solo cerramos — no togglear (evita deselección accidental en mobile)
    if (selection[item.variant_id]) { setOpen(false); return; }
    onSelect(compIndex, item);
    setOpen(false);
  };

  return (
    <div className={`bg-white rounded-2xl border transition-all ${
      selectedItem ? "border-[#C2DFE8]" : "border-[#E2EBF0]"
    }`}>

      {/* ── Encabezado del componente ── */}
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 ${
          selectedItem ? "bg-[#1E8FA8] text-white" : "bg-[#EEF3F7] text-[#8AAAB8]"
        }`}>
          {selectedItem ? <CheckCircle2 size={11} /> : compIndex + 1}
        </div>
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#8AAAB8] flex-1">
          {comp.label || comp.componente}
        </p>
        {onRemove && (
          <button
            onClick={onRemove}
            title="Quitar de esta prescripción"
            className="text-[#C2DFE8] hover:text-red-400 transition-colors p-0.5 rounded"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* ── Ítem prescrito (inner card) ── */}
      <div className="px-3 pb-3">
        {selectedItem ? (
          <div className="bg-[#F4FAFB] border border-[#1E8FA8] rounded-xl px-3 py-2.5">
            <div className="flex items-start gap-3">
              {/* Nombre completo + variante */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#0D2133] leading-snug">
                  {selectedItem.title}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {selectedItem.variant_title && (
                    <span className="text-[11px] font-extrabold text-[#1E8FA8] uppercase tracking-widest">
                      {selectedItem.variant_title}
                    </span>
                  )}
                  {price != null && (
                    <span className="text-sm font-extrabold text-[#0D2133] tabular-nums">
                      {fmtMXN(price)}
                    </span>
                  )}
                </div>
              </div>

              {/* Qty controls */}
              <div
                className="flex items-center gap-1.5 shrink-0 mt-0.5"
                onClick={e => e.stopPropagation()}
              >
                <button
                  onClick={() => onQty(selectedItem.variant_id, Math.max(1, qty - 1))}
                  className="w-7 h-7 rounded-lg border border-[#C2DFE8] bg-white flex items-center justify-center hover:bg-[#E6F4F8] transition-colors"
                >
                  <Minus size={11} className="text-[#1E8FA8]" />
                </button>
                <span className="text-sm font-extrabold text-[#0D2133] w-6 text-center tabular-nums">
                  {qty}
                </span>
                <button
                  onClick={() => onQty(selectedItem.variant_id, qty + 1)}
                  className="w-7 h-7 rounded-lg border border-[#C2DFE8] bg-white flex items-center justify-center hover:bg-[#E6F4F8] transition-colors"
                >
                  <Plus size={11} className="text-[#1E8FA8]" />
                </button>
              </div>
            </div>

            {/* ── Dosis + Indicación ── */}
            <div
              className="border-t border-[#C2DFE8] mt-2.5 pt-2.5 space-y-2"
              onClick={e => e.stopPropagation()}
            >
              {/* Dosis */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] w-16 shrink-0">
                  Dosis
                </span>
                <input
                  type="number" min="1" max="20"
                  value={dosage?.amount ?? 1}
                  onChange={e => onDosageChange({ ...(dosage || {}), amount: Math.max(1, Number(e.target.value)) })}
                  className="w-11 text-sm font-bold text-center border border-[#C2DFE8] rounded-lg py-0.5 bg-white outline-none focus:border-[#1E8FA8] text-[#0D2133]"
                />
                <select
                  value={dosage?.unit ?? 'cápsula'}
                  onChange={e => onDosageChange({ ...(dosage || {}), unit: e.target.value })}
                  className="flex-1 text-xs font-semibold text-[#0D2133] border border-[#C2DFE8] rounded-lg px-2 py-1 bg-white outline-none focus:border-[#1E8FA8] cursor-pointer"
                >
                  {DOSE_UNITS.map(u => (
                    <option key={u} value={u}>{u}s</option>
                  ))}
                </select>
              </div>

              {/* Indicación */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] w-16 shrink-0">
                  Cuándo
                </span>
                <input
                  type="text"
                  value={note ?? ''}
                  onChange={e => onNoteChange(e.target.value)}
                  placeholder="ej. 2 cápsulas con el desayuno, durante 3 meses…"
                  className="flex-1 text-xs text-[#0D2133] border-b border-[#C2DFE8] py-0.5 bg-transparent outline-none placeholder:text-[#B0C8D4] focus:border-[#1E8FA8]"
                />
              </div>
            </div>
          </div>
        ) : (
          /* Estado vacío — punteado */
          <div className="border-2 border-dashed border-[#C2DFE8] rounded-xl px-4 py-3">
            <p className="text-sm text-[#9ECEDD] text-center font-medium">Sin selección</p>
          </div>
        )}

        {/* ── Toggle para ver / cambiar opciones ── */}
        {flatItems.length > 1 && (
          <button
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 mt-2 ml-0.5 text-[11px] font-bold text-[#5B7A8C] hover:text-[#1E8FA8] transition-colors"
          >
            <ChevronDown size={12} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
            {open ? "Cerrar opciones" : `Cambiar — ${flatItems.length} opciones`}
          </button>
        )}

        {/* ── Modal preview del producto ── */}
        {preview && (
          <ProductPreviewModal
            productId={preview.product_id}
            title={preview.title}
            onClose={() => setPreview(null)}
          />
        )}

        {/* ── Lista de opciones inline ── */}
        {open && (
          <div className="mt-2 border border-[#D0E4EC] rounded-xl overflow-hidden">
            <div className="divide-y divide-[#EEF3F7]">
              {flatItems.map(item => {
                const isSel      = !!selection[item.variant_id];
                const itemPrice  = priceMap[item.variant_id] ?? null;
                const stock      = stockMap?.[item.variant_id];
                const outOfStock = stock === 0;

                return (
                  <div
                    key={item.variant_id}
                    role="button"
                    tabIndex={outOfStock ? -1 : 0}
                    onKeyDown={e => !outOfStock && e.key === 'Enter' && choose(item)}
                    onClick={() => !outOfStock && choose(item)}
                    className={`w-full text-left px-3 py-2.5 flex items-start gap-3 transition-colors ${
                      isSel
                        ? "bg-[#E6F4F8] cursor-pointer"
                        : outOfStock
                          ? "opacity-40 cursor-not-allowed bg-white"
                          : "bg-white hover:bg-[#F7FBFC] cursor-pointer"
                    }`}
                  >
                    {/* Radio */}
                    <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      isSel ? "border-[#1E8FA8]" : "border-[#C8D8E0]"
                    }`}>
                      {isSel && <div className="w-1.5 h-1.5 rounded-full bg-[#1E8FA8]" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${isSel ? "font-bold text-[#0D2133]" : "font-medium text-[#2D4A5C]"}`}>
                        {item.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {item.variant_title && (
                          <span className={`text-[10px] font-extrabold uppercase tracking-widest ${isSel ? "text-[#1E8FA8]" : "text-[#8AAAB8]"}`}>
                            {item.variant_title}
                          </span>
                        )}
                        {outOfStock && (
                          <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full">
                            Sin stock
                          </span>
                        )}
                        {!outOfStock && stock != null && stock <= 3 && (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
                            Últimas {stock}
                          </span>
                        )}
                        {itemPrice != null && (
                          <span className={`text-sm font-extrabold tabular-nums ml-auto ${isSel ? "text-[#1E8FA8]" : "text-[#5B7A8C]"}`}>
                            {fmtMXN(itemPrice)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ojito — ver descripción del producto */}
                    {item.product_id && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setPreview({ product_id: item.product_id, title: item.title });
                        }}
                        title="Ver descripción del producto"
                        className="shrink-0 mt-0.5 p-1 rounded-lg text-[#B0C8D4] hover:text-[#1E8FA8] hover:bg-[#E6F4F8] transition-colors"
                      >
                        <Eye size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Historial de compartidos por protocolo ────────────────────
function ProtocolHistory({ protocolId, onRestore }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sharecart?protocol_id=${protocolId}`)
      .then(r => r.json())
      .then(d => { if (d.ok) setHistory(d.carts || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [protocolId]);

  // Ocultar sección si no hay historial y ya terminó de cargar
  if (!loading && history.length === 0) return null;

  const fmtDate = (d) => new Date(d).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div className="px-4 pt-4 pb-2 lg:px-6 border-t border-[#D0E4EC] bg-[#F7F9FB]">
      <div className="max-w-5xl mx-auto">

        {/* Encabezado de sección */}
        <div className="flex items-center gap-2 mb-3">
          <RotateCcw size={12} className="text-[#5B7A8C]" />
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">
            Configuraciones anteriores
          </p>
          {!loading && (
            <span className="text-[10px] font-bold bg-[#1E8FA8]/15 text-[#1E8FA8] px-2 py-0.5 rounded-full tabular-nums">
              {history.length}
            </span>
          )}
        </div>

        {/* Spinner */}
        {loading && (
          <div className="flex items-center gap-2 py-3">
            <div className="w-4 h-4 border-2 border-[#1E8FA8] border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-xs text-[#7EAEC0]">Cargando historial…</span>
          </div>
        )}

        {/* Cards horizontales con scroll */}
        {!loading && history.length > 0 && (
          <div className="flex gap-3 overflow-x-auto pb-3
            [&::-webkit-scrollbar]:h-1
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:bg-[#D0E4EC]
            [&::-webkit-scrollbar-thumb]:rounded-full">
            {history.map(cart => {
              const itemCount = cart.items?.length || 0;
              const rawPhone  = (cart.phone || '').replace(/^\+521?/, '').replace(/\D/g, '');
              return (
                <div key={cart.token}
                  className="shrink-0 w-52 bg-white border border-[#D0E4EC] rounded-2xl p-4 flex flex-col gap-3 shadow-sm hover:shadow-md hover:border-[#1E8FA8]/40 transition-all">

                  {/* Info principal */}
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#0D2133] truncate leading-snug">
                      {cart.name || 'Sin nombre'}
                    </p>
                    <p className="text-[11px] text-[#7EAEC0] mt-0.5">
                      {fmtDate(cart.created_at)}
                    </p>
                    {rawPhone && (
                      <p className="text-[11px] text-[#5B7A8C] mt-0.5 tabular-nums">
                        {rawPhone}
                      </p>
                    )}
                  </div>

                  {/* Chip productos */}
                  <span className="self-start text-[10px] font-bold bg-[#E6F4F8] text-[#1E8FA8] px-2.5 py-1 rounded-full">
                    {itemCount} producto{itemCount !== 1 ? 's' : ''}
                  </span>

                  {/* Botón restaurar */}
                  <button
                    onClick={() => onRestore(cart)}
                    className="flex items-center justify-center gap-1.5 text-xs font-bold text-[#0D2133] bg-[#EEF3F7] hover:bg-[#1E8FA8] hover:text-white px-3 py-2 rounded-xl transition-colors"
                  >
                    <RotateCcw size={11} />
                    Restaurar
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// La ganancia se calcula por producto desde product_variant_commissions (ver commissionMap)

// ── Vista de uso del protocolo ────────────────────────────────
function ProtocolUse({ protocol, customerId, onBack }) {
  const { customer }  = useCustomer();
  const [selections, setSelections] = useState({});
  const [quantities, setQuantities] = useState({});
  const [dosages,   setDosages]   = useState({});  // { variant_id: { amount, unit } }
  const [notes,     setNotes]     = useState({});   // { variant_id: string }
  const [priceMap,      setPriceMap]      = useState({});
  const [stockMap,      setStockMap]      = useState({});
  const [commissionMap, setCommissionMap] = useState({});
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [nombre, setNombre]         = useState("");
  const [apellido, setApellido]     = useState("");
  const [telefono, setTelefono]     = useState("");
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState(null);
  const [error, setError]           = useState("");
  const [copied, setCopied]         = useState(false);
  const [hiddenComps, setHiddenComps] = useState(new Set()); // índices de componentes ocultos temporalmente

  const removeComp  = useCallback(ci => setHiddenComps(s => new Set([...s, ci])), []);
  const restoreComp = useCallback(ci => setHiddenComps(s => { const n = new Set(s); n.delete(ci); return n; }), []);

  // ── Productos extra (fuera del protocolo) ─────────────────────
  const [extraItems,   setExtraItems]   = useState([]);   // { variant_id, title, price, quantity }
  const [extraQuery,   setExtraQuery]   = useState("");
  const [extraResults, setExtraResults] = useState([]);
  const [extraLoading, setExtraLoading] = useState(false);
  const extraInputRef = useRef(null);

  const searchExtras = useCallback(async (q) => {
    const trimmed = q.trim();
    if (!trimmed) { setExtraResults([]); return; }
    setExtraLoading(true);
    try {
      const res  = await fetch(`/api/buscador?q=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      setExtraResults(data.ok ? (data.products || []) : []);
    } catch { setExtraResults([]); }
    finally  { setExtraLoading(false); }
  }, []);

  const addExtra = useCallback((product) => {
    if (!product.variant_id) return;
    setExtraItems(prev => {
      if (prev.find(e => e.variant_id === product.variant_id)) return prev;
      return [...prev, {
        variant_id: product.variant_id,
        title:      product.title,
        price:      parseFloat(product.price) || 0,
        quantity:   1,
        dosage:     { amount: 1, unit: 'cápsula' },
        note:       '',
      }];
    });
    setExtraResults([]);
    setExtraQuery("");
  }, []);

  const removeExtra    = useCallback((vid) => setExtraItems(prev => prev.filter(e => e.variant_id !== vid)), []);
  const setExtraQty    = useCallback((vid, qty) => setExtraItems(prev => prev.map(e => e.variant_id === vid ? { ...e, quantity: Math.max(1, qty) } : e)), []);
  const setExtraDosage = useCallback((vid, dosage) => setExtraItems(prev => prev.map(e => e.variant_id === vid ? { ...e, dosage } : e)), []);
  const setExtraNote   = useCallback((vid, note)   => setExtraItems(prev => prev.map(e => e.variant_id === vid ? { ...e, note } : e)), []);

  // Cargar precios + pre-seleccionar primer ítem de cada componente
  useEffect(() => {
    // Aplanar a nivel variante (compatible formato nuevo y antiguo)
    const allIds = protocol.components
      .flatMap(c => flattenCompItems(c))
      .map(i => i.variant_id)
      .filter(Boolean);

    // Pre-seleccionar primera variante de cada componente (provisional, antes de saber stock)
    const initSel = {};
    const initQty = {};
    protocol.components.forEach(comp => {
      const first = flattenCompItems(comp)[0];
      if (first) { initSel[first.variant_id] = true; initQty[first.variant_id] = 1; }
    });
    setSelections(initSel);
    setQuantities(initQty);

    if (!allIds.length) { setLoadingPrices(false); return; }

    fetch(`/api/product-catalog?variant_ids=${allIds.join(",")}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          const stockData = d.stock || {};
          setPriceMap(d.prices || {});
          setStockMap(stockData);
          setCommissionMap(d.commissions || {});

          // Re-evaluar selecciones: si la variante pre-seleccionada está sin stock,
          // buscar la primera con stock en el mismo componente y cambiarla
          setSelections(prev => {
            const next = { ...prev };
            protocol.components.forEach(comp => {
              const flat    = flattenCompItems(comp);
              const selVid  = flat.find(v => next[v.variant_id])?.variant_id;
              if (!selVid) return;
              const selStock = stockData[selVid];
              if (selStock !== null && selStock !== undefined && selStock <= 0) {
                // Buscar primera con stock
                const alt = flat.find(v => {
                  const s = stockData[v.variant_id];
                  return s === null || s === undefined || s > 0;
                });
                if (alt && alt.variant_id !== selVid) {
                  delete next[selVid];
                  next[alt.variant_id] = true;
                }
              }
            });
            return next;
          });
        }
      })
      .finally(() => setLoadingPrices(false));
  }, [protocol]);

  // Selección: radio por componente (borra todas las variantes del comp antes de seleccionar)
  const selectItem = useCallback((compIndex, item) => {
    const comp = protocol.components[compIndex];
    setSelections(prev => {
      const next = { ...prev };
      // Quitar todas las variantes del componente (formato nuevo y antiguo)
      for (const ci of flattenCompItems(comp)) delete next[ci.variant_id];
      if (prev[item.variant_id]) delete next[item.variant_id];
      else next[item.variant_id] = true;
      return next;
    });
    setQuantities(prev => ({ ...prev, [item.variant_id]: prev[item.variant_id] || 1 }));
  }, [protocol]);

  const setQty = useCallback((vid, qty) => {
    setQuantities(prev => ({ ...prev, [vid]: qty }));
  }, []);

  // Variant IDs que pertenecen a componentes quitados (para excluirlos de cálculos)
  const hiddenVariantIds = useMemo(() => {
    const ids = new Set();
    protocol.components.forEach((comp, ci) => {
      if (hiddenComps.has(ci)) flattenCompItems(comp).forEach(v => ids.add(v.variant_id));
    });
    return ids;
  }, [hiddenComps, protocol.components]);

  // Cálculos — excluyen componentes quitados
  const selectedCount   = Object.keys(selections).filter(vid => !hiddenVariantIds.has(Number(vid))).length;
  const totalComponents = protocol.components.length - hiddenComps.size;
  const progressPct     = totalComponents ? Math.round((selectedCount / totalComponents) * 100) : 0;

  const subtotal = useMemo(() => {
    const protocolTotal = Object.entries(selections)
      .filter(([vid]) => !hiddenVariantIds.has(Number(vid)))
      .reduce((sum, [vid]) => {
        const qty = quantities[Number(vid)] || 1;
        const p   = priceMap[Number(vid)];
        return sum + (p != null ? p * qty : 0);
      }, 0);
    const extrasTotal = extraItems.reduce((sum, e) => sum + (e.price || 0) * e.quantity, 0);
    return protocolTotal + extrasTotal;
  }, [selections, quantities, priceMap, hiddenVariantIds, extraItems]);

  const hasAnyPrice = useMemo(() =>
    Object.keys(selections)
      .filter(vid => !hiddenVariantIds.has(Number(vid)))
      .some(vid => priceMap[Number(vid)] != null),
  [selections, priceMap, hiddenVariantIds]);

  const ganancia = useMemo(() => {
    const protocolGanancia = Object.entries(selections)
      .filter(([vid]) => !hiddenVariantIds.has(Number(vid)))
      .reduce((sum, [vid]) => {
        const qty = quantities[Number(vid)] || 1;
        const p   = priceMap[Number(vid)];
        const pct = commissionMap[Number(vid)] ?? 0;
        return sum + (p != null ? p * qty * (pct / 100) : 0);
      }, 0);
    const extrasGanancia = extraItems.reduce((sum, e) => {
      const pct = commissionMap[e.variant_id] ?? 0;
      return sum + (e.price || 0) * e.quantity * (pct / 100);
    }, 0);
    return protocolGanancia + extrasGanancia;
  }, [selections, quantities, priceMap, commissionMap, hiddenVariantIds, extraItems]);
  const fullName = `${nombre} ${apellido}`.trim();

  // Checkout
  const handleGenerate = async () => {
    const totalItems = selectedCount + extraItems.length;
    if (!totalItems) return setError("Selecciona al menos un producto");
    setError("");
    setLoading(true);
    const items = [
      ...Object.entries(selections)
        .filter(([vid]) => !hiddenVariantIds.has(Number(vid)))
        .map(([variant_id]) => ({
          variant_id: Number(variant_id),
          quantity:   quantities[Number(variant_id)] || 1,
        })),
      ...extraItems.map(e => ({
        variant_id: Number(e.variant_id),
        quantity:   e.quantity,
      })),
    ];
    // Construir mapa de dosis/notas por variant_id para persistirlo en el sharecart
    const dosisMap = {};
    Object.entries(selections)
      .filter(([vid]) => !hiddenVariantIds.has(Number(vid)))
      .forEach(([vid]) => {
        const v = Number(vid);
        const dos = dosages[v];
        const nota = notes[v];
        if (dos || nota) {
          dosisMap[vid] = {
            ...(dos  ? { dosis_amount: dos.amount, dosis_unit: dos.unit } : {}),
            ...(nota ? { nota } : {}),
          };
        }
      });

    try {
      const res  = await fetch("/api/sharecart/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_id: customerId,
          name:     fullName,
          phone:    telefono ? `+521${telefono}` : "",
          items,
          extra: {
            origen:        "protocolo",
            protocol_id:   protocol.id,
            protocol_name: protocol.name,
            dosis_map:     Object.keys(dosisMap).length ? dosisMap : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error generando el carrito");
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(result.checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setResult(null);
    const initSel = {};
    const initQty = {};
    protocol.components.forEach(comp => {
      // Intentar seleccionar la primera con stock según stockMap actual;
      // si no se conoce, caer en la primera
      const flat = flattenCompItems(comp);
      const pick = flat.find(v => {
        const s = stockMap[v.variant_id];
        return s === null || s === undefined || s > 0;
      }) || flat[0];
      if (pick) { initSel[pick.variant_id] = true; initQty[pick.variant_id] = 1; }
    });
    setSelections(initSel);
    setQuantities(initQty);
    setDosages({});
    setNotes({});
    setNombre("");
    setApellido("");
    setTelefono("");
    setError("");
  };

  // ── Restaurar configuración desde historial ───────────────────
  const restoreFromHistory = useCallback(async (cart) => {
    // Variant IDs que pertenecen al protocolo actual
    const protocolVidSet = new Set(
      protocol.components.flatMap(c => flattenCompItems(c)).map(i => i.variant_id)
    );

    const savedItems = cart.items || [];
    const protocolItems = savedItems.filter(i => protocolVidSet.has(i.variant_id));
    const extraSaved    = savedItems.filter(i => !protocolVidSet.has(i.variant_id));

    // Restaurar selecciones y cantidades del protocolo
    const newSel = {};
    const newQty = {};
    for (const it of protocolItems) {
      newSel[it.variant_id] = true;
      newQty[it.variant_id] = it.quantity || 1;
    }
    setSelections(newSel);
    setQuantities(newQty);
    setDosages({});
    setNotes({});
    setHiddenComps(new Set());

    // Restaurar datos del paciente
    const parts = (cart.name || '').split(' ');
    setNombre(parts[0] || '');
    setApellido(parts.slice(1).join(' ') || '');
    const rawPhone = (cart.phone || '').replace(/^\+521/, '').replace(/^\+52/, '').replace(/\D/g, '');
    setTelefono(rawPhone);

    // Restaurar extras: necesitan título desde product_catalog
    if (extraSaved.length) {
      try {
        const ids = extraSaved.map(i => i.variant_id).join(',');
        const res  = await fetch(`/api/product-catalog?titles_for=${ids}`);
        const data = await res.json();
        const vmap = data.ok ? (data.variants || {}) : {};
        setExtraItems(extraSaved.map(i => ({
          variant_id: i.variant_id,
          title:      vmap[i.variant_id]?.title      || `Variante ${i.variant_id}`,
          price:      vmap[i.variant_id]?.price      ?? 0,
          quantity:   i.quantity || 1,
          dosage:     { amount: 1, unit: 'cápsula' },
          note:       '',
        })));
      } catch {
        // Si falla, restaurar sin extras
        setExtraItems([]);
      }
    } else {
      setExtraItems([]);
    }

    setResult(null);
    setError('');
  }, [protocol]);

  // ── Generador de PDF de prescripción ─────────────────────────
  const generatePDF = async () => {
    const professionalName = customer?.first_name
      ? `${customer.first_name} ${customer.last_name || ''}`.trim()
      : 'Especialista Vitahub';

    const patientName = fullName || 'Paciente';
    const today = new Date().toLocaleDateString('es-MX', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    // ── Cargar imágenes y descripciones en paralelo ──────────────
    // (rows se construye después para poder usar descMap)
    const rowsRaw = protocol.components
      .filter(comp => flattenCompItems(comp).some(i => selections[i.variant_id]))
      .map(comp => {
        const item = flattenCompItems(comp).find(i => selections[i.variant_id]);
        return {
          comp,
          item,
          price: priceMap[item.variant_id],
          qty:   quantities[item.variant_id] || 1,
          dos:   dosages[item.variant_id]  || { amount: 1, unit: 'cápsula' },
          nota:  notes[item.variant_id]    || '',
          label: comp.label || comp.componente,
        };
      });

    // Fetch imágenes y descripciones en paralelo
    const productIds = [...new Set(rowsRaw.map(r => r.item.product_id).filter(Boolean))];
    const [imageMap, descMap] = await Promise.all([
      // Imágenes Shopify
      productIds.length
        ? fetch(`/api/product-catalog?product_ids=${productIds.join(',')}`)
            .then(r => r.json())
            .then(d => d.ok ? d.images || {} : {})
            .catch(() => ({}))
        : Promise.resolve({}),
      // Descripciones de componentes desde Supabase
      fetch('/api/admin/componentes')
        .then(r => r.json())
        .then(d => {
          const map = {};
          if (d.ok) for (const c of d.items || []) {
            if (c.descripcion) map[c.slug.trim().toLowerCase()] = c.descripcion;
          }
          return map;
        })
        .catch(() => ({})),
    ]);

    // Armar rows completos ya con descMap disponible
    const rows = rowsRaw.map(r => ({
      ...r,
      desc: descMap[(r.comp.componente || r.comp.label || '').trim().toLowerCase()] || DESC_FALLBACK,
    }));

    // ── HTML de cada ítem con layout alternado ────────────────
    const PLACEHOLDER_SVG = `
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#9ECEDD" stroke-width="1.2" stroke-linecap="round">
        <rect x="3" y="3" width="18" height="18" rx="3"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>`;

    const rowsHtml = rows.map(({ item, label, price, qty, dos, nota, desc }, idx) => {
      const imgUrl  = imageMap[item.product_id];
      const imgHtml = imgUrl
        ? `<img src="${imgUrl}" class="rx-img" alt="${label}" />`
        : `<div class="rx-img rx-img-placeholder">${PLACEHOLDER_SVG}</div>`;
      const isEven  = idx % 2 === 1; // alterna dirección

      return `
      <div class="rx-item ${isEven ? 'rx-item--reverse' : ''}">
        <div class="rx-img-col">${imgHtml}</div>
        <div class="rx-info">
          <div class="rx-comp-label">${label}</div>
          <div class="rx-product-name">${item.title}</div>
          <div class="rx-variant">${[item.variant_title, `${qty} unid.`].filter(Boolean).join(' · ')}</div>
          <div class="rx-dose-row">
            <span class="rx-dose-badge">${dos.amount} ${dos.unit}${dos.amount > 1 ? 's' : ''}</span>
            ${nota ? `<span class="rx-nota">📋 ${nota}</span>` : ''}
            ${price != null ? `<span class="rx-price">${fmtMXN(price)}</span>` : ''}
          </div>
          <div class="rx-desc">${desc}</div>
        </div>
      </div>`;
    }).join('\n');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Prescripción — ${patientName}</title>
<style>
  @page { size: A4; margin: 12mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    color: #0D2133;
    font-size: 14px;
    line-height: 1.5;
    background: #EEF3F7;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Página centrada ── */
  .rx-page { padding: 20px; display: flex; justify-content: center; min-height: 100vh; }

  /* ── Card principal: panfleto A5 centrado ── */
  .rx-card {
    width: 100%;
    max-width: 680px;
    background: #fff;
    border: 1px solid #D0E4EC;
    border-radius: 16px;
    overflow: hidden;
    box-shadow: 0 4px 24px rgba(13,33,51,0.10);
  }

  /* ── Header de la card ── */
  .rx-header {
    background: #0D2133;
    color: white;
    padding: 18px 24px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .rx-logo { font-size: 20px; font-weight: 900; color: #1E8FA8; letter-spacing: -0.5px; }
  .rx-logo em { color: white; font-style: normal; }
  .rx-logo small { font-size: 11px; font-weight: 400; color: #7EAEC0; display: block; letter-spacing: 0.12em; text-transform: uppercase; }
  .rx-professional { text-align: right; }
  .rx-professional strong { font-size: 14px; color: white; display: block; }
  .rx-professional small { font-size: 11px; color: #7EAEC0; }

  /* ── Caja del paciente ── */
  .rx-patient {
    background: #F4FAFB;
    border-bottom: 1px solid #D0E4EC;
    padding: 14px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .rx-patient h2 { font-size: 16px; font-weight: 800; color: #0D2133; }
  .rx-patient p  { font-size: 12px; color: #5B7A8C; margin-top: 2px; }
  .rx-patient-meta { text-align: right; font-size: 11px; color: #8AAAB8; }

  /* ── Título sección ── */
  .rx-section-title {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #8AAAB8;
    padding: 16px 24px 8px;
  }

  /* ── Ítems prescritos ── */
  .rx-items { padding: 0 16px 16px; }

  .rx-item {
    display: flex;
    gap: 16px;
    align-items: flex-start;
    background: #F7FAFB;
    border: 1px solid #E2EBF0;
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 10px;
  }
  .rx-item--reverse { flex-direction: row-reverse; }
  .rx-item:last-child { margin-bottom: 0; }

  /* ── Imagen ── */
  .rx-img-col { flex-shrink: 0; }
  .rx-img {
    width: 80px;
    height: 80px;
    border-radius: 10px;
    object-fit: contain;
    background: #EEF7FB;
    border: 1px solid #C2DFE8;
    display: block;
  }
  .rx-img-placeholder {
    width: 80px;
    height: 80px;
    background: #EEF7FB;
    border: 1px solid #C2DFE8;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ── Info del producto ── */
  .rx-info { flex: 1; min-width: 0; }
  .rx-comp-label {
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    color: #1E8FA8;
    margin-bottom: 3px;
  }
  .rx-product-name {
    font-size: 14px;
    font-weight: 700;
    color: #0D2133;
    line-height: 1.3;
    margin-bottom: 3px;
  }
  .rx-variant {
    font-size: 11px;
    font-weight: 700;
    color: #5B7A8C;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8px;
  }

  .rx-dose-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    flex-wrap: wrap;
  }
  .rx-dose-badge {
    background: #0D2133;
    color: white;
    font-size: 11px;
    font-weight: 800;
    padding: 3px 12px;
    border-radius: 20px;
  }
  .rx-nota  { font-size: 11px; color: #5B7A8C; font-style: italic; }
  .rx-price { margin-left: auto; font-size: 14px; font-weight: 800; color: #1E8FA8; }

  .rx-desc {
    font-size: 12px;
    color: #7A95A3;
    line-height: 1.55;
  }

  /* ── Footer ── */
  .rx-footer {
    border-top: 1px solid #E2EBF0;
    padding: 12px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .rx-footer-brand { font-size: 12px; font-weight: 800; color: #1E8FA8; }
  .rx-footer-disclaimer { font-size: 10px; color: #B0C8D4; text-align: right; max-width: 320px; line-height: 1.4; }

  /* ── Print ── */
  @media print {
    body { background: white; }
    .rx-page { padding: 0; }
    .rx-card { box-shadow: none; border-color: #D0E4EC; border-radius: 0; max-width: 100%; }
  }
</style>
</head>
<body>

<div class="rx-page">
<div class="rx-card">

  <div class="rx-header">
    <div>
      <div class="rx-logo">Vita<em>Hub</em> <span style="font-size:13px;font-weight:500;color:#7EAEC0">Pro</span></div>
      <small>Prescripción Nutricional</small>
    </div>
    <div class="rx-professional">
      <strong>${professionalName}</strong>
      <small>Especialista en Nutrición · Vitahub</small>
    </div>
  </div>

  <div class="rx-patient">
    <div>
      <h2>Para: ${patientName}</h2>
      <p>Protocolo: ${protocol.name}</p>
    </div>
    <div class="rx-patient-meta">
      <div>${today}</div>
    </div>
  </div>

  <div class="rx-section-title">Suplementación prescrita</div>

  <div class="rx-items">
    ${rowsHtml}
  </div>

  <div class="rx-footer">
    <div class="rx-footer-brand">vitahub.mx</div>
    <div class="rx-footer-disclaimer">Prescripción generada digitalmente. No reemplaza diagnóstico ni tratamiento médico. Consultá siempre a tu profesional de salud.</div>
  </div>

</div>
</div>

</body>
</html>`;

    const w = window.open('', '_blank', 'width=760,height=960');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 800);
  };

  const inputCls = "flex-1 text-sm text-[#0D2133] outline-none placeholder:text-[#C8D8E0] bg-transparent";

  // Panel derecho (paciente + economía + checkout)
  const rightPanel = (
    <div className="bg-white border border-[#D0E4EC] rounded-2xl overflow-hidden">
      {/* Datos paciente */}
      <div className="px-4 py-3 space-y-2.5">
        <p className="text-[10px] font-extrabold text-[#5B7A8C] uppercase tracking-widest">
          Datos del paciente
        </p>
        <div className="flex items-center gap-2.5 border-b border-[#F0F6F8] pb-2.5">
          <User size={13} className="text-[#C8D8E0] shrink-0" />
          <input value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="Nombre" className={inputCls} />
        </div>
        <div className="flex items-center gap-2.5 border-b border-[#F0F6F8] pb-2.5">
          <User size={13} className="text-[#C8D8E0] shrink-0" />
          <input value={apellido} onChange={e => setApellido(e.target.value)}
            placeholder="Apellido" className={inputCls} />
        </div>
        <div className="flex items-center gap-2.5">
          <Phone size={13} className="text-[#C8D8E0] shrink-0" />
          <span className="text-sm text-[#5B7A8C] font-medium">+521</span>
          <input
            value={telefono}
            onChange={e => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="10 dígitos"
            className={inputCls}
          />
        </div>
      </div>

      {/* Economía — aparece cuando hay selecciones con precio */}
      {hasAnyPrice && selectedCount > 0 && (
        <div className="border-t border-[#EEF3F7] px-4 py-3">
          <p className="text-[10px] font-extrabold text-[#5B7A8C] uppercase tracking-widest mb-2.5">
            Resumen de prescripción
          </p>

          <div className="space-y-1.5 mb-2.5">
            <div className="flex text-sm">
              <span className="text-[#5B7A8C]">
                {selectedCount + extraItems.length} producto{selectedCount + extraItems.length !== 1 ? "s" : ""}
              </span>
              <span className="ml-auto font-bold text-[#0D2133] tabular-nums">{fmtMXN(subtotal)}</span>
            </div>
          </div>

          <div className="border-t border-[#EEF3F7] pt-2.5 space-y-1.5">
            <div className="flex items-baseline">
              <span className="text-sm font-bold text-[#0D2133]">Total al cliente</span>
              <span className="ml-auto text-lg font-extrabold text-[#0D2133] tabular-nums">
                {fmtMXN(subtotal)}
              </span>
            </div>
            {ganancia > 0 && (
              <div className="flex items-center bg-[#F4FAFB] rounded-lg px-2.5 py-1.5 -mx-0.5">
                <span className="flex items-center gap-1.5 text-xs font-bold text-[#1E8FA8]">
                  <TrendingUp size={12} />
                  Tu ganancia
                </span>
                <span className="ml-auto text-sm font-extrabold text-[#1E8FA8] tabular-nums">
                  {fmtMXN(ganancia)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Checkout */}
      <div className="border-t border-[#EEF3F7] px-4 py-3">
        {result ? (
          <div className="space-y-2">
            <p className="text-xs text-center text-[#5B7A8C]">
              ✓ Checkout generado{fullName ? ` para ${fullName}` : ""}
            </p>
            <div className="flex gap-2">
              <button
                onClick={copyLink}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${
                  copied
                    ? "bg-emerald-500 text-white scale-[1.02]"
                    : "bg-[#E6F4F8] text-[#1E8FA8] hover:bg-[#D0ECF5]"
                }`}
              >
                {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
                {copied ? "¡Copiado!" : "Copiar enlace"}
              </button>
              <button
                onClick={() => window.open(result.checkoutUrl, "_blank")}
                className="flex-1 flex items-center justify-center gap-1.5 bg-[#1E8FA8] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-[#177F95] transition-colors"
              >
                <ExternalLink size={13} />
                Abrir
              </button>
            </div>
            <button onClick={reset} className="w-full text-xs text-[#5B7A8C] text-center py-1 hover:text-[#0D2133]">
              Armar otro carrito
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <button
              onClick={handleGenerate}
              disabled={loading || !selectedCount}
              className="w-full bg-[#0D2133] text-white py-3 rounded-xl font-bold text-sm disabled:opacity-40 hover:bg-[#162D40] transition-colors flex items-center justify-center gap-2"
            >
              <ShoppingCart size={14} />
              {loading
                ? "Generando..."
                : selectedCount
                  ? `Generar checkout · ${selectedCount + extraItems.length} producto${selectedCount + extraItems.length !== 1 ? "s" : ""}`
                  : "Selecciona los productos"
              }
            </button>
            {selectedCount > 0 && (
              <button
                onClick={generatePDF}
                className="w-full bg-[#EEF3F7] text-[#2D4A5C] py-2.5 rounded-xl font-bold text-sm hover:bg-[#E0ECF3] transition-colors flex items-center justify-center gap-2"
              >
                <FileText size={14} />
                Vista previa receta PDF
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F7F9FB] flex flex-col">

      {/* Header oscuro */}
      <div className="bg-[#0D2133] text-white px-5 pt-5 pb-4 lg:px-8">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-[#7EAEC0] text-sm mb-3 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} /> Protocolos
        </button>

        <h1 className="text-lg font-bold leading-snug mb-0.5">{protocol.name}</h1>
        {protocol.description && (
          <p className="text-[#7EAEC0] text-sm">{protocol.description}</p>
        )}

        {/* Barra de progreso */}
        <div className="flex items-center gap-2.5 mt-3">
          <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#1E8FA8] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs text-[#7EAEC0] tabular-nums shrink-0">
            {selectedCount}/{totalComponents}
          </span>
        </div>
      </div>

      {/* Contenido — min-h-0 para que flex-1 pueda shrink y no desbordarse */}
      <div className="flex-1 min-h-0 px-4 py-4 lg:px-6 lg:py-5 overflow-hidden">
        <div className="h-full lg:grid lg:grid-cols-[1fr_320px] lg:gap-5 lg:items-start max-w-5xl mx-auto">

          {/* Columna izquierda: ocupa todo el alto disponible */}
          <div className="h-full flex flex-col bg-white border border-[#D0E4EC] rounded-2xl overflow-hidden">

            {/* Header de la caja: título + descripción del protocolo */}
            <div className="px-4 py-3 border-b border-[#EEF3F7] shrink-0">
              <p className="text-[10px] font-extrabold text-[#1E8FA8] uppercase tracking-widest mb-0.5">
                Protocolo activo
              </p>
              <h2 className="text-sm font-bold text-[#0D2133] leading-snug">{protocol.name}</h2>
              {protocol.description && (
                <p className="text-xs text-[#5B7A8C] mt-0.5 line-clamp-1">{protocol.description}</p>
              )}
            </div>

            {/* Selectors — scroll interno */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2
              [&::-webkit-scrollbar]:w-1
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:bg-[#D0E4EC]
              [&::-webkit-scrollbar-thumb]:rounded-full">

              {loadingPrices && (
                <p className="text-xs text-[#5B7A8C] text-center animate-pulse py-2">
                  Cargando precios…
                </p>
              )}

              {protocol.components.map((comp, ci) => {
                if (hiddenComps.has(ci)) return null;
                const selVid = flattenCompItems(comp).find(i => selections[i.variant_id])?.variant_id;
                return (
                  <PrescriptionField
                    key={ci}
                    comp={comp}
                    compIndex={ci}
                    selection={selections}
                    quantity={quantities}
                    priceMap={priceMap}
                    stockMap={stockMap}
                    onSelect={selectItem}
                    onQty={setQty}
                    dosage={selVid ? dosages[selVid] : undefined}
                    note={selVid ? notes[selVid] : undefined}
                    onDosageChange={v => selVid && setDosages(p => ({ ...p, [selVid]: v }))}
                    onNoteChange={v => selVid && setNotes(p => ({ ...p, [selVid]: v }))}
                    onRemove={() => removeComp(ci)}
                  />
                );
              })}

              {/* Componentes ocultos — pills para restaurar */}
              {hiddenComps.size > 0 && (
                <div className="pt-1 pb-1">
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#B0C8D4] mb-2 px-1">
                    Ocultos en esta prescripción
                  </p>
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {[...hiddenComps].sort((a, b) => a - b).map(ci => {
                      const c = protocol.components[ci];
                      return (
                        <button
                          key={ci}
                          onClick={() => restoreComp(ci)}
                          className="flex items-center gap-1.5 text-[11px] font-bold text-[#5B7A8C] bg-[#EEF3F7] hover:bg-[#E6F4F8] hover:text-[#1E8FA8] px-3 py-1.5 rounded-full border border-[#D0E4EC] transition-colors"
                        >
                          <Plus size={10} />
                          {c.label || c.componente}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Productos extra ─────────────────────────────── */}
              <div className="pt-2 border-t border-[#EEF3F7] mt-1">
                <div className="flex items-center gap-2 mb-2 px-1">
                  <PackagePlus size={13} className="text-[#1E8FA8] shrink-0" />
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#1E8FA8]">
                    Productos adicionales
                  </p>
                </div>

                {/* Extras ya agregados */}
                {extraItems.length > 0 && (
                  <div className="space-y-2 mb-2">
                    {extraItems.map(e => (
                      <div key={e.variant_id} className="bg-[#F4FAFB] border border-[#C2DFE8] rounded-xl px-3 py-2.5">
                        {/* Título + qty + quitar */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-[#0D2133] line-clamp-1">{e.title}</p>
                            {e.price > 0 && (
                              <p className="text-[11px] text-[#1E8FA8] font-semibold tabular-nums">{fmtMXN(e.price)}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => setExtraQty(e.variant_id, e.quantity - 1)} className="w-6 h-6 rounded-lg border border-[#C2DFE8] bg-white flex items-center justify-center hover:bg-[#E6F4F8] transition-colors">
                              <Minus size={10} className="text-[#1E8FA8]" />
                            </button>
                            <span className="text-xs font-extrabold text-[#0D2133] w-5 text-center tabular-nums">{e.quantity}</span>
                            <button onClick={() => setExtraQty(e.variant_id, e.quantity + 1)} className="w-6 h-6 rounded-lg border border-[#C2DFE8] bg-white flex items-center justify-center hover:bg-[#E6F4F8] transition-colors">
                              <Plus size={10} className="text-[#1E8FA8]" />
                            </button>
                          </div>
                          <button onClick={() => removeExtra(e.variant_id)} className="text-[#C2DFE8] hover:text-red-400 transition-colors ml-0.5 shrink-0">
                            <X size={13} />
                          </button>
                        </div>
                        {/* Dosis + Cuándo */}
                        <div className="border-t border-[#C2DFE8] mt-2 pt-2 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] w-14 shrink-0">Dosis</span>
                            <input
                              type="number" min="1" max="20"
                              value={e.dosage?.amount ?? 1}
                              onChange={ev => setExtraDosage(e.variant_id, { ...(e.dosage || {}), amount: Math.max(1, Number(ev.target.value)) })}
                              className="w-11 text-xs font-bold text-center border border-[#C2DFE8] rounded-lg py-0.5 bg-white outline-none focus:border-[#1E8FA8] text-[#0D2133]"
                            />
                            <select
                              value={e.dosage?.unit ?? 'cápsula'}
                              onChange={ev => setExtraDosage(e.variant_id, { ...(e.dosage || {}), unit: ev.target.value })}
                              className="flex-1 text-xs font-semibold text-[#0D2133] border border-[#C2DFE8] rounded-lg px-2 py-1 bg-white outline-none focus:border-[#1E8FA8] cursor-pointer"
                            >
                              {DOSE_UNITS.map(u => <option key={u} value={u}>{u}s</option>)}
                            </select>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] w-14 shrink-0">Cuándo</span>
                            <input
                              type="text"
                              value={e.note ?? ''}
                              onChange={ev => setExtraNote(e.variant_id, ev.target.value)}
                              placeholder="ej. 2 cápsulas con el desayuno, durante 3 meses…"
                              className="flex-1 text-xs text-[#0D2133] border-b border-[#C2DFE8] py-0.5 bg-transparent outline-none placeholder:text-[#B0C8D4] focus:border-[#1E8FA8]"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Buscador */}
                <div className="relative">
                  <div className="flex items-center gap-2 border border-[#D0E4EC] rounded-xl px-3 py-2 bg-white focus-within:border-[#1E8FA8] transition-colors">
                    <Search size={12} className="text-[#B0C8D4] shrink-0" />
                    <input
                      ref={extraInputRef}
                      value={extraQuery}
                      onChange={e => {
                        setExtraQuery(e.target.value);
                        searchExtras(e.target.value);
                      }}
                      onKeyDown={e => e.key === 'Enter' && searchExtras(extraQuery)}
                      placeholder="Buscar producto extra…"
                      className="flex-1 text-xs text-[#0D2133] bg-transparent outline-none placeholder:text-[#B0C8D4]"
                    />
                    {extraLoading && (
                      <span className="text-[#B0C8D4] text-[10px] animate-pulse shrink-0">buscando…</span>
                    )}
                    {extraQuery && !extraLoading && (
                      <button onClick={() => { setExtraQuery(""); setExtraResults([]); }} className="text-[#B0C8D4] hover:text-[#5B7A8C]">
                        <X size={11} />
                      </button>
                    )}
                  </div>

                  {/* Resultados del buscador */}
                  {extraResults.length > 0 && (
                    <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[#D0E4EC] rounded-xl shadow-lg overflow-hidden max-h-60 overflow-y-auto">
                      {extraResults.map(p => {
                        const alreadyAdded = extraItems.some(e => e.variant_id === p.variant_id);
                        return (
                          <button
                            key={p.id}
                            onClick={() => !alreadyAdded && addExtra(p)}
                            disabled={alreadyAdded || !p.available}
                            className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 border-b border-[#F0F6F8] last:border-0 transition-colors ${
                              alreadyAdded ? "bg-[#F4FAFB] cursor-default" :
                              !p.available ? "opacity-40 cursor-not-allowed bg-white" :
                              "bg-white hover:bg-[#F7FBFC] cursor-pointer"
                            }`}
                          >
                            {p.image && (
                              <img src={p.image} alt={p.title} className="w-9 h-9 rounded-lg object-cover shrink-0 border border-[#EEF3F7]" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-[#0D2133] line-clamp-1">{p.title}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {p.price && <span className="text-[11px] font-bold text-[#1E8FA8] tabular-nums">${p.price} MXN</span>}
                                {p.is_professional && <span className="text-[10px] bg-[#1e8fa8] text-white px-1.5 py-0.5 rounded-full font-semibold">PRO</span>}
                                {!p.available && <span className="text-[10px] text-red-500">Sin stock</span>}
                              </div>
                            </div>
                            {alreadyAdded
                              ? <CheckCircle2 size={14} className="text-[#1E8FA8] shrink-0" />
                              : <Plus size={14} className="text-[#B0C8D4] shrink-0" />
                            }
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Columna derecha: sticky */}
          <div className="hidden lg:block sticky top-4">
            {rightPanel}
          </div>

          {/* Panel mobile inline (debajo de la caja) */}
          <div className="lg:hidden mt-4">
            {rightPanel}
          </div>
        </div>
      </div>

      {/* Historial de configuraciones anteriores del protocolo */}
      <ProtocolHistory
        protocolId={protocol.id}
        onRestore={restoreFromHistory}
      />

      {/* Footer mobile: solo botón de checkout cuando no hay result */}
      {!result && (
        <div className="lg:hidden bg-white border-t border-[#D0E4EC] px-4 py-3">
          {error && <p className="text-xs text-red-500 text-center mb-2">{error}</p>}
          <button
            onClick={handleGenerate}
            disabled={loading || !selectedCount}
            className="w-full bg-[#0D2133] text-white py-3.5 rounded-xl font-bold text-sm disabled:opacity-40 hover:bg-[#162D40] transition-colors flex items-center justify-center gap-2"
          >
            <ShoppingCart size={15} />
            {loading
              ? "Generando..."
              : selectedCount
                ? `Generar checkout · ${selectedCount + extraItems.length} producto${selectedCount + extraItems.length !== 1 ? "s" : ""}`
                : "Selecciona los productos"
            }
          </button>
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────
export default function MisProtocolosPage() {
  const [protocols, setProtocols]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState(null);
  const [customerId, setCustomerId] = useState(null);

  useEffect(() => {
    const id  = Cookies.get("customerId");
    setCustomerId(id);
    const url = id ? `/api/protocols?owner_id=${id}` : "/api/protocols";
    fetch(url)
      .then(r => r.json())
      .then(d => setProtocols(d.protocols || []))
      .finally(() => setLoading(false));
  }, []);

  if (selected) {
    return (
      <ProtocolUse
        protocol={selected}
        customerId={customerId}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F9FB]">
      {/* Header estándar */}
      <div className="w-full border-b border-gray-100 bg-white px-6">
        <div className="max-w-[960px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
            Mis Protocolos
          </h1>
          <p className="text-sm text-gray-400 font-medium">
            Plantillas clínicas para prescribir suplementación por componente
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-5 h-5 border-2 border-[#1b3f7a] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <ProtocolList protocols={protocols} onSelect={setSelected} />
      )}
    </div>
  );
}
