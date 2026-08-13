"use client";
import { useState, useRef } from "react";
import { useCustomer } from "@/app/context/CustomerContext";
import { X } from "lucide-react";

// ─── Icono carrito ───────────────────────────────────────────────────────────
function IconCart() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 3h2l.4 2M7 13h10l4-10H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  );
}

// ─── Card de producto ─────────────────────────────────────────────────────────
function ProductCard({ product, onAdd, onDetail, inCart }) {
  const outOfStock = product.available === false;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col hover:shadow-lg hover:border-[#1b3f7a]/20 transition-all group">
      {/* Imagen */}
      <div className="relative cursor-pointer shrink-0" onClick={() => onDetail(product)}>
        {product.image ? (
          <img src={product.image} alt={product.title} className="w-full h-36 object-cover group-hover:scale-[1.02] transition-transform duration-300" />
        ) : (
          <div className="w-full h-36 bg-gray-50 flex items-center justify-center text-gray-200 text-3xl">?</div>
        )}
        {product.is_professional && (
          <span className="absolute top-2 left-2 bg-[#1e8fa8] text-white text-xs font-normal px-2.5 py-1 rounded-full shadow-md ring-2 ring-white/60 tracking-widest">
            PRO
          </span>
        )}
        {product.comision && (
          <span className="absolute top-2 right-2 bg-[#1b3f7a] text-white text-xs font-semibold px-2 py-1 rounded-full shadow-sm">
            {product.comision}%
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex flex-col flex-1 gap-1.5">
        <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug cursor-pointer hover:text-[#1b3f7a]" onClick={() => onDetail(product)}>
          {product.title}
        </p>
        <p className="text-sm font-extrabold text-[#1b3f7a] tabular-nums">${product.price} <span className="text-[10px] font-normal text-gray-400">MXN</span></p>

        {outOfStock ? (
          <span className="text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full w-fit">Sin stock</span>
        ) : product.stock != null && product.stock <= 5 ? (
          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full w-fit">Últimas {product.stock}</span>
        ) : (
          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">En stock</span>
        )}

        <button
          onClick={() => onAdd(product)}
          disabled={inCart || outOfStock}
          className={`mt-auto pt-1.5 flex items-center justify-center gap-1.5 py-2 rounded-full text-xs font-semibold transition-all ${
            inCart ? "bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default"
            : outOfStock ? "bg-gray-100 text-gray-300 cursor-not-allowed"
            : "bg-[#1b3f7a] text-white hover:bg-[#162d60] active:scale-95"
          }`}
        >
          <IconCart />
          {inCart ? "En carrito" : outOfStock ? "Sin stock" : "Agregar"}
        </button>
      </div>
    </div>
  );
}

// ─── Panel de carrito (reutilizable en sidebar y drawer) ───────────────────────
function CartPanel({ carrito, cambiarCantidad, quitarDelCarrito, totalCarrito, gananciaCarrito, onFinalizar }) {
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
            <IconCart />
            <p className="text-xs">El carrito está vacío</p>
          </div>
        ) : carrito.map(p => (
          <div key={p.id} className="flex items-center gap-2.5 bg-gray-50 rounded-xl p-2.5 border border-gray-100">
            {p.image && <img src={p.image} alt={p.title} className="w-11 h-11 object-cover rounded-lg shrink-0" />}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 line-clamp-2 leading-snug">{p.title}</p>
              <p className="text-xs font-bold text-[#1b3f7a] tabular-nums mt-0.5">${(parseFloat(p.price) * p.quantity).toFixed(2)}</p>
            </div>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className="flex items-center gap-1">
                <button onClick={() => cambiarCantidad(p.id, -1)} className="w-5 h-5 rounded-md bg-white border border-gray-200 text-gray-500 text-xs flex items-center justify-center hover:bg-gray-100">−</button>
                <span className="text-xs font-bold w-4 text-center">{p.quantity}</span>
                <button onClick={() => cambiarCantidad(p.id, 1)} className="w-5 h-5 rounded-md bg-white border border-gray-200 text-gray-500 text-xs flex items-center justify-center hover:bg-gray-100">+</button>
              </div>
              <button onClick={() => quitarDelCarrito(p.id)} className="text-[10px] text-red-400 hover:text-red-600 transition-colors">quitar</button>
            </div>
          </div>
        ))}
      </div>

      {/* Total + Ganancia + Finalizar */}
      <div className="p-4 border-t border-gray-100 shrink-0 space-y-2">
        {carrito.length > 0 && (
          <>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-gray-500">Total</span>
              <span className="text-lg font-extrabold text-[#1b3f7a] tabular-nums">${totalCarrito.toFixed(2)} <span className="text-xs font-normal text-gray-400">MXN</span></span>
            </div>
            {gananciaCarrito > 0 && (
              <div className="flex justify-between items-baseline bg-emerald-50 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-emerald-700">Tu ganancia</span>
                <span className="text-sm font-extrabold text-emerald-600 tabular-nums">${gananciaCarrito.toFixed(2)} <span className="text-[10px] font-normal text-emerald-500">MXN</span></span>
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

// ─── Panel detalle ────────────────────────────────────────────────────────────
function DetailPanel({ product, onAdd, inCart }) {
  if (!product) return (
    <div className="flex-1 flex items-center justify-center text-gray-300 text-sm text-center px-4">
      Selecciona un producto para ver los detalles
    </div>
  );

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto flex-1">
      {product.image && (
        <img src={product.image} alt={product.title}
          className="w-full h-44 object-cover rounded-xl" />
      )}
      <div>
        <p className="font-bold text-gray-800 text-sm leading-snug">{product.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[#1e3a5f] font-bold text-base">${product.price} MXN</p>
          {product.comision && (
            <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              {product.comision}% comisión
            </span>
          )}
        </div>
      </div>
      {product.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {product.tags.map(t => (
            <span key={t} className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
      )}
      {product.description && (
        <p className="text-xs text-gray-500 leading-relaxed">{product.description}</p>
      )}
      <button
        onClick={() => onAdd(product)}
        disabled={inCart}
        className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors
          ${inCart
            ? "bg-green-50 text-green-600 border border-green-200"
            : "bg-[#1e3a5f] text-white hover:bg-[#162d4a]"
          }`}
      >
        <IconCart />
        {inCart ? "Ya está en el carrito" : "Agregar al carrito"}
      </button>
    </div>
  );
}

// ─── Modal finalizar ──────────────────────────────────────────────────────────
function FinalizarModal({ carrito, customerId, onClose, onSuccess }) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [notas, setNotas] = useState("");
  const [loading, setLoading] = useState(false);
  const [cartUrl, setCartUrl] = useState(null);
  const [checkoutUrl, setCheckoutUrl] = useState(null);
  const [checkoutAttrs, setCheckoutAttrs] = useState(null);
  const [error, setError] = useState(null);

  const buildPayload = () => {
    const phone = telefono ? `+521${telefono}` : "";
    return {
      owner_id: customerId,
      name: nombre,
      phone,
      items: carrito.map(p => ({ variant_id: p.variant_id, quantity: p.quantity || 1 })),
      extra: { patient_info: { name: nombre, phone, notes: notas }, origen: "armador-carritos" },
    };
  };

  const handleGenerar = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/sharecart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!data.ok) throw new Error("Error generando el carrito");
      const finalUrl = customerId ? `${data.url}&sref=${encodeURIComponent(customerId)}` : data.url;
      setCartUrl(finalUrl);
      onSuccess?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch("/api/sharecart/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error generando checkout");
      setCheckoutUrl(data.checkoutUrl);
      setCheckoutAttrs(data.debug?.attributes || []);
      onSuccess?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 text-lg">Datos del Paciente</h2>
          <p className="text-xs text-gray-400 mt-0.5">{carrito.length} producto{carrito.length !== 1 ? "s" : ""} en el carrito</p>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre del Paciente</label>
            <input
              type="text"
              placeholder="Ej: Juan Pérez"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Teléfono <span className="normal-case text-gray-400 font-normal">(10 dígitos, opcional)</span></label>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-bold text-[#1e3a5f] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">+521</span>
              <input
                type="tel"
                placeholder="5512345678"
                maxLength={10}
                value={telefono}
                onChange={e => setTelefono(e.target.value.replace(/\D/g, "").slice(0, 10))}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Notas Adicionales</label>
            <textarea
              placeholder="Observaciones, recomendaciones, etc..."
              value={notas}
              onChange={e => setNotas(e.target.value)}
              rows={3}
              className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
            />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          {cartUrl && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-green-700 mb-1">Enlace sharecart</p>
              <input readOnly value={cartUrl}
                className="w-full text-xs bg-white border border-green-200 rounded-lg px-3 py-2 text-green-700" />
              <button onClick={() => navigator.clipboard.writeText(cartUrl)}
                className="mt-2 w-full bg-green-600 text-white text-sm py-2 rounded-lg hover:bg-green-700 transition-colors">
                Copiar link
              </button>
            </div>
          )}

          {checkoutUrl && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-blue-700">Checkout directo (Shopify)</p>

              <input readOnly value={checkoutUrl}
                className="w-full text-xs bg-white border border-blue-200 rounded-lg px-3 py-2 text-blue-700" />

              <div className="flex gap-2">
                <button onClick={() => navigator.clipboard.writeText(checkoutUrl)}
                  className="flex-1 bg-blue-600 text-white text-sm py-2 rounded-lg hover:bg-blue-700 transition-colors">
                  Copiar link
                </button>
                <button onClick={() => window.open(checkoutUrl, "_blank")}
                  className="flex-1 border border-blue-300 text-blue-700 text-sm py-2 rounded-lg hover:bg-blue-50 transition-colors">
                  Abrir
                </button>
              </div>

              {checkoutAttrs?.length > 0 && (
                <div className="bg-white border border-blue-100 rounded-lg px-3 py-2 space-y-1">
                  <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-1">Atributos confirmados en Shopify</p>
                  {checkoutAttrs.map(a => (
                    <div key={a.key} className="flex gap-2 text-xs">
                      <span className="text-gray-400 w-28 shrink-0">{a.key}</span>
                      <span className={`font-mono font-medium ${a.value ? "text-green-700" : "text-red-500"}`}>
                        {a.value || "❌ vacío"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!cartUrl && !checkoutUrl && (
            <div className="flex flex-col gap-2">
              <button onClick={handleGenerar} disabled={loading}
                className="w-full bg-[#1e3a5f] text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-[#162d4a] transition-colors">
                {loading ? "Generando..." : "Generar Enlace para Compartir"}
              </button>
              <button onClick={handleCheckout} disabled={loading}
                className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-indigo-700 transition-colors">
                {loading ? "Generando..." : "Checkout Directo (nuevo)"}
              </button>
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full border border-gray-200 text-gray-500 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            {cartUrl ? "Cerrar" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function ArmadorCarritos() {
  const { customer } = useCustomer() || {};
  const customerId = customer?.id;

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [productos, setProductos] = useState([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState(null);

  const [detalle, setDetalle] = useState(null);
  const [carrito, setCarrito] = useState([]);
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
      const res = await fetch(`/api/buscador?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error al buscar");
      setProductos(data.products || []);
      setSearched(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const agregarAlCarrito = (producto) => {
    setCarrito(prev => {
      if (prev.find(p => p.id === producto.id)) return prev;
      return [...prev, { ...producto, quantity: 1 }];
    });
  };

  const quitarDelCarrito = (id) => {
    setCarrito(prev => prev.filter(p => p.id !== id));
  };

  const cambiarCantidad = (id, delta) => {
    setCarrito(prev => prev.map(p =>
      p.id === id ? { ...p, quantity: Math.max(1, (p.quantity || 1) + delta) } : p
    ));
  };

  const totalCarrito    = carrito.reduce((acc, p) => acc + parseFloat(p.price || 0) * (p.quantity || 1), 0);
  const gananciaCarrito = carrito.reduce((acc, p) => {
    const pct = parseFloat(p.comision || 0);
    return acc + parseFloat(p.price || 0) * (p.quantity || 1) * (pct / 100);
  }, 0);

  return (
    <div className="h-screen flex flex-col bg-[#F7F9FB] overflow-hidden">

      {/* ── Header estándar ── */}
      <div className="bg-white border-b border-gray-100 px-6 shrink-0">
        <div className="max-w-[1280px] mx-auto py-5">
          <h1 className="text-2xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-0.5">
            Armador de carritos
          </h1>
          <p className="text-xs text-gray-400 font-medium">Busca productos y arma el carrito para tu paciente</p>
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

          {/* Grid de productos — 2 cols mobile, 3 tablet, 4 desktop */}
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
                <p className="text-xs text-gray-300">No se encontraron productos para "{query}"</p>
              </div>
            )}
            {!loading && !searched && (
              <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-300">
                <IconCart />
                <p className="text-sm">Escribe un término para buscar productos</p>
              </div>
            )}
            {!loading && productos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {productos.map(p => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    onAdd={agregarAlCarrito}
                    onDetail={setDetalle}
                    inCart={!!carrito.find(c => c.id === p.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Sidebar carrito — solo desktop (lg+) ── */}
        <div className="hidden lg:flex w-80 shrink-0 border-l border-gray-100 bg-white flex-col">
          <CartPanel
            carrito={carrito}
            cambiarCantidad={cambiarCantidad}
            quitarDelCarrito={quitarDelCarrito}
            totalCarrito={totalCarrito}
            gananciaCarrito={gananciaCarrito}
            onFinalizar={() => setShowModal(true)}
          />
        </div>
      </div>

      {/* ── Botón flotante carrito — mobile ── */}
      <div className="lg:hidden fixed bottom-5 right-5 z-30">
        <button
          onClick={() => setDrawerOpen(true)}
          className="flex items-center gap-2.5 bg-[#1b3f7a] text-white px-5 py-3 rounded-full shadow-xl font-semibold text-sm active:scale-95 transition-all"
        >
          <IconCart />
          Ver carrito
          {carrito.length > 0 && (
            <span className="bg-white text-[#1b3f7a] text-xs font-extrabold w-5 h-5 rounded-full flex items-center justify-center">
              {carrito.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Drawer carrito — mobile ── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex justify-end" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-80 max-w-[90vw] bg-white h-full shadow-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header del drawer */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 shrink-0">
              <p className="font-extrabold text-[#1b3f7a] text-sm uppercase tracking-widest">Carrito</p>
              <button onClick={() => setDrawerOpen(false)} className="text-gray-300 hover:text-gray-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <CartPanel
                carrito={carrito}
                cambiarCantidad={cambiarCantidad}
                quitarDelCarrito={quitarDelCarrito}
                totalCarrito={totalCarrito}
                gananciaCarrito={gananciaCarrito}
                onFinalizar={() => { setDrawerOpen(false); setShowModal(true); }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Modal flotante detalle de producto ── */}
      {detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setDetalle(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Detalle del producto</p>
              <button onClick={() => setDetalle(null)} className="text-gray-300 hover:text-gray-600 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <DetailPanel
                product={detalle}
                onAdd={(p) => { agregarAlCarrito(p); setDetalle(null); }}
                inCart={!!carrito.find(c => c.id === detalle?.id)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal finalizar */}
      {showModal && (
        <FinalizarModal
          carrito={carrito}
          customerId={customerId}
          onClose={() => setShowModal(false)}
          onSuccess={() => setCarrito([])}
        />
      )}
    </div>
  );
}
