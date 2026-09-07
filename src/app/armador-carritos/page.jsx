"use client";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useCustomer } from "@/app/context/CustomerContext";
import {
  X, ChevronDown, FileText, Package, Search,
  ArrowLeft, ShoppingBag, Trash2, ChevronRight,
  Plus, Minus, Heart, Pencil, MessageCircle,
  Sun, FlaskConical, Zap, Droplets,
} from "lucide-react";

const DOSE_UNITS = ["cápsula", "tableta", "softgel", "gota", "ml", "mg", "g", "sobre", "cucharada", "probiótico", "unidad"];
const MOMENTOS   = ["Mañana", "Mediodía", "Tarde", "Noche", "Con desayuno", "Con almuerzo", "Con cena", "Antes de dormir"];
const ACOMP      = ["Con agua", "Con comida", "En ayunas"];

// ── Helpers de posología ─────────────────────────────────────────────────────

/** Pluraliza la unidad de dosis para el texto de instrucción */
function pluralUnit(u = "", n = 1) {
  if (n === 1) return u;
  if (["ml", "mg", "g"].includes(u.toLowerCase())) return u;
  if (u.endsWith("s") || u.endsWith("S")) return u; // ya plural (viene de metafield)
  return u + "s";
}

/**
 * Convierte lista de momentos a español natural.
 * ["Mañana", "Tarde"] → "por la mañana y por la tarde"
 */
const MOMENTO_NATURAL = {
  "Mañana":          "por la mañana",
  "Mediodía":        "al mediodía",
  "Tarde":           "por la tarde",
  "Noche":           "por la noche",
  "Con desayuno":    "con el desayuno",
  "Con almuerzo":    "con el almuerzo",
  "Con cena":        "con la cena",
  "Antes de dormir": "antes de dormir",
};

const ACOMP_NATURAL = {
  "Con agua":   "con agua",
  "Con comida": "con comida",
  "En ayunas":  "en ayunas",
};

function joinList(items) {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/**
 * Genera texto de instrucción natural estilo Fullscript.
 * Resultado: "Tomar 5 Gotas por la mañana, al mediodía y por la tarde, con comida."
 *
 * @param {number}  amount   — número de dosis (o unidades si no hay meta)
 * @param {string}  unit     — unidad clásica (fallback sin meta)
 * @param {Array}   momentos — ["Mañana", "Tarde", ...]
 * @param {string}  acomp    — "Con agua" | "Con comida" | "En ayunas"
 * @param {object}  [meta]   — { dosis, tipo_dosis } desde metafield
 */
function buildInstruccion(amount, unit, momentos = [], acomp = "", meta = null) {
  // — cantidad física a tomar —
  let doseStr = "";
  if (amount) {
    if (meta?.tipo_dosis && meta?.dosis != null) {
      const total = amount * meta.dosis;
      doseStr = `${total} ${meta.tipo_dosis}`;
    } else if (unit) {
      doseStr = `${amount} ${pluralUnit(unit, amount)}`;
    }
  }

  // — momentos → español natural —
  const mNat = momentos.map(m => MOMENTO_NATURAL[m] ?? m.toLowerCase()).filter(Boolean);
  const momentosStr = joinList(mNat);

  // — acompañamiento —
  const acompStr = ACOMP_NATURAL[acomp] ?? (acomp ? acomp.toLowerCase() : "");

  // — ensamblar oración —
  let sentence = "";
  if (doseStr)     sentence  = `Tomar ${doseStr}`;
  if (momentosStr) sentence += (sentence ? ` ${momentosStr}` : momentosStr);
  if (acompStr)    sentence += (sentence ? `, ${acompStr}` : acompStr);
  if (sentence && !sentence.endsWith(".")) sentence += ".";

  return sentence;
}

// ── Smart unit detector ───────────────────────────────────────────────────────
function detectUnit(title = "", variantTitle = "") {
  const text = `${title} ${variantTitle}`.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, ""); // strip accents
  if (/c[a]psulas?/.test(text))        return "cápsula";
  if (/tabletas?/.test(text))          return "tableta";
  if (/softgels?/.test(text))          return "softgel";
  if (/\bml\b/.test(text))             return "ml";
  if (/gotas?/.test(text))             return "gota";
  if (/\bmg\b/.test(text))             return "mg";
  if (/cucharadas?/.test(text))        return "cucharada";
  if (/\bsobres?\b/.test(text))        return "sobre";
  if (/probi[o]ticos?/.test(text))     return "probiótico";
  if (/unidades?/.test(text))          return "unidad";
  if (/\b(gr?|gramos?)\b/.test(text))  return "g";
  return "cápsula";
}

// Retorna el tier de descuento activo ({qty, pct}) para una cantidad dada
function getBundleTier(rules, qty) {
  if (!rules?.length || qty < 2) return null;
  return [...rules].sort((a, b) => b.qty - a.qty).find(r => qty >= r.qty) || null;
}

const FEATURED = [
  { handle: "vitamina-d-en-mexico", label: "Vitamina D3", desc: "Regulación del calcio, inmunidad y salud ósea",          icon: Sun,          from: "from-amber-400",   to: "to-orange-500"  },
  { handle: "enzimas-digestivas",   label: "Enzimas",      desc: "Digestión eficiente y absorción óptima de nutrientes",   icon: FlaskConical, from: "from-emerald-500", to: "to-teal-700"    },
  { handle: "magnesio",             label: "Magnesio",     desc: "Función muscular, sueño y sistema nervioso",             icon: Zap,          from: "from-[#1E8FA8]",   to: "to-blue-700"    },
  { handle: "omega-3-en-mexico",    label: "Omega 3",      desc: "Salud cardiovascular, cerebro y control inflamatorio",   icon: Droplets,     from: "from-blue-500",    to: "to-indigo-600"  },
];

const NAV_TABS = [
  ...FEATURED,
  // Handles adicionales — sin duplicar los que ya están en FEATURED
  { handle: "nad-suplemento",              label: "NAD+"           },
  { handle: "proteinas",                   label: "Proteínas"      },
  { handle: "vitaminas",                   label: "Vitaminas"      },
  { handle: "inositol-en-mexico",          label: "Inositol"       },
  { handle: "berberina-en-mexico",         label: "Berberina"      },
  { handle: "melena-de-leon-o-lions-mane", label: "Melena de León" },
  { handle: "mas-vendidos",               label: "Más Vendidos"   },
];

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(Number(n) || 0);

// ── useFavorites — Supabase (auth) + localStorage (fallback / no-auth) ────────
function useFavorites(customerId) {
  const [favorites, setFavorites] = useState({});

  // Carga inicial + migración localStorage→Supabase
  useEffect(() => {
    const LOCAL_KEY = "vh_fav_products";

    if (!customerId) {
      // Sin sesión → usar solo localStorage
      try {
        const s = localStorage.getItem(LOCAL_KEY);
        if (s) setFavorites(JSON.parse(s));
      } catch {}
      return;
    }

    // Con sesión → cargar desde Supabase
    fetch("/api/favoritos")
      .then(r => r.json())
      .then(async d => {
        if (!d.ok) throw new Error(d.error);

        // Construir mapa product_id → product_data
        const remote = {};
        for (const f of d.favorites || []) remote[f.product_id] = f.product_data;

        // Migrar favoritos que estaban en localStorage y no están en Supabase
        try {
          const local = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}");
          const toMigrate = Object.entries(local).filter(([pid]) => !remote[pid]);
          if (toMigrate.length > 0) {
            const payload = toMigrate.map(([product_id, product_data]) => ({ product_id, product_data }));
            const res = await fetch("/api/favoritos", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            if ((await res.json()).ok) {
              toMigrate.forEach(([pid, data]) => { remote[pid] = data; });
              localStorage.removeItem(LOCAL_KEY); // localStorage ya no necesario
            }
          } else if (Object.keys(local).length > 0) {
            localStorage.removeItem(LOCAL_KEY); // limpiar igual si todo ya estaba en remoto
          }
        } catch {}

        setFavorites(remote);
      })
      .catch(() => {
        // Supabase no disponible → caer en localStorage
        try {
          const s = localStorage.getItem(LOCAL_KEY);
          if (s) setFavorites(JSON.parse(s));
        } catch {}
      });
  }, [customerId]);

  const toggleFavorite = useCallback((product) => {
    const snapshot = {
      product_id: product.product_id, title: product.title,
      image_url: product.image_url || null, brand: product.brand || null,
      min_price: product.min_price || null, is_professional: product.is_professional || false,
      commission_percent: product.commission_percent || 0,
      componente: product.componente || null, variants: product.variants || [],
      all_out_of_stock: product.all_out_of_stock || false,
    };

    setFavorites(prev => {
      const next = { ...prev };
      const isNowFav = !next[product.product_id];

      if (isNowFav) {
        next[product.product_id] = snapshot;
      } else {
        delete next[product.product_id];
      }

      // Persistir
      if (customerId) {
        if (isNowFav) {
          fetch("/api/favoritos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product_id: product.product_id, product_data: snapshot }),
          }).catch(() => {});
        } else {
          fetch(`/api/favoritos?product_id=${product.product_id}`, { method: "DELETE" }).catch(() => {});
        }
      } else {
        try { localStorage.setItem("vh_fav_products", JSON.stringify(next)); } catch {}
      }

      return next;
    });
  }, [customerId]);

  const isFavorite   = useCallback((id) => !!favorites[id], [favorites]);
  const favoriteList = Object.values(favorites);
  return { favoriteList, toggleFavorite, isFavorite };
}

// ── PDF ───────────────────────────────────────────────────────────────────────
async function generarPDF(carrito, nombre, profesional) {
  const patientName      = nombre?.trim() || "Paciente";
  const professionalName = profesional    || "Especialista Vitahub";
  const today = new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" });
  const PH = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#9ECEDD" stroke-width="1.2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
  const rowsHtml = carrito.map(({ title, variant_title, image, price, quantity, dosage }, idx) => {
    const imgHtml = image ? `<img src="${image}" class="rx-img" alt="${title}"/>` : `<div class="rx-img rx-img-ph">${PH}</div>`;
    const dos        = dosage || { amount: 1, unit: "cápsula" };
    const dTx        = `${dos.amount} ${dos.unit}${dos.amount > 1 ? "s" : ""}`;
    const momentoTxt = Array.isArray(dos.momentos) && dos.momentos.length ? dos.momentos.join(" · ") : (dos.momento || "");
    const notaTxt    = [momentoTxt, dos.acompanamiento, dos.nota].filter(Boolean).join(" · ");
    return `<div class="rx-item ${idx % 2 ? "rx-r" : ""}"><div class="rx-ic">${imgHtml}</div><div class="rx-info"><div class="rx-name">${title}</div>${variant_title ? `<div class="rx-variant">${variant_title}</div>` : ""}<div class="rx-dose-row"><span class="rx-badge">${dTx} · ${quantity} unid.</span>${notaTxt ? `<span class="rx-nota">📋 ${notaTxt}</span>` : ""}${price != null ? `<span class="rx-price">${fmtMXN(price)}</span>` : ""}</div></div></div>`;
  }).join("");
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Protocolo — ${patientName}</title><style>@page{size:A4;margin:12mm 14mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Helvetica Neue',Arial,sans-serif;color:#0D2133;font-size:14px;background:#EEF3F7;-webkit-print-color-adjust:exact;print-color-adjust:exact}.rx-page{padding:20px;display:flex;justify-content:center}.rx-card{width:100%;max-width:680px;background:#fff;border:1px solid #D0E4EC;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(13,33,51,.10)}.rx-header{background:#0D2133;color:white;padding:18px 24px;display:flex;justify-content:space-between;align-items:flex-start}.rx-logo{font-size:20px;font-weight:900;color:#1E8FA8}.rx-logo em{color:white;font-style:normal}.rx-logo small{font-size:11px;font-weight:400;color:#7EAEC0;display:block;letter-spacing:.12em;text-transform:uppercase}.rx-prof{text-align:right}.rx-prof strong{font-size:14px;color:white;display:block}.rx-prof small{font-size:11px;color:#7EAEC0}.rx-patient{background:#F4FAFB;border-bottom:1px solid #D0E4EC;padding:14px 24px;display:flex;justify-content:space-between;align-items:center}.rx-patient h2{font-size:16px;font-weight:800}.rx-patient p{font-size:12px;color:#5B7A8C}.rx-patient-meta{text-align:right;font-size:11px;color:#8AAAB8}.rx-section{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#8AAAB8;padding:14px 24px 8px;border-bottom:1px solid #EEF3F7}.rx-items{padding:12px 24px 24px;display:flex;flex-direction:column;gap:14px}.rx-item{display:flex;gap:16px;align-items:flex-start;padding:14px;background:#F9FCFD;border:1px solid #E2EBF0;border-radius:12px}.rx-r{flex-direction:row-reverse;background:#EEF3F7}.rx-ic{width:80px;flex-shrink:0}.rx-img{width:80px;height:80px;object-fit:contain;border-radius:8px;border:1px solid #D0E4EC;background:#fff}.rx-img-ph{width:80px;height:80px;border-radius:8px;border:1px solid #D0E4EC;background:#F4FAFB;display:flex;align-items:center;justify-content:center}.rx-info{flex:1}.rx-name{font-size:14px;font-weight:800;color:#0D2133;line-height:1.3;margin-bottom:3px}.rx-variant{font-size:11px;font-weight:700;color:#1E8FA8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}.rx-dose-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px}.rx-badge{background:#1b3f7a;color:white;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px}.rx-nota{font-size:11px;color:#5B7A8C}.rx-price{margin-left:auto;font-size:13px;font-weight:800;color:#1b3f7a}.rx-footer{background:#F4FAFB;border-top:1px solid #D0E4EC;padding:12px 24px;text-align:center;font-size:10px;color:#8AAAB8}@media print{body{background:white}.rx-page{padding:0}.rx-card{box-shadow:none;border:none;border-radius:0}}</style></head><body><div class="rx-page"><div class="rx-card"><div class="rx-header"><div class="rx-logo"><em>Vita</em>hub Pro<small>Protocolo de suplementación</small></div><div class="rx-prof"><strong>${professionalName}</strong><small>${today}</small></div></div><div class="rx-patient"><div><h2>${patientName}</h2><p>Paciente</p></div><div class="rx-patient-meta">${carrito.length} producto${carrito.length !== 1 ? "s" : ""}</div></div><div class="rx-section">Plan de suplementación</div><div class="rx-items">${rowsHtml}</div><div class="rx-footer">Recomendación de suplementación · Vitahub Pro · pro.vitahub.mx</div></div></div><script>window.onload=()=>{window.print()}<\/script></body></html>`;
  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); }
}

// ── Protocol Indicator ────────────────────────────────────────────────────────
function ProtocolIndicator({ carrito, total, patientData, onPatientChange, onGoToDraft, onClear, onRemoveItem }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  if (carrito.length === 0) {
    return (
      <button onClick={onGoToDraft}
        className="flex items-center gap-2 bg-white border border-[#D0E4EC] text-[#5B7A8C] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#F7F9FB] hover:border-[#1E8FA8] hover:text-[#0D2133] transition-all">
        <ShoppingBag size={14} /> Crear protocolo
      </button>
    );
  }
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-[#0D2133] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#162d60] transition-all shadow-sm">
        <ShoppingBag size={14} />
        <span className="hidden sm:inline">Protocolo</span>
        <span className="bg-[#1E8FA8] text-white text-xs font-bold px-1.5 py-0.5 rounded min-w-[20px] text-center tabular-nums">{carrito.length}</span>
        <span className="hidden sm:inline tabular-nums font-bold">{fmtMXN(total)}</span>
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[304px] bg-white rounded-xl shadow-2xl border border-[#D0E4EC] z-50 overflow-hidden">
          {/* Paciente */}
          <div className="px-4 pt-3 pb-3 border-b border-[#EEF3F7] bg-[#F7F9FB] space-y-2">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Datos del paciente</p>
            <input type="text" placeholder="Nombre del paciente"
              value={patientData.nombre}
              onChange={e => onPatientChange({ ...patientData, nombre: e.target.value })}
              className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E8FA8] bg-white" />
            <div className="flex gap-1.5">
              <span className="text-[11px] font-bold text-[#1E8FA8] bg-[#E6F4F8] border border-[#C2DFE8] rounded-lg px-2 py-2 shrink-0 self-center">+521</span>
              <input type="tel" placeholder="Teléfono (opcional)" maxLength={10}
                value={patientData.telefono}
                onChange={e => onPatientChange({ ...patientData, telefono: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                className="flex-1 border border-[#D0E4EC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E8FA8] bg-white" />
            </div>
          </div>
          {/* Productos */}
          <div className="max-h-48 overflow-y-auto divide-y divide-[#EEF3F7]">
            {carrito.map((item) => {
              const dos = item.dosage || {};
              const dTx        = dos.amount ? `${dos.amount} ${dos.unit}${dos.amount > 1 ? "s" : ""}` : null;
              const momentoTxt = Array.isArray(dos.momentos) && dos.momentos.length ? dos.momentos.join(", ") : (dos.momento || "");
              return (
                <div key={item.variant_id} className="flex items-start gap-2.5 px-4 py-2.5">
                  {item.image
                    ? <img src={item.image} alt="" className="w-8 h-8 rounded object-contain shrink-0 bg-[#F7F9FB] border border-[#D0E4EC]" />
                    : <div className="w-8 h-8 rounded bg-[#F7F9FB] shrink-0 flex items-center justify-center text-[#B0C8D4]"><Package size={12} /></div>}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-[#0D2133] line-clamp-1">{item.title}</p>
                    {item.variant_title && <p className="text-[10px] text-[#5B7A8C]">{item.variant_title}</p>}
                    {dTx && <p className="text-[10px] text-[#1E8FA8] mt-0.5">{dTx}{momentoTxt ? ` · ${momentoTxt}` : ""}</p>}
                    <p className="text-[10px] font-extrabold text-[#0D2133] tabular-nums mt-0.5">{fmtMXN(item.price)}</p>
                  </div>
                  <button onClick={() => onRemoveItem(item.variant_id)} className="text-[#B0C8D4] hover:text-red-400 transition-colors shrink-0 mt-0.5"><X size={12} /></button>
                </div>
              );
            })}
          </div>
          {/* Footer */}
          <div className="border-t border-[#EEF3F7] p-3 space-y-2 bg-[#F7F9FB]">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#5B7A8C] font-semibold">Total</span>
              <span className="text-sm font-extrabold text-[#0D2133] tabular-nums">{fmtMXN(total)}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { onClear(); setOpen(false); }} className="flex items-center gap-1 px-3 py-2 border border-[#D0E4EC] text-[#5B7A8C] text-xs rounded-lg hover:text-red-400 hover:border-red-200 transition-colors font-semibold">
                <Trash2 size={11} /> Limpiar
              </button>
              <button onClick={() => { onGoToDraft(); setOpen(false); }} className="flex-1 bg-[#0D2133] text-white text-xs py-2 rounded-lg font-semibold hover:bg-[#162d60] transition-colors">
                Ir al borrador →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── DraftItem — card editable dentro del borrador ────────────────────────────
function DraftItem({ item, idx, onRemove, onUpdateDosage, onUpdateQuantity }) {
  const dos   = item.dosage || {};
  const smart = detectUnit(item.title, item.variant_title || "");

  const [open,     setOpen]     = useState(false);
  const [amount,   setAmount]   = useState(dos.amount ?? 1);
  const [unit,     setUnit]     = useState(dos.unit ?? smart);
  const [momentos, setMomentos] = useState(dos.momentos ?? (dos.momento ? [dos.momento] : []));
  const [acomp,    setAcomp]    = useState(dos.acompanamiento ?? "");
  const [nota,     setNota]     = useState(dos.nota ?? "");
  const [qty,      setQty]      = useState(item.quantity ?? 1);

  // useRef garantiza que save() siempre lee los valores más recientes sin closure stale
  const latest = useRef({});
  latest.current = { amount, unit, momentos, acomp, nota };

  const save = useCallback((overrides = {}) => {
    const { amount, unit, momentos, acomp, nota } = { ...latest.current, ...overrides };
    // meta se preserva del dosage original — no se edita en el borrador
    onUpdateDosage(item.variant_id, { amount, unit, momentos, acompanamiento: acomp, nota, meta: item.dosage?.meta ?? null });
  }, [item.variant_id, onUpdateDosage, item.dosage?.meta]); // eslint-disable-line

  const handleField = (setter, key, val) => { setter(val); save({ [key]: val }); };

  const toggleMomento = (m) => {
    const prev = latest.current.momentos;
    const next = prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m];
    setMomentos(next);          // actualiza UI
    save({ momentos: next });   // persiste en carrito
  };

  const meta        = item.dosage?.meta;
  const bundlePlan  = item.bundlePlan || null;
  const activeTier  = getBundleTier(bundlePlan?.rules, qty);
  const dTx = amount
    ? (meta?.tipo_dosis && meta?.dosis != null
        ? `${amount * meta.dosis} ${meta.tipo_dosis}`
        : `${amount} ${unit}${amount > 1 ? "s" : ""}`)
    : null;
  return (
    <div className="bg-white border border-[#D0E4EC] rounded-xl overflow-hidden">
      {/* Fila principal */}
      <div className="p-4 flex gap-3 items-start">
        <span className="text-[10px] font-extrabold text-[#5B7A8C] bg-[#F7F9FB] border border-[#D0E4EC] rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-0.5">{idx + 1}</span>
        {item.image
          ? <img src={item.image} alt="" className="w-14 h-14 rounded-lg object-contain shrink-0 bg-[#F7F9FB] border border-[#D0E4EC]" />
          : <div className="w-14 h-14 rounded-lg bg-[#F7F9FB] shrink-0 flex items-center justify-center text-[#B0C8D4] border border-[#D0E4EC]"><Package size={20} /></div>}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-[#0D2133] leading-snug">{item.title}</p>
          {item.variant_title && <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#1E8FA8] mt-0.5">{item.variant_title}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {dTx && <span className="bg-[#0D2133] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{dTx}</span>}
            {momentos.length > 0 && <span className="bg-[#F7F9FB] text-[#5B7A8C] text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#D0E4EC]">{momentos.join(", ")}</span>}
            {acomp && <span className="bg-[#F7F9FB] text-[#5B7A8C] text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#D0E4EC]">{acomp}</span>}
          </div>
          {nota && <p className="text-[10px] text-[#5B7A8C] mt-1.5 italic">📋 {nota}</p>}
          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Precio */}
              <p className="text-sm font-extrabold tabular-nums flex items-baseline gap-1.5">
                {activeTier ? (
                  <>
                    <span className="text-[#B0C8D4] line-through text-xs font-normal">{fmtMXN(item.price * qty)}</span>
                    <span className="text-emerald-600">{fmtMXN(item.price * qty * (1 - activeTier.pct / 100))}</span>
                    <span className="text-[10px] font-bold text-emerald-600">−{activeTier.pct}%</span>
                  </>
                ) : (
                  <>
                    <span className="text-[#0D2133]">{fmtMXN(item.price * qty)}</span>
                    {qty > 1 && <span className="text-[10px] font-normal text-[#5B7A8C]">({qty} × {fmtMXN(item.price)})</span>}
                  </>
                )}
              </p>
              {/* Selector de cantidad de frascos */}
              <div className="flex items-center bg-[#F7F9FB] border border-[#D0E4EC] rounded-lg">
                <button onClick={() => { const n = Math.max(1, qty - 1); setQty(n); onUpdateQuantity(item.variant_id, n); }}
                  className="w-7 h-7 flex items-center justify-center text-[#5B7A8C] hover:text-[#0D2133] font-bold transition-colors text-base">−</button>
                <span className="w-6 text-center text-xs font-extrabold text-[#0D2133] tabular-nums select-none">{qty}</span>
                <button onClick={() => { const n = qty + 1; setQty(n); onUpdateQuantity(item.variant_id, n); }}
                  className="w-7 h-7 flex items-center justify-center text-[#5B7A8C] hover:text-[#0D2133] font-bold transition-colors text-base">+</button>
              </div>
              <span className="text-[10px] text-[#B0C8D4]">{qty === 1 ? "frasco" : "frascos"}</span>
              <button onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1 text-[10px] font-bold text-[#1E8FA8] hover:text-[#0D2133] transition-colors ml-auto">
                <Pencil size={10} /> {open ? "Cerrar" : "Editar dosis"}
              </button>
            </div>
            {/* Hint bundle */}
            {bundlePlan?.rules?.length > 0 && (
              <p className="text-[10px] text-[#8AAAB8]">
                {bundlePlan.rules.map(r => `${r.qty}u = −${r.pct}%`).join(" · ")}
              </p>
            )}
          </div>
        </div>
        <button onClick={() => onRemove(item.variant_id)} className="text-[#B0C8D4] hover:text-red-400 transition-colors shrink-0 mt-0.5"><X size={14} /></button>
      </div>

      {/* Panel de edición inline */}
      {open && (
        <div className="border-t border-[#EEF3F7] bg-[#F7F9FB] px-4 py-4 space-y-4">
          {/* Dosis — meta-aware (igual que ProductDetail) */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2">
              {meta?.tipo_dosis ? "Número de dosis" : "Dosis por toma"}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center bg-white border border-[#D0E4EC] rounded-lg shrink-0">
                <button onClick={() => handleField(setAmount, "amount", Math.max(meta?.tipo_dosis ? 1 : 0.5, amount - (meta?.tipo_dosis ? 1 : 0.5)))}
                  className="w-9 h-9 flex items-center justify-center text-[#5B7A8C] hover:text-[#0D2133] transition-colors font-bold text-lg">−</button>
                <span className="w-10 text-center text-sm font-extrabold text-[#0D2133] tabular-nums select-none">{amount}</span>
                <button onClick={() => handleField(setAmount, "amount", amount + (meta?.tipo_dosis ? 1 : 0.5))}
                  className="w-9 h-9 flex items-center justify-center text-[#5B7A8C] hover:text-[#0D2133] transition-colors font-bold text-lg">+</button>
              </div>
              {meta?.tipo_dosis && meta?.dosis != null ? (
                /* Con metafields: badge fijo + resultado calculado */
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-3 py-2 bg-[#F4FAFB] border border-[#C2DFE8] rounded-lg text-sm font-semibold text-[#1E8FA8]">dosis</span>
                  <span className="text-[#B0C8D4] text-sm">=</span>
                  <span className="text-sm font-extrabold text-[#0D2133] tabular-nums">
                    {amount * meta.dosis} <span className="font-semibold text-[#5B7A8C]">{meta.tipo_dosis}</span>
                  </span>
                </div>
              ) : (
                /* Sin metafields: dropdown clásico */
                <select value={unit} onChange={e => handleField(setUnit, "unit", e.target.value)}
                  className="w-auto min-w-[90px] max-w-[140px] border border-[#D0E4EC] rounded-lg px-2.5 py-2 text-sm text-[#0D2133] focus:outline-none focus:border-[#1E8FA8] bg-white">
                  {DOSE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              )}
            </div>
            {meta?.tipo_dosis && meta?.dosis != null && (
              <p className="text-[11px] text-[#8AAAB8] mt-1.5">
                Porción del fabricante: <span className="font-semibold">{meta.dosis} {meta.tipo_dosis}</span>
                {meta.total_dosis && <span className="text-[#B0C8D4]"> · {meta.total_dosis} dosis por frasco</span>}
              </p>
            )}
          </div>
          {/* Momentos — multi-select */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-1.5">
              Cuándo tomarlo <span className="normal-case font-normal text-[#B0C8D4]">(puede ser varios)</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MOMENTOS.map(m => (
                <button key={m} onClick={() => toggleMomento(m)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${momentos.includes(m) ? "bg-[#0D2133] text-white border-[#0D2133]" : "bg-white text-[#5B7A8C] border-[#D0E4EC] hover:border-[#1E8FA8]"}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          {/* Acompañamiento */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-1.5">Acompañamiento</p>
            <div className="flex flex-wrap gap-1.5">
              {ACOMP.map(a => (
                <button key={a} onClick={() => handleField(setAcomp, "acompanamiento", acomp === a ? "" : a)}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${acomp === a ? "bg-[#1E8FA8] text-white border-[#1E8FA8]" : "bg-white text-[#5B7A8C] border-[#D0E4EC] hover:border-[#1E8FA8]"}`}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          {/* Nota */}
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-1.5">Nota <span className="normal-case font-normal text-[#B0C8D4]">(opcional)</span></p>
            <input type="text" placeholder="ej. Tomar durante 3 meses" value={nota}
              onChange={e => handleField(setNota, "nota", e.target.value)}
              className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1E8FA8] bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Draft View ────────────────────────────────────────────────────────────────
function DraftView({ carrito, patientData, onPatientChange, customerId, profesional, onBack, onRemoveItem, onClear, onUpdateDosage, onUpdateQuantity }) {
  const [loading, setLoading]         = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [whatsappUrl, setWhatsappUrl] = useState(null);
  const [error, setError]             = useState(null);
  const [copied, setCopied]           = useState(false);
  const total = carrito.reduce((acc, p) => acc + (p.price || 0) * (p.quantity || 1), 0);

  const handleCheckout = async () => {
    // Teléfono requerido para enviar por WhatsApp
    if (!patientData.telefono || patientData.telefono.replace(/\D/g, "").length < 10) {
      setError("Ingresa el teléfono del paciente (10 dígitos) para enviar por WhatsApp");
      return;
    }
    setLoading(true); setError(null);
    // Formato canónico de paciente — el mismo que usan los sharecarts de Shopify:
    // claves name/phone, teléfono siempre con prefijo +521
    const patientName  = patientData.nombre?.trim() || "";
    const patientPhone = patientData.telefono ? `+521${patientData.telefono}` : "";
    try {
      const res  = await fetch("/api/sharecart/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_id: customerId, name: patientName, phone: patientPhone,
          items: carrito.map(p => ({ variant_id: p.variant_id, quantity: p.quantity || 1 })),
          extra: {
            patient_info: { name: patientName, phone: patientPhone },
            origen: "protocolo",
            dosis_map: Object.fromEntries(
              carrito.map(p => {
                const d = p.dosage || {};
                return [String(p.variant_id), {
                  instruccion:    buildInstruccion(d.amount, d.unit, d.momentos || [], d.acompanamiento || "", d.meta || null),
                  dosis_amount:   d.amount   ?? null,
                  dosis_unit:     d.unit     ?? null,
                  momentos:       d.momentos ?? [],
                  acompanamiento: d.acompanamiento ?? null,
                  nota:           d.nota     ?? null,
                }];
              })
            ),
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error generando checkout");
      const url = data.checkoutUrl;
      setCheckoutUrl(url);
      // Componer y abrir WhatsApp automáticamente
      const saludo  = patientName ? `¡Hola ${patientName}!` : "¡Hola!";
      const mensaje = `${saludo} 🌿 Te comparto tu protocolo de suplementación personalizado:\n\n${url}\n\nCualquier duda, con gusto te ayudo.`;
      const wa = `https://wa.me/521${patientData.telefono}?text=${encodeURIComponent(mensaje)}`;
      setWhatsappUrl(wa);
      window.open(wa, "_blank");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };
  const copy = () => { navigator.clipboard.writeText(checkoutUrl); setCopied(true); setTimeout(() => setCopied(false), 2200); };

  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 py-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[#5B7A8C] hover:text-[#0D2133] text-sm font-semibold mb-6 transition-colors">
        <ArrowLeft size={14} /> Volver al catálogo
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Lista de productos */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-[#0D2133]">Borrador del Protocolo</h2>
            <button onClick={onClear} className="flex items-center gap-1 text-xs text-[#5B7A8C] hover:text-red-400 transition-colors font-semibold">
              <Trash2 size={11} /> Limpiar todo
            </button>
          </div>
          {carrito.length === 0 ? (
            <div className="bg-white border border-[#D0E4EC] rounded-xl p-8 text-center text-[#B0C8D4]">
              <Package size={32} className="mx-auto mb-2" />
              <p className="text-sm">Sin productos en el protocolo</p>
            </div>
          ) : carrito.map((item, idx) => (
            <DraftItem key={item.variant_id} item={item} idx={idx}
              onRemove={onRemoveItem} onUpdateDosage={onUpdateDosage} onUpdateQuantity={onUpdateQuantity} />
          ))}
        </div>

        {/* Panel derecho */}
        <div className="space-y-4">
          {/* Datos paciente */}
          <div className="bg-white border border-[#D0E4EC] rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-[#F7F9FB] border-b border-[#EEF3F7]">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">Datos del Paciente</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-1.5 block">Nombre</label>
                <input type="text" placeholder="Nombre del paciente"
                  value={patientData.nombre} onChange={e => onPatientChange({ ...patientData, nombre: e.target.value })}
                  className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1E8FA8]" />
              </div>
              <div>
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-1.5 block">
                  Teléfono <span className="normal-case font-normal text-[#1E8FA8]">para WhatsApp</span>
                </label>
                <div className="flex gap-2">
                  <span className="text-xs font-bold text-[#1E8FA8] bg-[#E6F4F8] border border-[#C2DFE8] rounded-lg px-2.5 py-2.5 shrink-0">+521</span>
                  <input type="tel" placeholder="5512345678" maxLength={10}
                    value={patientData.telefono} onChange={e => onPatientChange({ ...patientData, telefono: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                    className={`flex-1 border rounded-lg px-3 py-2.5 text-sm focus:outline-none transition-colors
                      ${patientData.telefono.length === 10 ? "border-[#1E8FA8] bg-[#F4FAFB]" : "border-[#D0E4EC] focus:border-[#1E8FA8]"}`} />
                </div>
              </div>
            </div>
          </div>

          {/* Resumen */}
          <div className="bg-white border border-[#D0E4EC] rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm text-[#5B7A8C]">{carrito.length} producto{carrito.length !== 1 ? "s" : ""}</span>
            <span className="text-lg font-extrabold text-[#0D2133] tabular-nums">{fmtMXN(total)}</span>
          </div>

          {/* Acciones */}
          {error && <p className="text-red-500 text-xs">{error}</p>}
          {checkoutUrl ? (
            <div className="bg-[#E6F4F8] border border-[#C2DFE8] rounded-xl p-4 space-y-3">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#1E8FA8]">Protocolo listo para enviar</p>
              {/* Acción principal: WhatsApp */}
              <button onClick={() => window.open(whatsappUrl, "_blank")}
                className="w-full bg-[#25D366] text-white text-sm py-2.5 rounded-lg font-semibold hover:bg-[#1ebe5b] transition-colors flex items-center justify-center gap-2">
                <MessageCircle size={15} /> Abrir WhatsApp
              </button>
              {/* Acciones secundarias */}
              <div className="flex gap-2">
                <button onClick={copy} className="flex-1 border border-[#C2DFE8] text-[#0D2133] text-sm py-2 rounded-lg font-semibold hover:bg-white transition-colors">
                  {copied ? "¡Copiado!" : "Copiar link"}
                </button>
                <button onClick={() => generarPDF(carrito, patientData.nombre, profesional)}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-[#C2DFE8] text-[#1E8FA8] text-sm py-2 rounded-lg font-semibold hover:bg-white transition-colors">
                  <FileText size={13} /> PDF
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <button onClick={handleCheckout} disabled={loading || carrito.length === 0}
                className="w-full bg-[#0D2133] text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-[#162d60] transition-colors flex items-center justify-center gap-2">
                <MessageCircle size={15} /> {loading ? "Generando…" : "Enviar por WhatsApp"}
              </button>
              {!patientData.telefono && (
                <p className="text-[11px] text-[#B0C8D4] text-center leading-tight">
                  Ingresa el teléfono del paciente para enviar
                </p>
              )}
              <button onClick={() => generarPDF(carrito, patientData.nombre, profesional)}
                className="w-full flex items-center justify-center gap-2 border border-[#D0E4EC] text-[#5B7A8C] text-sm py-3 rounded-xl font-semibold hover:bg-[#F7F9FB] transition-colors">
                <FileText size={15} /> Solo PDF
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Collection Card ───────────────────────────────────────────────────────────
function CollectionCard({ item, onClick, loading, imageUrl }) {
  return (
    <button onClick={() => onClick(item)} disabled={loading}
      className="group relative overflow-hidden rounded-xl border border-[#D0E4EC] flex h-[120px] sm:h-[132px] hover:shadow-md hover:border-[#1E8FA8]/40 transition-all disabled:opacity-60 text-left w-full">
      <div className="w-[38%] relative shrink-0 overflow-hidden">
        {imageUrl
          ? <img src={imageUrl} alt={item.label} className="absolute inset-0 w-full h-full object-cover" />
          : <div className={`absolute inset-0 bg-gradient-to-br ${item.from} ${item.to} flex items-center justify-center`}>
              {item.icon
                ? <item.icon size={44} className="text-white/90 drop-shadow" strokeWidth={1.5} />
                : <span className="text-4xl sm:text-5xl drop-shadow">{item.emoji}</span>
              }
            </div>}
      </div>
      <div className="flex-1 bg-[#F7F9FB] group-hover:bg-[#EEF3F7] transition-colors flex flex-col justify-center px-4 py-3">
        <p className="text-sm font-bold text-[#0D2133] leading-snug">{item.label}</p>
        <p className="text-xs text-[#5B7A8C] mt-1 leading-relaxed line-clamp-2">{item.desc}</p>
        <p className="text-xs font-semibold text-[#1E8FA8] mt-2.5 flex items-center gap-1">
          Explorar <ChevronRight size={11} className="group-hover:translate-x-0.5 transition-transform" />
        </p>
      </div>
    </button>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────────
function ProductCard({ product, onClick, inProtocol, isFavorite, onFavorite, onQuickAdd }) {
  return (
    <div className="bg-white rounded-xl border border-[#D0E4EC] overflow-hidden flex flex-col hover:shadow-md hover:border-[#1E8FA8]/40 transition-all group">
      {/* Imagen — click abre detalle */}
      <div onClick={() => onClick(product)} className="cursor-pointer">
        <div className="relative bg-[#F7F9FB] p-3 flex items-center justify-center" style={{ height: "148px" }}>
          {product.image_url
            ? <img src={product.image_url} alt={product.title} className="h-full w-full object-contain" />
            : <div className="flex items-center justify-center w-full h-full text-[#B0C8D4]"><Package size={32} /></div>}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            {product.is_professional && <span className="bg-[#0D2133] text-white text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-widest">PRO</span>}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onFavorite(product); }}
            className={`absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full border transition-all shadow-sm ${isFavorite(product.product_id) ? "bg-red-50 border-red-200 text-red-500" : "bg-white/90 border-[#D0E4EC] text-[#B0C8D4] hover:text-red-400 hover:border-red-200"}`}
          >
            <Heart size={12} fill={isFavorite(product.product_id) ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
      {/* Info — click abre detalle */}
      <div onClick={() => onClick(product)} className="px-3 pt-2.5 pb-2 flex flex-col flex-1 gap-1 cursor-pointer">
        <p className="text-xs font-bold text-[#0D2133] leading-snug line-clamp-2">{product.title}</p>
        {/* brand/vendor oculto — vendor de Shopify no refleja la marca real; pendiente mapeo correcto */}
        {product.commission_percent > 0 && (
          <p className="text-[10px] font-extrabold text-[#1E8FA8]">+{product.commission_percent}% comisión</p>
        )}
        <p className="text-sm font-extrabold text-[#0D2133] tabular-nums mt-auto pt-1">
          {product.min_price ? (product.variants?.length > 1 ? `desde ${fmtMXN(product.min_price)}` : fmtMXN(product.min_price)) : "—"}
        </p>
      </div>
      {/* Botón agregar rápido */}
      {onQuickAdd && (
        <div className="px-3 pb-3 pt-1.5">
          <button
            onClick={(e) => { e.stopPropagation(); onQuickAdd(product); }}
            className={`w-full text-[11px] font-bold py-1.5 rounded-lg border transition-all ${inProtocol ? "bg-[#E6F4F8] text-[#1E8FA8] border-[#C2DFE8] hover:bg-[#C2DFE8]" : "bg-[#F7F9FB] text-[#0D2133] border-[#D0E4EC] hover:bg-[#0D2133] hover:text-white hover:border-[#0D2133]"}`}>
            {inProtocol ? "✓ En protocolo" : "+ Agregar"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Smart Suggestions ─────────────────────────────────────────────────────────
function SmartSuggestions({ componente, excludeId, onProductClick, isFavorite, onFavorite }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!componente) return;
    fetch(`/api/product-catalog?componente=${encodeURIComponent(componente)}`)
      .then(r => r.json())
      .then(d => setItems((d.items || []).filter(p => p.product_id !== excludeId && !p.all_out_of_stock).slice(0, 3)))
      .catch(() => {});
  }, [componente, excludeId]);
  if (!items.length) return null;
  return (
    <div className="border-t border-[#EEF3F7] pt-6 mt-6">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-1">Sugerencias inteligentes</p>
      <p className="text-xs text-[#5B7A8C] mb-4">Productos con el mismo componente principal</p>
      <div className="grid grid-cols-3 gap-3">
        {items.map(p => (
          <ProductCard key={p.product_id} product={p} onClick={onProductClick}
            inProtocol={false} isFavorite={isFavorite} onFavorite={onFavorite} />
        ))}
      </div>
    </div>
  );
}

// ── Product Detail View ───────────────────────────────────────────────────────
function ProductDetailView({ product, onBack, backLabel, onAdd, onUpdate, cartItem, isFavorite, onFavorite, onProductClick, onBreadcrumb }) {
  const inCart = !!cartItem;
  const inStockVariants = (product.variants || []).filter(v => v.stock === null || v.stock > 0);
  const [selectedVariant, setSelectedVariant] = useState(
    cartItem
      ? product.variants?.find(v => v.variant_id === cartItem.variant_id) || inStockVariants[0] || product.variants?.[0]
      : inStockVariants[0] || product.variants?.[0]
  );
  const smartUnit = detectUnit(product.title, selectedVariant?.variant_title || "");
  const [amount,   setAmount]   = useState(cartItem?.dosage?.amount ?? 1);
  const [unit,     setUnit]     = useState(cartItem?.dosage?.unit ?? smartUnit);
  const [momentos, setMomentos] = useState(
    cartItem?.dosage?.momentos ?? (cartItem?.dosage?.momento ? [cartItem.dosage.momento] : [])
  );
  const [acomp,    setAcomp]    = useState(cartItem?.dosage?.acompanamiento ?? "");
  const [nota,     setNota]     = useState(cartItem?.dosage?.nota ?? "");
  const [quantity, setQuantity] = useState(cartItem?.quantity ?? 1);
  const [descHtml,      setDescHtml]      = useState("");
  const [descLoading,   setDescLoading]   = useState(false);
  const [descTableOpen, setDescTableOpen] = useState(false);
  const [descTextOpen,  setDescTextOpen]  = useState(false);
  const [instrOpen,     setInstrOpen]     = useState(true);
  const [images,      setImages]      = useState([]);
  const [mainImg,     setMainImg]     = useState(product.image_url || null);
  const [zoomOpen,    setZoomOpen]    = useState(false);

  // Cerrar zoom con ESC
  useEffect(() => {
    if (!zoomOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setZoomOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomOpen]);
  const [variantMeta, setVariantMeta] = useState({}); // { variant_id: { tipo_dosis, dosis, total_unidades, total_dosis } }
  const [bundlePlan,  setBundlePlan]  = useState(null); // { label, rules: [{qty, pct}] } | null

  // Cargar descripción + imágenes + metafields de variante + bundle plan
  useEffect(() => {
    setDescLoading(true);
    fetch(`/api/product-catalog?description=${product.product_id}`)
      .then(r => r.json())
      .then(d => {
        setDescHtml(d.descriptionHtml || "<p>Sin descripción disponible.</p>");
        if (d.images?.length > 1) { setImages(d.images); setMainImg(d.images[0]); }
        if (d.variantMeta) setVariantMeta(d.variantMeta);
        if (d.bundlePlan)  setBundlePlan(d.bundlePlan);
      })
      .catch(() => {})
      .finally(() => setDescLoading(false));
  }, [product.product_id]);

  // Pre-llenar dosis desde metafields cuando cambia la variante seleccionada
  // (solo si el usuario no editó manualmente — no pisamos si ya hay carrito)
  useEffect(() => {
    if (!selectedVariant || cartItem) return; // no pisar si ya está en carrito
    const meta = variantMeta[String(selectedVariant.variant_id)];
    if (!meta) return;
    // El stepper representa DOSIS (porciones del fabricante).
    // Siempre arranca en 1 — la composición de esa dosis la muestra el label.
    setAmount(1);
    if (meta.tipo_dosis) setUnit(meta.tipo_dosis);
  }, [selectedVariant?.variant_id, variantMeta]); // eslint-disable-line

  const outOfStock = selectedVariant?.stock !== null && selectedVariant?.stock <= 0;
  const price      = selectedVariant?.price ?? product.min_price;

  const toggleMomento = (m) => setMomentos(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);

  const handleAdd = () => {
    if (!selectedVariant || outOfStock) return;
    const meta = variantMeta[String(selectedVariant.variant_id)] || null;
    const dosage = { amount, unit, momentos, acompanamiento: acomp, nota, meta };
    inCart ? onUpdate(cartItem.variant_id, selectedVariant, dosage, quantity, bundlePlan)
           : onAdd(product, selectedVariant, dosage, quantity, bundlePlan);
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="flex items-center gap-2 text-[#5B7A8C] hover:text-[#0D2133] text-sm font-semibold transition-colors group">
          <ArrowLeft size={20} className="transition-transform group-hover:-translate-x-0.5" /> {backLabel || "Volver"}
        </button>
        <button
          onClick={() => onFavorite(product)}
          className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all ${isFavorite(product.product_id) ? "bg-red-50 border-red-200 text-red-500" : "border-[#D0E4EC] text-[#5B7A8C] hover:text-red-400 hover:border-red-200"}`}
        >
          <Heart size={12} fill={isFavorite(product.product_id) ? "currentColor" : "none"} />
          {isFavorite(product.product_id) ? "Quitar de favoritos" : "Agregar a favoritos"}
        </button>
      </div>

      {/* Breadcrumb de categorías — solo si el producto tiene niveles */}
      {onBreadcrumb && (product.level_1 || product.level_2 || product.level_3) && (
        <nav className="flex items-center gap-1 flex-wrap mb-4 -mt-2">
          <button onClick={() => onBreadcrumb(null, null, null)}
            className="text-[11px] text-[#8AAAB8] hover:text-[#0D2133] transition-colors font-medium">
            Inicio
          </button>
          {product.level_1 && (
            <>
              <span className="text-[#C2DFE8] text-[11px]">›</span>
              <button onClick={() => onBreadcrumb('l1', product.level_1, product)}
                className="text-[11px] text-[#8AAAB8] hover:text-[#1E8FA8] transition-colors font-medium">
                {product.level_1}
              </button>
            </>
          )}
          {product.level_2 && (
            <>
              <span className="text-[#C2DFE8] text-[11px]">›</span>
              <button onClick={() => onBreadcrumb('l2', product.level_2, product)}
                className="text-[11px] text-[#8AAAB8] hover:text-[#1E8FA8] transition-colors font-medium">
                {product.level_2}
              </button>
            </>
          )}
          {product.level_3 && (
            <>
              <span className="text-[#C2DFE8] text-[11px]">›</span>
              <button onClick={() => onBreadcrumb('l3', product.level_3, product)}
                className="text-[11px] text-[#8AAAB8] hover:text-[#1E8FA8] transition-colors font-medium">
                {product.level_3}
              </button>
            </>
          )}
          <span className="text-[#C2DFE8] text-[11px]">›</span>
          <span className="text-[11px] text-[#5B7A8C] font-semibold truncate max-w-[180px]">{product.title}</span>
        </nav>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
        {/* Imagen principal + galería */}
        <div className="flex flex-col gap-3">
          <div
            onClick={() => mainImg && setZoomOpen(true)}
            className={`group relative bg-[#F7F9FB] border border-[#D0E4EC] rounded-2xl overflow-hidden flex items-center justify-center ${mainImg ? "cursor-zoom-in" : ""}`}
            style={{ aspectRatio: "1/1" }}
          >
            {mainImg
              ? <>
                  <img src={mainImg} alt={product.title} className="w-full h-full object-contain p-6 transition-transform duration-300 group-hover:scale-[1.03]" />
                  {/* Ícono zoom */}
                  <div className="absolute bottom-3 right-3 w-7 h-7 bg-white/80 backdrop-blur-sm border border-[#D0E4EC] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm">
                    <Search size={13} className="text-[#5B7A8C]" />
                  </div>
                </>
              : <div className="text-[#B0C8D4]"><Package size={64} /></div>}
          </div>
          {/* Miniaturas */}
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
              {images.map((img, i) => (
                <button key={i} onClick={() => setMainImg(img)}
                  className={`shrink-0 w-14 h-14 rounded-lg border-2 overflow-hidden bg-[#F7F9FB] transition-all ${mainImg === img ? "border-[#1E8FA8]" : "border-[#D0E4EC] hover:border-[#8AAAB8]"}`}>
                  <img src={img} alt="" className="w-full h-full object-contain p-1" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Lightbox zoom ───────────────────────────────────────────────────── */}
        {zoomOpen && mainImg && (
          <div
            onClick={() => setZoomOpen(false)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <button
              onClick={() => setZoomOpen(false)}
              className="absolute top-4 right-4 w-9 h-9 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors"
            >
              <X size={18} />
            </button>
            <img
              src={mainImg}
              alt={product.title}
              onClick={e => e.stopPropagation()}
              className="max-h-[90vh] max-w-[90vw] object-contain rounded-xl shadow-2xl"
            />
            {/* Navegación entre imágenes en el lightbox */}
            {images.length > 1 && (
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2">
                {images.map((img, i) => (
                  <button key={i} onClick={e => { e.stopPropagation(); setMainImg(img); }}
                    className={`w-2 h-2 rounded-full transition-all ${mainImg === img ? "bg-white scale-125" : "bg-white/40 hover:bg-white/70"}`} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-2">
            {product.is_professional && <span className="bg-[#0D2133] text-white text-[10px] font-extrabold px-2.5 py-1 rounded uppercase tracking-widest">PRO</span>}
            {product.commission_percent > 0 && <span className="bg-[#E6F4F8] text-[#1E8FA8] text-xs font-extrabold px-2.5 py-1 rounded">{product.commission_percent}% comisión</span>}
            {inCart && <span className="bg-emerald-50 text-emerald-600 text-xs font-extrabold px-2.5 py-1 rounded">✓ En protocolo</span>}
          </div>
          <div>
            <h1 className="text-base sm:text-xl font-medium text-[#0D2133] leading-snug">{product.title}</h1>
            {/* brand oculto — pendiente mapeo vendor→marca real */}
          </div>
          {product.variants?.length > 1 && (
            <div>
              <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2 block">Presentación</label>
              <select value={selectedVariant?.variant_id}
                onChange={e => setSelectedVariant(product.variants.find(v => v.variant_id === Number(e.target.value)))}
                className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2.5 text-sm bg-white outline-none focus:border-[#1E8FA8] text-[#0D2133]">
                {product.variants.map(v => (
                  <option key={v.variant_id} value={v.variant_id} disabled={v.stock !== null && v.stock <= 0}>
                    {v.variant_title || "Único"}{v.stock !== null && v.stock <= 0 ? " · sin stock" : ""}{v.price ? ` · ${fmtMXN(v.price)}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-extrabold text-[#0D2133] tabular-nums">{price ? fmtMXN(price) : "—"}</span>
          </div>
          {product.primary_ingredient && (
            <div className="bg-[#F7F9FB] border border-[#D0E4EC] rounded-xl px-4 py-3">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2">Componente principal</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#0D2133]">{product.primary_ingredient}</span>
                {product.primary_amount && <span className="text-sm font-extrabold text-[#1E8FA8] tabular-nums">{product.primary_amount} {product.primary_unit || "mg"}</span>}
              </div>
            </div>
          )}

          {/* Indicaciones — primero */}
          <div className="border border-[#1E8FA8]/40 rounded-xl overflow-hidden bg-white">
            {/* Header — colapsado muestra el texto de instrucción */}
            <button onClick={() => setInstrOpen(o => !o)} className="w-full flex items-start justify-between px-4 py-3.5 text-left hover:bg-[#F7F9FB] transition-colors gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#0D2133]">Indicaciones de toma</span>
                  <span className="text-[9px] font-extrabold bg-[#1E8FA8] text-white px-1.5 py-0.5 rounded uppercase tracking-widest shrink-0">Requerido</span>
                </div>
                {/* Preview colapsado — estilo Fullscript */}
                {!instrOpen && (
                  <p className="text-xs text-[#1E8FA8] mt-0.5 truncate">
                    {buildInstruccion(amount, unit, momentos, acomp, variantMeta[String(selectedVariant?.variant_id)]) || "Sin indicaciones configuradas"}
                  </p>
                )}
              </div>
              <ChevronDown size={15} className={`text-[#5B7A8C] transition-transform shrink-0 mt-0.5 ${instrOpen ? "rotate-180" : ""}`} />
            </button>

            {instrOpen && (
              <div className="px-4 pb-5 pt-1 space-y-5 border-t border-[#EEF3F7]">
                {/* Dosis */}
                {(() => {
                  const meta = variantMeta[String(selectedVariant?.variant_id)];
                  const hasMeta = meta?.tipo_dosis && meta?.dosis != null;
                  const totalUnits = hasMeta ? amount * meta.dosis : null;

                  return (
                    <div>
                      <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2 block">
                        {hasMeta ? "Número de dosis" : "Dosis por toma"}
                      </label>
                      <div className="flex items-center gap-2">
                        {/* Stepper */}
                        <div className="flex items-center border border-[#D0E4EC] rounded-lg overflow-hidden bg-white shrink-0">
                          <button onClick={() => setAmount(a => Math.max(hasMeta ? 1 : 0.5, a - (hasMeta ? 1 : 0.5)))}
                            className="w-9 h-9 flex items-center justify-center text-[#5B7A8C] hover:bg-[#F7F9FB] font-bold text-lg">−</button>
                          <span className="w-10 text-center text-sm font-extrabold text-[#0D2133] tabular-nums select-none">{amount}</span>
                          <button onClick={() => setAmount(a => a + (hasMeta ? 1 : 0.5))}
                            className="w-9 h-9 flex items-center justify-center text-[#5B7A8C] hover:bg-[#F7F9FB] font-bold text-lg">+</button>
                        </div>

                        {hasMeta ? (
                          /* Con metafields: tipo_dosis como badge fijo + resultado */
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-3 py-2 bg-[#F4FAFB] border border-[#C2DFE8] rounded-lg text-sm font-semibold text-[#1E8FA8]">
                              {amount === 1 ? "dosis" : "dosis"}
                            </span>
                            <span className="text-[#B0C8D4] text-sm">=</span>
                            <span className="text-sm font-extrabold text-[#0D2133] tabular-nums">
                              {totalUnits} <span className="font-semibold text-[#5B7A8C]">{meta.tipo_dosis}</span>
                            </span>
                          </div>
                        ) : (
                          /* Sin metafields: dropdown clásico */
                          <select value={unit} onChange={e => setUnit(e.target.value)}
                            className="w-auto min-w-[90px] max-w-[140px] border border-[#D0E4EC] rounded-lg px-2.5 py-2 text-sm bg-white outline-none focus:border-[#1E8FA8] text-[#0D2133]">
                            {DOSE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                          </select>
                        )}
                      </div>

                      {/* Nota de referencia del fabricante */}
                      {hasMeta && (
                        <p className="text-[11px] text-[#8AAAB8] mt-1.5">
                          Porción del fabricante: <span className="font-semibold">{meta.dosis} {meta.tipo_dosis}</span>
                          {meta.total_dosis && <span className="text-[#B0C8D4]"> · {meta.total_dosis} dosis por frasco</span>}
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Momentos — multi-select */}
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2 block">
                    Cuándo tomarlo <span className="normal-case font-normal text-[#B0C8D4]">(puede ser varios)</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {MOMENTOS.map(m => (
                      <button key={m} onClick={() => toggleMomento(m)}
                        className={`px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all border ${momentos.includes(m) ? "bg-[#0D2133] text-white border-[#0D2133]" : "bg-white text-[#5B7A8C] border-[#D0E4EC] hover:border-[#1E8FA8] hover:text-[#1E8FA8]"}`}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Acompañamiento */}
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2 block">Acompañamiento</label>
                  <div className="flex flex-wrap gap-1.5">
                    {ACOMP.map(a => (
                      <button key={a} onClick={() => setAcomp(p => p === a ? "" : a)}
                        className={`px-2.5 py-1.5 rounded-full text-xs font-semibold transition-all border ${acomp === a ? "bg-[#1E8FA8] text-white border-[#1E8FA8]" : "bg-white text-[#5B7A8C] border-[#D0E4EC] hover:border-[#1E8FA8] hover:text-[#1E8FA8]"}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Nota */}
                <div>
                  <label className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2 block">Nota <span className="normal-case font-normal text-[#B0C8D4]">(opcional)</span></label>
                  <textarea value={nota} onChange={e => setNota(e.target.value)} placeholder="ej. Tomar durante 3 meses" rows={2}
                    className="w-full border border-[#D0E4EC] rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#1E8FA8] resize-none text-[#0D2133] placeholder:text-[#B0C8D4]" />
                </div>

                {/* Instrucción para el paciente — resumen parseado */}
                {(amount > 0 && (unit || variantMeta[String(selectedVariant?.variant_id)]?.tipo_dosis)) && (() => {
                  const meta = variantMeta[String(selectedVariant?.variant_id)];
                  const instrText = buildInstruccion(amount, unit, momentos, acomp, meta);
                  const notaClean = nota?.trim();
                  // Nota como segunda oración separada
                  const notaSentence = notaClean
                    ? (notaClean.endsWith(".") ? notaClean : notaClean + ".")
                    : "";
                  return (
                    <div className="bg-[#F4FAFB] border border-[#C2DFE8] rounded-lg px-3.5 py-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#1E8FA8] mb-1">Instrucción para el paciente</p>
                      <p className="text-sm text-[#0D2133] leading-relaxed">
                        {instrText}
                        {notaSentence && <span className="text-[#5B7A8C]"> {notaSentence}</span>}
                      </p>
                    </div>
                  );
                })()}

                {/* Ingesta diaria estimada */}
                {(() => {
                  const nutrients = product.nutrients || [];
                  if (!nutrients.length) return null;
                  const meta      = variantMeta[String(selectedVariant?.variant_id)];
                  const hasMeta   = meta?.tipo_dosis && meta?.dosis != null;
                  const timesPerDay = momentos.length || 1;
                  // Con metafields: amount = dosis (porciones), cada dosis = 1 serving
                  // Sin metafields: amount = unidades, dividir entre serving_size del catálogo
                  const servingSize = hasMeta ? 1 : (Number(product.serving_size) || meta?.dosis || 1);
                  const mult = (amount / servingSize) * timesPerDay;
                  return (
                    <div className="bg-[#F7F9FB] border border-[#D0E4EC] rounded-lg px-3.5 py-3">
                      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] mb-2">Ingesta diaria estimada</p>
                      <div className="space-y-1">
                        {nutrients.map(n => (
                          <div key={n.name} className="flex justify-between items-baseline text-xs gap-2">
                            <span className="text-[#5B7A8C] truncate">{n.name}</span>
                            <span className="font-extrabold tabular-nums text-[#0D2133] shrink-0">
                              {Number((n.amount * mult).toFixed(1)).toLocaleString("es-MX")} {n.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-[#B0C8D4] mt-2">
                        {(() => {
                          const meta = variantMeta[String(selectedVariant?.variant_id)];
                          if (meta?.tipo_dosis && meta?.dosis != null) {
                            return `${amount} dosis (${amount * meta.dosis} ${meta.tipo_dosis}) × ${timesPerDay === 1 ? "1 toma/día" : `${timesPerDay} tomas/día`}`;
                          }
                          return `${amount} ${pluralUnit(unit, amount)} × ${timesPerDay === 1 ? "1 toma/día" : `${timesPerDay} tomas/día`}${servingSize !== 1 ? ` (porción del fabricante: ${servingSize} ${pluralUnit(unit, servingSize)})` : ""}`;
                        })()}
                      </p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Descripción — separada en dos cards después de posología */}
          {(() => {
            // Separar tabla HTML del resto de la descripción
            const tableRegex = /<table[\s\S]*?<\/table>/gi;
            const tables = descHtml.match(tableRegex) || [];
            const tableHtml = tables.join("");
            const textHtml  = descHtml.replace(tableRegex, "")
              .replace(/(<p>\s*<\/p>\s*)+/gi, "")
              .replace(/^\s*(<br\s*\/?>\s*)+/i, "")
              .trim();

            return (
              <>
                {/* Card A — Tabla nutricional */}
                {(descLoading || tableHtml) && (() => {
                  const meta = variantMeta[String(selectedVariant?.variant_id)];
                  const porcionStr = meta?.dosis != null && meta?.tipo_dosis
                    ? `${meta.dosis} ${meta.tipo_dosis}`
                    : null;
                  const dosisStr = meta?.total_dosis != null
                    ? `${meta.total_dosis} dosis por frasco`
                    : null;
                  const porcionLabel = [porcionStr, dosisStr].filter(Boolean).join(" · ");

                  return (
                    <div className="border border-[#D0E4EC] rounded-xl overflow-hidden">
                      <button onClick={() => setDescTableOpen(o => !o)}
                        className="w-full flex items-center justify-between px-4 py-3.5 text-left bg-white hover:bg-[#F7F9FB] transition-colors">
                        <div>
                          <span className="text-sm font-bold text-[#0D2133]">Tabla de información nutricional</span>
                          {porcionLabel && (
                            <p className="text-[11px] text-[#8AAAB8] mt-0.5">
                              Porción del fabricante: <span className="font-semibold text-[#5B7A8C]">{porcionLabel}</span>
                            </p>
                          )}
                        </div>
                        <ChevronDown size={15} className={`text-[#5B7A8C] transition-transform shrink-0 ${descTableOpen ? "rotate-180" : ""}`} />
                      </button>
                      {descTableOpen && (
                        <div className="px-4 pb-4 pt-2 border-t border-[#EEF3F7] bg-white overflow-x-auto">
                          {descLoading
                            ? <p className="text-xs text-[#B0C8D4] text-center py-4">Cargando…</p>
                            : <div className="[&_table]:w-full [&_table]:text-xs [&_table]:border-collapse [&_td]:border [&_td]:border-[#D0E4EC] [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:border [&_th]:border-[#D0E4EC] [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:bg-[#F0F5F8] [&_th]:text-left [&_th]:font-semibold [&_th]:text-[#5B7A8C] [&_td]:text-[#0D2133]"
                                dangerouslySetInnerHTML={{ __html: tableHtml }} />}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Card B — Descripción de texto */}
                {(descLoading || textHtml) && (
                  <div className="border border-[#D0E4EC] rounded-xl overflow-hidden">
                    <button onClick={() => setDescTextOpen(o => !o)}
                      className="w-full flex items-center justify-between px-4 py-3.5 text-left bg-white hover:bg-[#F7F9FB] transition-colors">
                      <span className="text-sm font-bold text-[#0D2133]">Descripción del producto</span>
                      <ChevronDown size={15} className={`text-[#5B7A8C] transition-transform ${descTextOpen ? "rotate-180" : ""}`} />
                    </button>
                    {descTextOpen && (
                      <div className="px-4 pb-4 pt-2 border-t border-[#EEF3F7] bg-white max-h-72 overflow-y-auto">
                        {descLoading
                          ? <p className="text-xs text-[#B0C8D4] text-center py-4">Cargando…</p>
                          : <div className="prose prose-xs max-w-none text-[#5B7A8C] leading-relaxed [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:mb-1"
                              dangerouslySetInnerHTML={{ __html: textHtml || descHtml }} />}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}

          {/* Cantidad de frascos */}
          {!outOfStock && (() => {
            const activeTier = getBundleTier(bundlePlan?.rules, quantity);
            const totalBase   = price * quantity;
            const totalDsc    = activeTier ? totalBase * (1 - activeTier.pct / 100) : totalBase;
            return (
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] shrink-0">Cantidad</span>
                  <div className="flex items-center bg-[#F7F9FB] border border-[#D0E4EC] rounded-lg">
                    <button onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="w-9 h-9 flex items-center justify-center text-[#5B7A8C] hover:text-[#0D2133] font-bold text-lg transition-colors">−</button>
                    <span className="w-10 text-center text-sm font-extrabold text-[#0D2133] tabular-nums select-none">{quantity}</span>
                    <button onClick={() => setQuantity(q => q + 1)}
                      className="w-9 h-9 flex items-center justify-center text-[#5B7A8C] hover:text-[#0D2133] font-bold text-lg transition-colors">+</button>
                  </div>
                  <span className="text-xs text-[#5B7A8C]">{quantity === 1 ? "frasco" : "frascos"}</span>
                  {quantity > 1 && price && (
                    <span className="ml-auto flex items-baseline gap-1.5 tabular-nums">
                      {activeTier && (
                        <span className="text-[11px] text-[#B0C8D4] line-through">{fmtMXN(totalBase)}</span>
                      )}
                      <span className={`text-xs font-extrabold ${activeTier ? "text-emerald-600" : "text-[#1E8FA8]"}`}>
                        Total: {fmtMXN(totalDsc)}
                      </span>
                      {activeTier && (
                        <span className="text-[10px] font-bold text-emerald-600">−{activeTier.pct}%</span>
                      )}
                    </span>
                  )}
                </div>
                {/* Hint de bundle — solo si hay reglas */}
                {bundlePlan?.rules?.length > 0 && (
                  <p className="text-[11px] text-[#8AAAB8] pl-px">
                    {bundlePlan.rules.map(r => `Comprando ${r.qty} = −${r.pct}% dto`).join(" · ")}
                  </p>
                )}
              </div>
            );
          })()}

          {outOfStock
            ? <div className="w-full bg-[#F7F9FB] text-[#B0C8D4] text-sm font-semibold py-3.5 rounded-xl text-center border border-[#D0E4EC]">Sin stock disponible</div>
            : <button onClick={handleAdd}
                className={`w-full py-3.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] ${inCart ? "bg-[#1E8FA8] text-white hover:bg-[#1a7d94]" : "bg-[#0D2133] text-white hover:bg-[#162d60]"}`}>
                {inCart ? "✓ Actualizar en protocolo" : `Agregar al protocolo${quantity > 1 ? ` (×${quantity})` : ""}`}
              </button>
          }
          {selectedVariant?.sku && <p className="text-[10px] text-[#B0C8D4]">SKU: {selectedVariant.sku}</p>}
        </div>
      </div>

      {product.componente && (
        <SmartSuggestions componente={product.componente} excludeId={product.product_id}
          onProductClick={onProductClick} isFavorite={isFavorite} onFavorite={onFavorite} />
      )}
    </div>
  );
}

// ── Página principal (inner — necesita Suspense por useSearchParams) ──────────
function ArmadorCarritosInner() {
  const { customer } = useCustomer() || {};
  const customerId   = customer?.id;
  const searchParams = useSearchParams();
  const fromCartToken = searchParams?.get("fromCart") || null;
  const profesional  = customer
    ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || "Especialista Vitahub"
    : "Especialista Vitahub";

  const { favoriteList, toggleFavorite, isFavorite } = useFavorites(customerId);

  // Navegación
  const [view, setView]                 = useState("home");
  const [prevView, setPrevView]         = useState(null);
  const [activeTabKey, setActiveTabKey] = useState(null);
  const [collLabel, setCollLabel]       = useState("");
  const [levelCtx, setLevelCtx]         = useState(null); // { trail:[{label,field,value}], field, value }

  // Datos
  const [query, setQuery]           = useState("");
  const [aiMode, setAiMode]         = useState(false);
  const [aiResult, setAiResult]     = useState(null); // { resumen, ingredientes }
  const [productos, setProductos]   = useState([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [detailProduct, setDetailProduct] = useState(null);
  const [collectionImages, setCollectionImages] = useState({});

  // Protocolo
  const [carrito, setCarrito]         = useState([]);
  const [patientData, setPatientData] = useState({ nombre: "", telefono: "" });

  // ── Persistencia localStorage ────────────────────────────────────────────────
  useEffect(() => {
    // Si venimos de un carrito compartido, no cargamos el localStorage
    // para no pisarlos (el efecto de fromCartToken los carga después)
    if (fromCartToken) return;
    try {
      const saved = localStorage.getItem("vh_protocolo_carrito");
      if (saved) {
        const parsed = JSON.parse(saved);
        setCarrito(parsed.map(item => ({
          ...item,
          dosage: item.dosage ? {
            ...item.dosage,
            momentos: item.dosage.momentos ?? (item.dosage.momento ? [item.dosage.momento] : []),
          } : {},
        })));
      }
    } catch {}
    try {
      const savedPat = localStorage.getItem("vh_protocolo_paciente");
      if (savedPat) setPatientData(JSON.parse(savedPat));
    } catch {}
  }, [fromCartToken]);

  // ── Cargar desde token de sharecart (Regenerar protocolo) ────────────────────
  useEffect(() => {
    if (!fromCartToken) return;
    (async () => {
      try {
        const res  = await fetch(`/api/sharecart/restore?token=${fromCartToken}`);
        const data = await res.json();
        if (!data.ok) { console.warn("[fromCart] restore error:", data.error); return; }
        setCarrito(data.items || []);
        if (data.patientData) setPatientData(data.patientData);
        setView("draft");
      } catch (e) {
        console.error("[fromCart]", e);
      }
    })();
  }, [fromCartToken]);
  useEffect(() => {
    try { localStorage.setItem("vh_protocolo_carrito", JSON.stringify(carrito)); } catch {}
  }, [carrito]);
  useEffect(() => {
    try { localStorage.setItem("vh_protocolo_paciente", JSON.stringify(patientData)); } catch {}
  }, [patientData]);

  const cartVariantIds  = new Set(carrito.map(p => p.variant_id));
  const totalProtocolo  = carrito.reduce((acc, p) => acc + (p.price || 0) * (p.quantity || 1), 0);

  // Imágenes de colecciones deshabilitadas — las fotos de Shopify no son adecuadas,
  // las cards muestran el gradiente + ícono Lucide como fallback intencional.
  // TODO: cuando se tengan imágenes editoriales apropiadas, re-habilitar con
  //   fetch(`/api/product-catalog?collectionsMetaHandles=${handles}`)
  useEffect(() => {
    // no-op — imágenes de colecciones deshabilitadas (fotos de Shopify no adecuadas)
    // TODO: re-habilitar con ?collectionsMetaHandles cuando haya imágenes editoriales
  }, []);

  // Handlers
  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true); setError(null); setActiveTabKey(null); setAiResult(null);
    try {
      if (aiMode) {
        // En modo IA los productos no tienen commission_percent → limpiar filtro
        setFilterMinComm(0);
        // Búsqueda IA — Claude interpreta y busca en Supabase
        const res  = await fetch("/api/product-catalog/ai-search", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ query: query.trim() }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Error en búsqueda IA");
        setProductos(data.items || []);
        setAiResult({ resumen: data.resumen, ingredientes: data.ingredientes });
        setCollLabel(`🔬 "${query.trim()}"`);
      } else {
        // Búsqueda normal — Shopify
        const res  = await fetch(`/api/product-catalog?search=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Error al buscar");
        setProductos(data.items || []);
        setCollLabel(`"${query.trim()}"`);
      }
      setView("collection");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleCollection = async (tab) => {
    const key = tab.id || tab.handle;
    setLoading(true); setError(null); setActiveTabKey(key); setLevelCtx(null);
    try {
      const param = tab.id ? `collectionId=${tab.id}` : `collection=${tab.handle}`;
      const res   = await fetch(`/api/product-catalog?${param}`);
      const data  = await res.json();
      if (!data.ok) throw new Error(data.error || "Error cargando colección");
      setProductos(data.items || []);
      setCollLabel(data.collectionTitle || tab.label);
      setView("collection");
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const handleProductClick = (product) => {
    setPrevView({ view, label: collLabel, activeTabKey });
    setDetailProduct(product);
    setView("product");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    if (prevView) {
      setView(prevView.view);
      setActiveTabKey(prevView.activeTabKey);
      setCollLabel(prevView.label);
    } else { handleHome(); }
    setDetailProduct(null);
    setPrevView(null);
  };

  const handleHome = () => {
    setView("home"); setProductos([]); setQuery("");
    setError(null); setActiveTabKey(null); setDetailProduct(null); setLevelCtx(null);
  };

  // ── Navegación por árbol de categorías (breadcrumb) ─────────────────────────
  const handleBreadcrumb = useCallback(async (field, value, product) => {
    if (!field) { handleHome(); return; }

    // Construir el trail hasta el nivel clickeado
    const trail = [];
    if (product?.level_1) trail.push({ label: product.level_1, field: 'l1', value: product.level_1 });
    if (product?.level_2 && (field === 'l2' || field === 'l3'))
      trail.push({ label: product.level_2, field: 'l2', value: product.level_2 });
    if (product?.level_3 && field === 'l3')
      trail.push({ label: product.level_3, field: 'l3', value: product.level_3 });

    setLevelCtx({ trail, field, value });
    setError(null); setProductos([]); setDetailProduct(null);
    setActiveTabKey(null); setView("collection"); setPrevView(null);
    setLoading(true);
    try {
      // Filtrar por todos los niveles hasta el clickeado (AND)
      const params = new URLSearchParams();
      if (product?.level_1 && (field === 'l1' || field === 'l2' || field === 'l3'))
        params.set('l1', product.level_1);
      if (product?.level_2 && (field === 'l2' || field === 'l3'))
        params.set('l2', product.level_2);
      if (product?.level_3 && field === 'l3')
        params.set('l3', product.level_3);
      // Sobreescribir el nivel clickeado con su valor
      params.set(field, value);

      const res  = await fetch(`/api/product-catalog?${params}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error cargando categoría");
      setProductos(data.items || []);
      setCollLabel(value);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [handleHome]); // eslint-disable-line

  const agregarAlProtocolo = useCallback((product, variant, dosage, quantity = 1, bundlePlan = null) => {
    setCarrito(prev => {
      if (prev.find(p => p.variant_id === variant.variant_id)) return prev;
      return [...prev, {
        variant_id: variant.variant_id, product_id: product.product_id,
        title: product.title, variant_title: variant.variant_title || null,
        image: product.image_url || null,
        price: variant.price ?? product.min_price ?? 0, quantity,
        bundlePlan,
        dosage: dosage || { amount: 1, unit: detectUnit(product.title, variant.variant_title || ""), momentos: [], acompanamiento: "", nota: "" },
      }];
    });
  }, []);

  const actualizarEnProtocolo = useCallback((oldVid, newVariant, dosage, quantity, bundlePlan) => {
    setCarrito(prev => prev.map(p => p.variant_id === oldVid
      ? { ...p, variant_id: newVariant.variant_id, variant_title: newVariant.variant_title || null, price: newVariant.price ?? p.price, dosage,
          ...(quantity != null ? { quantity } : {}),
          ...(bundlePlan !== undefined ? { bundlePlan } : {}) }
      : p
    ));
  }, []);

  const agregarRapido = useCallback((product) => {
    const variant = (product.variants || []).find(v => v.stock === null || v.stock > 0) || product.variants?.[0];
    if (!variant) return;
    const unit = detectUnit(product.title, variant.variant_title || "");
    agregarAlProtocolo(product, variant, { amount: 1, unit, momentos: [], acompanamiento: "", nota: "" });
  }, [agregarAlProtocolo]);

  const quitarDelProtocolo  = useCallback(vid => setCarrito(p => p.filter(c => c.variant_id !== vid)), []);
  const limpiarProtocolo    = useCallback(() => setCarrito([]), []);
  const actualizarDosage    = useCallback((vid, dosage) => {
    setCarrito(prev => prev.map(p => p.variant_id === vid ? { ...p, dosage } : p));
  }, []);
  const actualizarCantidad  = useCallback((vid, qty) => {
    setCarrito(prev => prev.map(p => p.variant_id === vid ? { ...p, quantity: Math.max(1, qty) } : p));
  }, []);

  // Filtrar sin stock del grid
  const visibleProductos = productos.filter(p => !p.all_out_of_stock);

  // ── Filtros ──────────────────────────────────────────────────────────────────
  const [filterBrand,    setFilterBrand]    = useState("");
  const [filterMinComm,  setFilterMinComm]  = useState(0);   // 0 = todas
  const [filterPriceMin, setFilterPriceMin] = useState("");
  const [filterPriceMax, setFilterPriceMax] = useState("");

  // Reset filtros al cambiar de colección
  useEffect(() => {
    setFilterBrand(""); setFilterMinComm(0); setFilterPriceMin(""); setFilterPriceMax("");
  }, [activeTabKey]);

  // Marcas disponibles (sorted)
  const availableBrands = [...new Set(visibleProductos.map(p => p.brand).filter(Boolean))].sort();

  // Aplicar filtros
  const filteredProductos = visibleProductos.filter(p => {
    if (filterBrand && p.brand !== filterBrand) return false;
    if (filterMinComm > 0 && (p.commission_percent ?? 0) < filterMinComm) return false;
    const price = p.min_price ?? 0;
    if (filterPriceMin !== "" && price < Number(filterPriceMin)) return false;
    if (filterPriceMax !== "" && price > Number(filterPriceMax)) return false;
    return true;
  });

  const hasFilters = filterBrand || filterMinComm > 0 || filterPriceMin !== "" || filterPriceMax !== "";
  const clearFilters = () => { setFilterBrand(""); setFilterMinComm(0); setFilterPriceMin(""); setFilterPriceMax(""); };

  const isHome     = view === "home";
  const isProduct  = view === "product";
  const isDraft    = view === "draft";
  const isFavsView = view === "favorites";
  const showGrid   = !isHome && !isProduct && !isDraft && !isFavsView && !loading && visibleProductos.length > 0;
  const showEmpty  = !isHome && !isProduct && !isDraft && !isFavsView && !loading && !error && visibleProductos.length === 0;

  return (
    <div className="h-full flex flex-col bg-[#F7F9FB]">

      {/* ── HEADER STICKY ───────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-[#EEF3F7] shrink-0 z-30">
        <div className="max-w-[1280px] mx-auto">
          {/* Fila 1: título + protocolo */}
          <div className="flex items-center justify-between px-5 sm:px-6 pt-4 pb-3">
            <button onClick={handleHome} className="text-left">
              <h1 className="text-xl font-extrabold text-[#0D2133] tracking-tight leading-none">Protocolos Clínicos</h1>
              <p className="text-xs text-[#5B7A8C] mt-0.5 hidden sm:block">Prescripciones de suplementación para tus pacientes</p>
            </button>
            <ProtocolIndicator
              carrito={carrito} total={totalProtocolo}
              patientData={patientData} onPatientChange={setPatientData}
              onGoToDraft={() => setView("draft")}
              onClear={limpiarProtocolo}
              onRemoveItem={quitarDelProtocolo}
            />
          </div>
          {/* Fila 2: búsqueda */}
          <div className="px-5 sm:px-6 pb-3 space-y-2">
            {/* Switch modo */}
            <div className="flex items-center gap-1 bg-[#F0F5F8] rounded-lg p-0.5 w-fit">
              <button type="button" onClick={() => setAiMode(false)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${!aiMode ? "bg-white text-[#0D2133] shadow-sm" : "text-[#8AAAB8] hover:text-[#5B7A8C]"}`}>
                Normal
              </button>
              <button type="button" onClick={() => setAiMode(true)}
                className={`flex items-center gap-1 px-3 py-1 rounded-md text-xs font-semibold transition-all ${aiMode ? "bg-[#0D2133] text-white shadow-sm" : "text-[#8AAAB8] hover:text-[#5B7A8C]"}`}>
                <span>🔬</span> IA
              </button>
            </div>

            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#B0C8D4]" />
                <input type="text"
                  placeholder={aiMode
                    ? "Describe el objetivo o síntoma del paciente…"
                    : "Buscar por producto, componente o marca…"}
                  value={query} onChange={e => setQuery(e.target.value)}
                  className="w-full bg-[#F7F9FB] border border-[#D0E4EC] rounded-lg pl-10 pr-4 py-2 text-sm text-[#0D2133] placeholder:text-[#B0C8D4] focus:outline-none focus:border-[#1E8FA8] focus:bg-white transition-colors" />
              </div>
              <button type="submit" disabled={loading || !query.trim()}
                className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-30 transition-colors shrink-0 ${aiMode ? "bg-[#1E8FA8] text-white hover:bg-[#1a7d94]" : "bg-[#0D2133] text-white hover:bg-[#162d60]"}`}>
                {aiMode ? "Analizar" : "Buscar"}
              </button>
            </form>

            {/* Banner resultado IA */}
            {aiResult && (
              <div className="bg-[#F4FAFB] border border-[#C2DFE8] rounded-lg px-3.5 py-2.5">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#1E8FA8] mb-1">Análisis clínico</p>
                <p className="text-xs text-[#0D2133] leading-snug mb-2">{aiResult.resumen}</p>
                <div className="flex flex-wrap gap-1.5">
                  {aiResult.ingredientes.map(i => (
                    <span key={i.nombre} className="inline-flex items-center gap-1 bg-white border border-[#C2DFE8] rounded-full px-2.5 py-0.5 text-[11px] text-[#0D2133]">
                      <span className="font-semibold">{i.nombre}</span>
                      <span className="text-[#8AAAB8]">— {i.razon}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Fila 3: tabs */}
          <div className="flex border-t border-[#EEF3F7] overflow-x-auto [&::-webkit-scrollbar]:hidden">
            <button onClick={handleHome}
              className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0 ${isHome ? "border-[#0D2133] text-[#0D2133]" : "border-transparent text-[#5B7A8C] hover:text-[#0D2133]"}`}>
              Inicio
            </button>
            {favoriteList.length > 0 && (
              <button onClick={() => setView("favorites")}
                className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0 flex items-center gap-1.5 ${isFavsView ? "border-red-400 text-red-500" : "border-transparent text-[#5B7A8C] hover:text-red-400"}`}>
                <Heart size={12} fill={isFavsView ? "currentColor" : "none"} />
                Favoritos <span className="text-[10px]">({favoriteList.length})</span>
              </button>
            )}
            {NAV_TABS.map(tab => {
              const key = tab.id || tab.handle;
              return (
                <button key={key} onClick={() => handleCollection(tab)} disabled={loading}
                  className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0 ${activeTabKey === key ? "border-[#1E8FA8] text-[#1E8FA8]" : "border-transparent text-[#5B7A8C] hover:text-[#0D2133]"}`}>
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── ÁREA MUTABLE ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#D0E4EC] [&::-webkit-scrollbar-thumb]:rounded-full">

        {/* HOME */}
        {isHome && (
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6 space-y-8">
            {/* Slider favoritos */}
            {favoriteList.filter(p => !p.all_out_of_stock).length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Heart size={14} className="text-red-400" fill="currentColor" />
                    <h2 className="text-sm font-bold text-[#0D2133]">Mis Favoritos</h2>
                  </div>
                  <button onClick={() => setView("favorites")} className="text-xs font-semibold text-[#1E8FA8] hover:underline">
                    Ver todos ({favoriteList.length}) →
                  </button>
                </div>
                <div className="flex gap-3 overflow-x-auto pb-2 [&::-webkit-scrollbar]:hidden -mx-4 sm:-mx-6 px-4 sm:px-6">
                  {favoriteList.filter(p => !p.all_out_of_stock).map(p => (
                    <div key={p.product_id} className="w-40 shrink-0">
                      <ProductCard product={p} onClick={handleProductClick}
                        inProtocol={p.variants?.some(v => cartVariantIds.has(v.variant_id)) || false}
                        isFavorite={isFavorite} onFavorite={toggleFavorite} onQuickAdd={agregarRapido} />
                    </div>
                  ))}
                </div>
              </section>
            )}
            {/* Colecciones */}
            <section>
              <h2 className="text-sm font-bold text-[#0D2133] mb-4">Colecciones destacadas</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {FEATURED.map(fc => (
                  <CollectionCard key={fc.handle || fc.id} item={fc} onClick={handleCollection}
                    loading={loading} imageUrl={collectionImages[fc.handle || fc.id] || null} />
                ))}
              </div>
            </section>
            {/* PRO banner */}
            <section>
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-[#0D2133] to-[#1b3f7a] px-6 py-5 flex items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <span className="shrink-0 bg-[#1E8FA8] text-white text-[10px] font-extrabold px-2 py-0.5 rounded uppercase tracking-widest mt-0.5">PRO</span>
                  <div>
                    <p className="text-white font-bold text-base leading-snug">Marcas Profesionales</p>
                    <p className="text-[#7EAEC0] text-xs mt-1 max-w-xs">Productos exclusivos de grado clínico que tus pacientes no pueden comprar directo.</p>
                  </div>
                </div>
                <button onClick={() => handleCollection(FEATURED[1])}
                  className="shrink-0 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap">
                  Explorar <ChevronRight size={12} />
                </button>
                <div className="absolute -right-8 -top-8 w-32 h-32 bg-[#1E8FA8]/10 rounded-full pointer-events-none" />
              </div>
            </section>
          </div>
        )}

        {/* BORRADOR */}
        {isDraft && (
          <DraftView
            carrito={carrito} patientData={patientData} onPatientChange={setPatientData}
            customerId={customerId} profesional={profesional}
            onBack={handleHome} onRemoveItem={quitarDelProtocolo} onClear={limpiarProtocolo}
            onUpdateDosage={actualizarDosage} onUpdateQuantity={actualizarCantidad}
          />
        )}

        {/* FAVORITOS */}
        {isFavsView && (
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-6">
            <div className="flex items-center gap-2 mb-6">
              <Heart size={16} className="text-red-400" fill="currentColor" />
              <h2 className="text-lg font-extrabold text-[#0D2133]">Mis Favoritos</h2>
              <span className="text-sm text-[#5B7A8C]">({favoriteList.length})</span>
            </div>
            {favoriteList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-[#B0C8D4]">
                <Heart size={28} />
                <p className="text-sm font-medium">Aún no tienes favoritos</p>
                <p className="text-xs">Toca el ❤️ en cualquier producto para guardarlo aquí</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {favoriteList.filter(p => !p.all_out_of_stock).map(p => (
                  <ProductCard key={p.product_id} product={p} onClick={handleProductClick}
                    inProtocol={p.variants?.some(v => cartVariantIds.has(v.variant_id)) || false}
                    isFavorite={isFavorite} onFavorite={toggleFavorite} onQuickAdd={agregarRapido} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* PRODUCT DETAIL */}
        {isProduct && detailProduct && (
          <ProductDetailView
            product={detailProduct}
            onBack={handleBack}
            backLabel={
              prevView?.view === "home"      ? "Inicio"     :
              prevView?.view === "favorites" ? "Favoritos"  :
              collLabel || "Volver"
            }
            onAdd={agregarAlProtocolo}
            onUpdate={actualizarEnProtocolo}
            cartItem={carrito.find(c => detailProduct.variants?.some(v => v.variant_id === c.variant_id)) || null}
            isFavorite={isFavorite}
            onFavorite={toggleFavorite}
            onProductClick={handleProductClick}
            onBreadcrumb={handleBreadcrumb}
          />
        )}

        {/* LOADER */}
        {loading && (
          <div className="flex items-center justify-center h-48 text-[#5B7A8C] text-sm gap-2.5">
            <div className="w-4 h-4 border-2 border-[#D0E4EC] border-t-[#1E8FA8] rounded-full animate-spin" />
            Cargando…
          </div>
        )}

        {/* VACÍO */}
        {showEmpty && (
          <div className="flex flex-col items-center justify-center h-48 gap-1.5 text-[#5B7A8C]">
            <Package size={28} className="text-[#B0C8D4]" />
            <p className="font-semibold text-sm">Sin productos</p>
            <p className="text-xs text-[#B0C8D4]">No encontramos nada para esta búsqueda</p>
          </div>
        )}

        {/* GRID */}
        {showGrid && (
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 py-4">
            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            {/* ── Barra de filtros ─────────────────────────────────────────── */}
            <div className="bg-white border border-[#D0E4EC] rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-3 items-center">
              {/* Marca */}
              {availableBrands.length > 1 && (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] shrink-0">Marca</span>
                  <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}
                    className="border border-[#D0E4EC] rounded-lg px-2.5 py-1.5 text-xs text-[#0D2133] focus:outline-none focus:border-[#1E8FA8] bg-white max-w-[180px]">
                    <option value="">Todas</option>
                    {availableBrands.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              )}

              {/* Separador */}
              {availableBrands.length > 1 && <div className="h-5 w-px bg-[#D0E4EC] hidden sm:block" />}

              {/* Comisión */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] shrink-0">Comisión</span>
                <div className="flex gap-1">
                  {[["Todas", 0], ["5%+", 5], ["10%+", 10], ["15%+", 15]].map(([label, val]) => (
                    <button key={val} onClick={() => setFilterMinComm(val)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${filterMinComm === val ? "bg-[#1E8FA8] text-white border-[#1E8FA8]" : "bg-white text-[#5B7A8C] border-[#D0E4EC] hover:border-[#1E8FA8]"}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Separador */}
              <div className="h-5 w-px bg-[#D0E4EC] hidden sm:block" />

              {/* Precio */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] shrink-0">Precio</span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-[#B0C8D4]">$</span>
                  <input type="number" placeholder="Desde" value={filterPriceMin}
                    onChange={e => setFilterPriceMin(e.target.value)}
                    className="w-20 border border-[#D0E4EC] rounded-lg px-2 py-1.5 text-xs text-[#0D2133] focus:outline-none focus:border-[#1E8FA8] tabular-nums" />
                  <span className="text-xs text-[#B0C8D4]">—</span>
                  <input type="number" placeholder="Hasta" value={filterPriceMax}
                    onChange={e => setFilterPriceMax(e.target.value)}
                    className="w-20 border border-[#D0E4EC] rounded-lg px-2 py-1.5 text-xs text-[#0D2133] focus:outline-none focus:border-[#1E8FA8] tabular-nums" />
                </div>
              </div>

              {/* Limpiar */}
              {hasFilters && (
                <>
                  <div className="h-5 w-px bg-[#D0E4EC] hidden sm:block" />
                  <button onClick={clearFilters}
                    className="flex items-center gap-1 text-xs font-semibold text-[#5B7A8C] hover:text-red-400 transition-colors">
                    <X size={12} /> Limpiar
                  </button>
                </>
              )}
            </div>

            {/* Breadcrumb trail de nivel — visible cuando venimos de clic en categoría */}
            {levelCtx?.trail?.length > 0 && (
              <nav className="flex items-center gap-1 flex-wrap mb-3 -mt-1">
                <button onClick={handleHome} className="text-[11px] text-[#8AAAB8] hover:text-[#1E8FA8] transition-colors font-medium">Inicio</button>
                {levelCtx.trail.map((step, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="text-[#C2DFE8] text-[11px]">›</span>
                    {i < levelCtx.trail.length - 1
                      ? <button onClick={() => handleBreadcrumb(step.field, step.value, { level_1: levelCtx.trail[0]?.value, level_2: levelCtx.trail[1]?.value, level_3: levelCtx.trail[2]?.value })}
                          className="text-[11px] text-[#8AAAB8] hover:text-[#1E8FA8] transition-colors font-medium">{step.label}</button>
                      : <span className="text-[11px] text-[#0D2133] font-semibold">{step.label}</span>
                    }
                  </span>
                ))}
              </nav>
            )}

            {/* Conteo */}
            <p className="text-xs text-[#5B7A8C] font-medium mb-4">
              {filteredProductos.length} producto{filteredProductos.length !== 1 ? "s" : ""}
              {hasFilters && visibleProductos.length !== filteredProductos.length
                ? ` de ${visibleProductos.length}` : ""}
              {productos.length !== visibleProductos.length ? ` (${productos.length - visibleProductos.length} sin stock ocultos)` : ""}
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 pb-6">
              {filteredProductos.map(p => (
                <ProductCard key={p.product_id} product={p}
                  onClick={handleProductClick}
                  inProtocol={p.variants?.some(v => cartVariantIds.has(v.variant_id)) || false}
                  isFavorite={isFavorite}
                  onFavorite={toggleFavorite}
                  onQuickAdd={agregarRapido}
                />
              ))}
            </div>

            {/* Sin resultados */}
            {filteredProductos.length === 0 && hasFilters && (
              <div className="text-center py-12 text-[#B0C8D4]">
                <Package size={32} className="mx-auto mb-2" />
                <p className="text-sm font-medium">Sin productos con esos filtros</p>
                <button onClick={clearFilters} className="mt-3 text-xs text-[#1E8FA8] font-semibold hover:underline">
                  Limpiar filtros
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Wrapper con Suspense (requerido por useSearchParams en App Router) ─────────
export default function ArmadorCarritos() {
  return (
    <Suspense>
      <ArmadorCarritosInner />
    </Suspense>
  );
}
