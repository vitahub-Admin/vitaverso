"use client";
import { useState, useRef } from "react";
import { useCustomer } from "@/app/context/CustomerContext";

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
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <div
        className="relative cursor-pointer"
        onClick={() => onDetail(product)}
      >
        {product.image ? (
          <img src={product.image} alt={product.title}
            className="w-full h-40 object-cover" />
        ) : (
          <div className="w-full h-40 bg-gray-100 flex items-center justify-center text-gray-300 text-4xl">?</div>
        )}
        {product.comision && (
          <span className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {product.comision}% com.
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col flex-1">
        <p
          className="text-sm font-semibold text-gray-800 line-clamp-2 cursor-pointer hover:text-[#1e3a5f]"
          onClick={() => onDetail(product)}
        >
          {product.title}
        </p>
        <p className="text-sm font-bold text-[#1e3a5f] mt-1">${product.price} MXN</p>

        <button
          onClick={() => onAdd(product)}
          disabled={inCart}
          className={`mt-auto mt-3 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors
            ${inCart
              ? "bg-green-50 text-green-600 border border-green-200 cursor-default"
              : "bg-[#1e3a5f] text-white hover:bg-[#162d4a]"
            }`}
        >
          <IconCart />
          {inCart ? "En carrito" : "Agregar"}
        </button>
      </div>
    </div>
  );
}

// ─── Panel detalle ────────────────────────────────────────────────────────────
function DetailPanel({ product, onAdd, inCart }) {
  if (!product) return (
    <div className="flex-1 flex items-center justify-center text-gray-300 text-sm text-center px-4">
      Tocá un producto para ver los detalles
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
  const [error, setError] = useState(null);

  const handleGenerar = async () => {
    setLoading(true);
    setError(null);
    try {
      const items = carrito.map(p => ({
        variant_id: p.variant_id,
        quantity: p.quantity || 1,
      }));

      const phone = telefono ? `+521${telefono}` : "";

      const res = await fetch("/api/sharecart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_id: customerId,
          name: nombre,
          phone,
          items,
          extra: {
            patient_info: { name: nombre, phone, notes: notas },
            origen: "armador-carritos",
          },
        }),
      });

      const data = await res.json();
      if (!data.ok) throw new Error("Error generando el carrito");

      const finalUrl = customerId
        ? `${data.url}&sref=${encodeURIComponent(customerId)}`
        : data.url;

      setCartUrl(finalUrl);
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

          {cartUrl ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-green-700 mb-2">Carrito generado</p>
              <input
                readOnly
                value={cartUrl}
                className="w-full text-xs bg-white border border-green-200 rounded-lg px-3 py-2 text-green-700"
              />
              <button
                onClick={() => navigator.clipboard.writeText(cartUrl)}
                className="mt-2 w-full bg-green-600 text-white text-sm py-2 rounded-lg hover:bg-green-700 transition-colors"
              >
                Copiar link
              </button>
            </div>
          ) : (
            <button
              onClick={handleGenerar}
              disabled={loading}
              className="w-full bg-[#1e3a5f] text-white py-3 rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-[#162d4a] transition-colors"
            >
              {loading ? "Generando..." : "Generar Enlace para Compartir"}
            </button>
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

  const totalCarrito = carrito.reduce((acc, p) => acc + parseFloat(p.price || 0) * (p.quantity || 1), 0);

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex-shrink-0">
        <h1 className="text-lg font-bold text-[#1e3a5f]">Armador de carritos</h1>
        <p className="text-xs text-gray-400">Buscá productos y armá el carrito para tu paciente</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Área principal ── */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
          {/* Buscador */}
          <form onSubmit={handleBuscar} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder="Buscar productos... (ej: magnesio, omega, colágeno)"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 shadow-sm"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-[#1e3a5f] text-white px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-[#162d4a] transition-colors shadow-sm"
            >
              {loading ? "..." : "Buscar"}
            </button>
          </form>

          {/* Error */}
          {error && <p className="text-red-500 text-sm">{error}</p>}

          {/* Grid de productos */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Buscando...</div>
            )}
            {!loading && searched && productos.length === 0 && (
              <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
                No se encontraron productos para "{query}"
              </div>
            )}
            {!loading && !searched && (
              <div className="flex items-center justify-center h-40 text-gray-300 text-sm">
                Ingresá un término para buscar productos
              </div>
            )}
            {!loading && productos.length > 0 && (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
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

        {/* ── Sidebar derecho ── */}
        <div className="w-72 flex-shrink-0 border-l border-gray-100 bg-white flex flex-col overflow-hidden">
          {/* Detalle del producto — mitad superior */}
          <div className="flex-1 flex flex-col border-b border-gray-100 overflow-hidden">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-4 pt-3 pb-1 flex-shrink-0">
              Detalle
            </p>
            <DetailPanel
              product={detalle}
              onAdd={agregarAlCarrito}
              inCart={detalle ? !!carrito.find(c => c.id === detalle?.id) : false}
            />
          </div>

          {/* Carrito — mitad inferior */}
          <div className="flex flex-col" style={{ maxHeight: "45%" }}>
            <div className="flex items-center justify-between px-4 pt-3 pb-1 flex-shrink-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Carrito
              </p>
              {carrito.length > 0 && (
                <span className="bg-[#1e3a5f] text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                  {carrito.length}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-3 space-y-2">
              {carrito.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-6">El carrito está vacío</p>
              ) : (
                carrito.map(p => (
                  <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                    {p.image && (
                      <img src={p.image} alt={p.title} className="w-10 h-10 object-cover rounded-md flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">{p.title}</p>
                      <p className="text-xs text-[#1e3a5f]">${(parseFloat(p.price) * p.quantity).toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => cambiarCantidad(p.id, -1)}
                        className="w-5 h-5 rounded bg-gray-200 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-300">−</button>
                      <span className="text-xs w-4 text-center">{p.quantity}</span>
                      <button onClick={() => cambiarCantidad(p.id, 1)}
                        className="w-5 h-5 rounded bg-gray-200 text-gray-600 text-xs flex items-center justify-center hover:bg-gray-300">+</button>
                      <button onClick={() => quitarDelCarrito(p.id)}
                        className="w-5 h-5 rounded bg-red-100 text-red-400 text-xs flex items-center justify-center hover:bg-red-200 ml-1">×</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Total + Finalizar */}
            <div className="p-3 border-t border-gray-100 flex-shrink-0">
              {carrito.length > 0 && (
                <div className="flex justify-between text-sm font-semibold text-gray-700 mb-2">
                  <span>Total</span>
                  <span>${totalCarrito.toFixed(2)} MXN</span>
                </div>
              )}
              <button
                onClick={() => setShowModal(true)}
                disabled={carrito.length === 0}
                className="w-full bg-[#1e3a5f] text-white py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 hover:bg-[#162d4a] transition-colors"
              >
                Finalizar
              </button>
            </div>
          </div>
        </div>
      </div>

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
