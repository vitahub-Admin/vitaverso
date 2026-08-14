"use client";
import { useState, useRef, useCallback } from "react";
import { useCustomer } from "@/app/context/CustomerContext";
import { X, ChevronDown, FileText, Package } from "lucide-react";

const DOSE_UNITS = ['cápsula', 'tableta', 'softgel', 'gota', 'ml', 'sobre', 'cucharada'];

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency", currency: "MXN", maximumFractionDigits: 0,
  }).format(Number(n) || 0);

// ─── Card de producto (un card por producto, variantes via selector) ───────────
function ProductCard({ product, onAdd, cartVariantIds }) {
  const inStockVariants = (product.variants || []).filter(
    v => v.stock === null || v.stock > 0
  );
  const [selectedVariant, setSelectedVariant] = useState(inStockVariants[0] || product.variants?.[0] || null);

  if (!selectedVariant) return null; // no hay variantes

  const inCart       = cartVariantIds.has(selectedVariant.variant_id);
  const multiVariant = product.variants?.length > 1;
  const outOfStock   = selectedVariant.stock !== null && selectedVariant.stock <= 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-lg hover:border-[#1b3f7a]/20 transition-all">
      {/* Imagen — object-contain para no recortar */}
      <div className="relative bg-white p-2 shrink-0">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.title}
            className="w-full h-36 object-contain"
          />
        ) : (
          <div className="w-full h-36 bg-gray-50 flex items-center justify-center text-gray-200">
            <Package size={32} />
          </div>
        )}
        {product.is_professional && (
          <span className="absolute top-2 left-2 bg-[#1e8fa8] text-white text-xs font-normal px-2.5 py-1 rounded-full shadow-md ring-2 ring-white/60 tracking-widest">
            PRO
          </span>
        )}
        {product.commission_percent > 0 && (
          <span className="absolute top-2 right-2 bg-[#1b3f7a] text-white text-xs font-semibold px-2 py-1 rounded-full shadow-sm">
            {product.commission_percent}%
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1 gap-1.5">
        <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug">
          {product.title}
        </p>
        <p className="text-sm font-extrabold text-[#1b3f7a] tabular-nums">
          {multiVariant
            ? (product.min_price ? `desde ${fmtMXN(product.min_price)}` : "—")
            : fmtMXN(selectedVariant.price)}
        </p>

        {/* Selector de variante si hay más de una */}
        {multiVariant && (
          <select
            value={selectedVariant.variant_id}
            onChange={e => {
              const v = product.variants.find(v => v.variant_id === Number(e.target.value));
              setSelectedVariant(v || null);
            }}
            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#1b3f7a] bg-white text-gray-700"
          >
            {product.variants.map(v => (
              <option
                key={v.variant_id}
                value={v.variant_id}
                disabled={v.stock !== null && v.stock <= 0}
              >
                {v.variant_title || v.variant_id}
                {v.stock !== null && v.stock <= 0 ? " · sin stock" : ""}
                {!multiVariant || v.price == null ? "" : ` · ${fmtMXN(v.price)}`}
              </option>
            ))}
          </select>
        )}

        {!multiVariant && selectedVariant.stock !== null && selectedVariant.stock <= 5 && selectedVariant.stock > 0 && (
          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full w-fit">
            Últimas {selectedVariant.stock}
          </span>
        )}

        <button
          onClick={() => !outOfStock && !inCart && onAdd(product, selectedVariant)}
          disabled={inCart || outOfStock}
          className={`mt-auto pt-1.5 py-2 rounded-full text-xs font-semibold transition-all ${
            inCart
              ? "bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default"
              : outOfStock
                ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                : "bg-[#1b3f7a] text-white hover:bg-[#162d60] active:scale-95"
          }`}
        >
          {inCart ? "✓ En carrito" : outOfStock ? "Sin stock" : "Agregar"}
        </button>
      </div>
    </div>
  );
}

// ─── Item del carrito con dosage + nota ───────────────────────────────────────
function CartItem({ item, onQty, onRemove, onDosage, onNote }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gray-50 rounded-xl p-2.5 border border-gray-100 space-y-2">
      <div className="flex items-start gap-2.5">
        {item.image ? (
          <img src={item.image} alt={item.title} className="w-11 h-11 object-contain rounded-lg shrink-0 bg-white border border-gray-100 p-0.5" />
        ) : (
          <div className="w-11 h-11 rounded-lg shrink-0 bg-gray-100 flex items-center justify-center text-gray-300">
            <Package size={16} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug">{item.title}</p>
          {item.variant_title && (
            <p className="text-[10px] text-gray-400 mt-0.5">{item.variant_title}</p>
          )}
          <p className="text-xs font-bold text-[#1b3f7a] tabular-nums mt-0.5">
            {fmtMXN(item.price * item.quantity)}
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0">
          <div className="flex items-center gap-1">
            <button
              onClick={() => onQty(-1)}
              className="w-5 h-5 rounded-md bg-white border border-gray-200 text-gray-500 text-xs flex items-center justify-center hover:bg-gray-100"
            >−</button>
            <span className="text-xs font-bold w-4 text-center">{item.quantity}</span>
            <button
              onClick={() => onQty(1)}
              className="w-5 h-5 rounded-md bg-white border border-gray-200 text-gray-500 text-xs flex items-center justify-center hover:bg-gray-100"
            >+</button>
          </div>
          <button onClick={onRemove} className="text-[10px] text-red-400 hover:text-red-600 transition-colors">
            quitar
          </button>
        </div>
      </div>

      {/* Toggle indicaciones */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1 text-[10px] text-[#1e8fa8] font-semibold hover:underline"
      >
        <ChevronDown size={10} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
        {expanded ? "Ocultar indicaciones" : "Indicaciones de toma"}
      </button>

      {expanded && (
        <div className="space-y-2 pt-1 border-t border-gray-100">
          {/* Dosis */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase w-10 shrink-0">Dosis</span>
            <input
              type="number"
              min="1" max="20"
              value={item.dosage?.amount ?? 1}
              onChange={e => onDosage({ ...(item.dosage || {}), amount: Math.max(1, Number(e.target.value)) })}
              className="w-9 text-xs font-bold text-center border border-gray-200 rounded-lg py-0.5 bg-white outline-none focus:border-[#1e8fa8]"
            />
            <select
              value={item.dosage?.unit ?? "cápsula"}
              onChange={e => onDosage({ ...(item.dosage || {}), unit: e.target.value })}
              className="flex-1 text-xs text-gray-700 border border-gray-200 rounded-lg px-1.5 py-1 bg-white outline-none focus:border-[#1e8fa8]"
            >
              {DOSE_UNITS.map(u => <option key={u} value={u}>{u}s</option>)}
            </select>
          </div>
          {/* Cuándo */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase w-10 shrink-0">Cuándo</span>
            <input
              type="text"
              value={item.note ?? ""}
              onChange={e => onNote(e.target.value)}
              placeholder="ej. con el desayuno, antes de dormir…"
              className="flex-1 text-xs border-b border-gray-200 py-0.5 bg-transparent outline-none placeholder:text-gray-300 focus:border-[#1e8fa8]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Panel del carrito ────────────────────────────────────────────────────────
function CartPanel({ carrito, onQty, onRemove, onDosage, onNote,
                     totalCarrito, gananciaCarrito, onFinalizar }) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between">
          <p className="text-xs font-extrabold uppercase tracking-widest text-[#1b3f7a]">Carrito</p>
          {carrito.length > 0 && (
            <span className="bg-[#1b3f7a] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {carrito.length}
            </span>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {carrito.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-300 gap-2">
            <Package size={24} />
            <p className="text-xs">El carrito está vacío</p>
          </div>
        ) : carrito.map(p => (
          <CartItem
            key={p.variant_id}
            item={p}
            onQty={delta => onQty(p.variant_id, delta)}
            onRemove={() => onRemove(p.variant_id)}
            onDosage={dosage => onDosage(p.variant_id, dosage)}
            onNote={note => onNote(p.variant_id, note)}
          />
        ))}
      </div>

      {/* Total + Finalizar */}
      <div className="p-4 border-t border-gray-100 shrink-0 space-y-2">
        {carrito.length > 0 && (
          <>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-gray-500">Total</span>
              <span className="text-lg font-extrabold text-[#1b3f7a] tabular-nums">
                {fmtMXN(totalCarrito)}
              </span>
            </div>
            {gananciaCarrito > 0 && (
              <div className="flex justify-between items-baseline bg-emerald-50 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-emerald-700">Tu ganancia</span>
                <span className="text-sm font-extrabold text-emerald-600 tabular-nums">
                  {fmtMXN(gananciaCarrito)}
                </span>
              </div>
            )}
          </>
        )}
        <button
          onClick={onFinalizar}
          disabled={carrito.length === 0}
          className="w-full bg-[#1b3f7a] text-white py-3 rounded-xl text-sm font-bold disabled:opacity-30 hover:bg-[#162d60] active:scale-[0.98] transition-all"
        >
          Finalizar carrito
        </button>
      </div>
    </div>
  );
}

// ─── PDF del carrito ──────────────────────────────────────────────────────────
async function generarPDF(carrito, nombre, profesional) {
  const patientName     = nombre?.trim() || "Paciente";
  const professionalName = profesional || "Especialista Vitahub";
  const today = new Date().toLocaleDateString("es-MX", {
    year: "numeric", month: "long", day: "numeric",
  });

  const PLACEHOLDER_SVG = `
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ECEDD" stroke-width="1.2" stroke-linecap="round">
      <rect x="3" y="3" width="18" height="18" rx="3"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>`;

  const rowsHtml = carrito.map(({ title, variant_title, image, price, quantity, dosage, note }, idx) => {
    const imgHtml = image
      ? `<img src="${image}" class="rx-img" alt="${title}" />`
      : `<div class="rx-img rx-img-placeholder">${PLACEHOLDER_SVG}</div>`;
    const dos = dosage || { amount: 1, unit: "cápsula" };
    const isEven = idx % 2 === 1;

    return `
    <div class="rx-item ${isEven ? "rx-item--reverse" : ""}">
      <div class="rx-img-col">${imgHtml}</div>
      <div class="rx-info">
        <div class="rx-product-name">${title}</div>
        ${variant_title ? `<div class="rx-variant">${variant_title}</div>` : ""}
        <div class="rx-dose-row">
          <span class="rx-dose-badge">${dos.amount} ${dos.unit}${dos.amount > 1 ? "s" : ""} · ${quantity} unid.</span>
          ${note ? `<span class="rx-nota">📋 ${note}</span>` : ""}
          ${price != null ? `<span class="rx-price">${fmtMXN(price)}</span>` : ""}
        </div>
      </div>
    </div>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Carrito — ${patientName}</title>
<style>
  @page { size: A4; margin: 12mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0D2133; font-size: 14px; line-height: 1.5; background: #EEF3F7; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .rx-page { padding: 20px; display: flex; justify-content: center; min-height: 100vh; }
  .rx-card { width: 100%; max-width: 680px; background: #fff; border: 1px solid #D0E4EC; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(13,33,51,0.10); }
  .rx-header { background: #0D2133; color: white; padding: 18px 24px; display: flex; justify-content: space-between; align-items: flex-start; }
  .rx-logo { font-size: 20px; font-weight: 900; color: #1E8FA8; letter-spacing: -0.5px; }
  .rx-logo em { color: white; font-style: normal; }
  .rx-logo small { font-size: 11px; font-weight: 400; color: #7EAEC0; display: block; letter-spacing: 0.12em; text-transform: uppercase; }
  .rx-professional { text-align: right; }
  .rx-professional strong { font-size: 14px; color: white; display: block; }
  .rx-professional small { font-size: 11px; color: #7EAEC0; }
  .rx-patient { background: #F4FAFB; border-bottom: 1px solid #D0E4EC; padding: 14px 24px; display: flex; justify-content: space-between; align-items: center; }
  .rx-patient h2 { font-size: 16px; font-weight: 800; color: #0D2133; }
  .rx-patient p { font-size: 12px; color: #5B7A8C; margin-top: 2px; }
  .rx-patient-meta { text-align: right; font-size: 11px; color: #8AAAB8; }
  .rx-section-title { font-size: 10px; font-weight: 800; letter-spacing: 0.16em; text-transform: uppercase; color: #8AAAB8; padding: 14px 24px 8px; border-bottom: 1px solid #EEF3F7; }
  .rx-items { padding: 12px 24px 24px; display: flex; flex-direction: column; gap: 14px; }
  .rx-item { display: flex; gap: 16px; align-items: flex-start; padding: 14px; background: #F9FCFD; border: 1px solid #E2EBF0; border-radius: 12px; }
  .rx-item--reverse { flex-direction: row-reverse; background: #EEF3F7; }
  .rx-img-col { width: 80px; flex-shrink: 0; }
  .rx-img { width: 80px; height: 80px; object-fit: contain; border-radius: 8px; border: 1px solid #D0E4EC; background: #fff; }
  .rx-img-placeholder { width: 80px; height: 80px; border-radius: 8px; border: 1px solid #D0E4EC; background: #F4FAFB; display: flex; align-items: center; justify-content: center; }
  .rx-info { flex: 1; }
  .rx-product-name { font-size: 14px; font-weight: 800; color: #0D2133; line-height: 1.3; margin-bottom: 3px; }
  .rx-variant { font-size: 11px; font-weight: 700; color: #1E8FA8; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px; }
  .rx-dose-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 8px; }
  .rx-dose-badge { background: #1b3f7a; color: white; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 20px; }
  .rx-nota { font-size: 11px; color: #5B7A8C; }
  .rx-price { margin-left: auto; font-size: 13px; font-weight: 800; color: #1b3f7a; }
  .rx-footer { background: #F4FAFB; border-top: 1px solid #D0E4EC; padding: 12px 24px; text-align: center; font-size: 10px; color: #8AAAB8; }
  @media print { body { background: white; } .rx-page { padding: 0; } .rx-card { box-shadow: none; border: none; border-radius: 0; } }
</style>
</head>
<body>
<div class="rx-page">
  <div class="rx-card">
    <div class="rx-header">
      <div class="rx-logo">
        <em>Vita</em>hub Pro
        <small>Recomendación de suplementación</small>
      </div>
      <div class="rx-professional">
        <strong>${professionalName}</strong>
        <small>${today}</small>
      </div>
    </div>

    <div class="rx-patient">
      <div>
        <h2>${patientName}</h2>
        <p>Paciente</p>
      </div>
      <div class="rx-patient-meta">
        ${carrito.length} producto${carrito.length !== 1 ? "s" : ""}
      </div>
    </div>

    <div class="rx-section-title">Plan de suplementación</div>
    <div class="rx-items">
      ${rowsHtml}
    </div>

    <div class="rx-footer">
      Este documento es una recomendación de suplementación por parte del especialista.<br/>
      Vitahub Pro · pro.vitahub.mx
    </div>
  </div>
</div>
<script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

// ─── Modal finalizar ──────────────────────────────────────────────────────────
function FinalizarModal({ carrito, customerId, profesional, onClose }) {
  const [nombre, setNombre]     = useState("");
  const [telefono, setTelefono] = useState("");
  const [loading, setLoading]   = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [error, setError]       = useState(null);
  const [copied, setCopied]     = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sharecart/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_id: customerId,
          name:     nombre,
          phone:    telefono ? `+521${telefono}` : "",
          items:    carrito.map(p => ({ variant_id: p.variant_id, quantity: p.quantity || 1 })),
          extra:    { patient_info: { name: nombre, phone: telefono }, origen: "armador-carritos" },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error generando checkout");
      setCheckoutUrl(data.checkoutUrl);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(checkoutUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasDosage = carrito.some(p => p.dosage || p.note);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-gray-800 text-lg">Datos del Paciente</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {carrito.length} producto{carrito.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Nombre del Paciente
            </label>
            <input
              type="text"
              placeholder="Ej: Juan Pérez"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]/20"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Teléfono <span className="normal-case text-gray-400 font-normal">(10 dígitos, opcional)</span>
            </label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-bold text-[#1b3f7a] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
                +521
              </span>
              <input
                type="tel"
                placeholder="5512345678"
                maxLength={10}
                value={telefono}
                onChange={e => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]/20"
              />
            </div>
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          {checkoutUrl ? (
            <div className="bg-[#E6F4F8] border border-[#1E8FA8]/30 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-[#1b3f7a]">Link de checkout listo</p>
              <input
                readOnly
                value={checkoutUrl}
                className="w-full text-xs bg-white border border-[#1E8FA8]/30 rounded-lg px-3 py-2 text-[#1b3f7a]"
              />
              <div className="flex gap-2">
                <button
                  onClick={copy}
                  className="flex-1 bg-[#1b3f7a] text-white text-sm py-2.5 rounded-xl font-semibold hover:bg-[#162d60] transition-colors"
                >
                  {copied ? "¡Copiado!" : "Copiar link"}
                </button>
                <button
                  onClick={() => window.open(checkoutUrl, "_blank")}
                  className="flex-1 border border-[#1b3f7a]/30 text-[#1b3f7a] text-sm py-2.5 rounded-xl font-semibold hover:bg-[#1b3f7a]/5 transition-colors"
                >
                  Abrir
                </button>
              </div>

              {/* PDF solo si tiene indicaciones */}
              <button
                onClick={() => generarPDF(carrito, nombre, profesional)}
                className="w-full flex items-center justify-center gap-2 border border-[#1E8FA8]/30 text-[#1E8FA8] text-sm py-2.5 rounded-xl font-semibold hover:bg-[#1E8FA8]/5 transition-colors"
              >
                <FileText size={15} />
                Generar PDF del paciente
              </button>
            </div>
          ) : (
            <div className="space-y-2 pt-1">
              <button
                onClick={handleCheckout}
                disabled={loading}
                className="w-full bg-[#1b3f7a] text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-[#162d60] transition-colors"
              >
                {loading ? "Generando..." : "Generar link de checkout"}
              </button>

              {hasDosage && (
                <button
                  onClick={() => generarPDF(carrito, nombre, profesional)}
                  className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-600 text-sm py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
                >
                  <FileText size={15} />
                  Solo generar PDF (sin checkout)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function ArmadorCarritos() {
  const { customer } = useCustomer() || {};
  const customerId  = customer?.id;
  const profesional = customer
    ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Especialista Vitahub"
    : "Especialista Vitahub";

  const [query, setQuery]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [productos, setProductos] = useState([]);
  const [searched, setSearched] = useState(false);
  const [error, setError]       = useState(null);

  const [carrito, setCarrito]   = useState([]);   // [{ variant_id, product_id, title, variant_title, image, price, quantity, dosage, note }]
  const [showModal, setShowModal] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const inputRef = useRef(null);

  const handleBuscar = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(false);
    try {
      const res  = await fetch(`/api/product-catalog?search=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error al buscar");
      // Filtrar los que están completamente sin stock
      setProductos((data.items || []).filter(p => !p.all_out_of_stock));
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // cart variant IDs para detectar si ya está agregado
  const cartVariantIds = new Set(carrito.map(p => p.variant_id));

  const agregarAlCarrito = useCallback((product, variant) => {
    setCarrito(prev => {
      if (prev.find(p => p.variant_id === variant.variant_id)) return prev;
      return [
        ...prev,
        {
          variant_id:         variant.variant_id,
          product_id:         product.product_id,
          title:              product.title,
          variant_title:      variant.variant_title || null,
          image:              product.image_url || null,
          price:              variant.price ?? product.min_price ?? 0,
          commission_percent: variant.commission_percent ?? product.commission_percent ?? 0,
          quantity:           1,
          dosage:             { amount: 1, unit: "cápsula" },
          note:               "",
        },
      ];
    });
  }, []);

  const quitarDelCarrito  = useCallback((vid) => setCarrito(prev => prev.filter(p => p.variant_id !== vid)), []);
  const cambiarCantidad   = useCallback((vid, delta) =>
    setCarrito(prev => prev.map(p => p.variant_id === vid ? { ...p, quantity: Math.max(1, p.quantity + delta) } : p)), []);
  const cambiarDosage     = useCallback((vid, dosage) =>
    setCarrito(prev => prev.map(p => p.variant_id === vid ? { ...p, dosage } : p)), []);
  const cambiarNote       = useCallback((vid, note) =>
    setCarrito(prev => prev.map(p => p.variant_id === vid ? { ...p, note } : p)), []);

  const totalCarrito    = carrito.reduce((acc, p) => acc + (p.price || 0) * p.quantity, 0);
  const gananciaCarrito = carrito.reduce((acc, p) => {
    const pct = p.commission_percent ?? 0;
    return acc + (p.price || 0) * p.quantity * (pct / 100);
  }, 0);

  const cartPanel = (
    <CartPanel
      carrito={carrito}
      onQty={cambiarCantidad}
      onRemove={quitarDelCarrito}
      onDosage={cambiarDosage}
      onNote={cambiarNote}
      totalCarrito={totalCarrito}
      gananciaCarrito={gananciaCarrito}
      onFinalizar={() => setShowModal(true)}
    />
  );

  return (
    <div className="h-screen flex flex-col bg-[#F7F9FB] overflow-hidden">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-100 px-6 shrink-0">
        <div className="max-w-[1280px] mx-auto py-5">
          <h1 className="text-2xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-0.5">
            Armador de Protocolos
          </h1>
          <p className="text-xs text-gray-400 font-medium">
            Busca productos, agrega indicaciones de toma y genera el link de checkout para tu paciente
          </p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden max-w-[1280px] mx-auto w-full">

        {/* ── Área principal ── */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 lg:p-6 gap-4 min-w-0">

          {/* Buscador */}
          <form onSubmit={handleBuscar} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar productos… ej: magnesio, omega, colágeno"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]/20 shadow-sm"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-[#1b3f7a] text-white px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-[#162d60] transition-colors shadow-sm shrink-0"
            >
              {loading ? "…" : "Buscar"}
            </button>
          </form>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          {/* Grid de productos */}
          <div className="flex-1 overflow-y-auto pb-24 lg:pb-4
            [&::-webkit-scrollbar]:w-1.5
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:bg-gray-200
            [&::-webkit-scrollbar-thumb]:rounded-full">
            {loading && (
              <div className="flex items-center justify-center h-48 text-gray-400 text-sm gap-2">
                <div className="w-4 h-4 border-2 border-[#1b3f7a] border-t-transparent rounded-full animate-spin" />
                Buscando…
              </div>
            )}
            {!loading && searched && productos.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm gap-1">
                <p className="font-semibold">Sin resultados</p>
                <p className="text-xs text-gray-300">No se encontraron productos con stock para "{query}"</p>
              </div>
            )}
            {!loading && !searched && (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-300">
                <Package size={28} />
                <p className="text-sm">Escribe un término para buscar productos</p>
              </div>
            )}
            {!loading && productos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {productos.map(p => (
                  <ProductCard
                    key={p.product_id}
                    product={p}
                    onAdd={agregarAlCarrito}
                    cartVariantIds={cartVariantIds}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar carrito — solo desktop ── */}
        <div className="hidden lg:flex w-80 shrink-0 border-l border-gray-100 bg-white flex-col">
          {cartPanel}
        </div>
      </div>

      {/* ── Botón flotante — mobile ── */}
      <div className="lg:hidden fixed bottom-5 right-5 z-30">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2.5 bg-[#1b3f7a] text-white px-5 py-3 rounded-full shadow-xl font-semibold text-sm active:scale-95 transition-all"
        >
          <Package size={16} />
          Ver carrito
          {carrito.length > 0 && (
            <span className="bg-white text-[#1b3f7a] text-xs font-extrabold w-5 h-5 rounded-full flex items-center justify-center">
              {carrito.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Drawer — mobile ── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex justify-end" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-80 max-w-[90vw] bg-white h-full shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
              <p className="font-extrabold text-[#1b3f7a] text-sm uppercase tracking-widest">Carrito</p>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-300 hover:text-gray-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {cartPanel}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal finalizar ── */}
      {showModal && (
        <FinalizarModal
          carrito={carrito}
          customerId={customerId}
          profesional={profesional}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
