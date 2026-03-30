"use client";
import { useState } from "react";
import { useCustomer } from "@/app/context/CustomerContext";

export default function ArmadorCarritos() {
  const { customerId } = useCustomer() || {};

  const [contexto, setContexto] = useState("");
  const [loading, setLoading] = useState(false);
  const [keywords, setKeywords] = useState([]);
  const [principales, setPrincipales] = useState([]);
  const [adicionales, setAdicionales] = useState([]);
  const [seleccion, setSeleccion] = useState([]);
  const [error, setError] = useState(null);
  const [cartUrl, setCartUrl] = useState(null);
  const [generando, setGenerando] = useState(false);

  const handleBuscar = async () => {
    if (!contexto.trim()) return;
    setLoading(true);
    setError(null);
    setSeleccion([]);
    setKeywords([]);
    setPrincipales([]);
    setAdicionales([]);
    setCartUrl(null);

    try {
      const interRes = await fetch("/api/buscador/interpretar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contexto }),
      });
      const interData = await interRes.json();

      if (!interData.ok) {
        setError(interData.error || "No se encontraron productos para ese contexto.");
        return;
      }

      setKeywords(interData.busquedas || []);
      setPrincipales(interData.principales || []);
      setAdicionales(interData.adicionales || []);
      // Pre-seleccionar los principales
      setSeleccion(interData.principales || []);
    } catch (e) {
      setError("Error inesperado: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleProducto = (producto) => {
    setSeleccion((prev) =>
      prev.find((p) => p.id === producto.id)
        ? prev.filter((p) => p.id !== producto.id)
        : [...prev, producto]
    );
  };

  const handleGenerarCarrito = async () => {
    if (!seleccion.length) return;
    setGenerando(true);
    setCartUrl(null);

    try {
      const items = seleccion.map((p) => ({
        variant_id: p.variants?.find((v) => v.available)?.id || p.variants?.[0]?.id,
        quantity: 1,
      }));

      const res = await fetch("/api/sharecart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_id: customerId,
          items,
          extra: { origen: "armador-ia", contexto },
        }),
      });
      const data = await res.json();
      if (data.ok) setCartUrl(data.url);
      else setError("No se pudo generar el carrito.");
    } catch (e) {
      setError("Error al generar el carrito: " + e.message);
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-[#1e3a5f] mb-1">Armador de carritos</h1>
        <p className="text-gray-500 text-sm mb-6">
          Describí la situación del cliente y la IA seleccionará los productos más relevantes.
        </p>

        {/* Input de contexto */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <textarea
            className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
            rows={4}
            placeholder="Ej: el cliente tiene dolor articular, busca magnesio o algo antiinflamatorio natural..."
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
          />
          <button
            onClick={handleBuscar}
            disabled={loading || !contexto.trim()}
            className="mt-3 w-full bg-[#1e3a5f] text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-[#162d4a] transition-colors"
          >
            {loading ? "Buscando y analizando..." : "Buscar productos"}
          </button>
        </div>

        {/* Keywords detectadas */}
        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {keywords.map((kw) => (
              <span key={kw} className="bg-blue-100 text-blue-700 text-xs px-3 py-1 rounded-full">
                {kw}
              </span>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg p-3 mb-4">{error}</div>
        )}

        {/* Productos principales */}
        {principales.length > 0 && (
          <div className="space-y-3 mb-4">
            <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">
              Recomendaciones principales — tocá para agregar o quitar
            </p>
            {principales.map((p) => {
              const enCarrito = seleccion.find((s) => s.id === p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => toggleProducto(p)}
                  className={`bg-white rounded-xl shadow-sm p-4 flex gap-3 cursor-pointer hover:shadow-md transition-all border-2 ${enCarrito ? "border-[#1e3a5f]" : "border-gray-100"}`}
                >
                  {p.image && (
                    <img src={p.image} alt={p.title} className="w-16 h-16 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-800 truncate">{p.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.razon}</p>
                    <p className="text-xs text-[#1e3a5f] font-semibold mt-1">${p.variants?.[0]?.price} MXN</p>
                  </div>
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-1 ${enCarrito ? "bg-[#1e3a5f]" : "bg-gray-200"}`}>
                    {enCarrito && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Productos adicionales */}
        {adicionales.length > 0 && (
          <div className="space-y-3 mb-6">
            <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">
              También podrías considerar
            </p>
            {adicionales.map((p) => {
              const enCarrito = seleccion.find((s) => s.id === p.id);
              return (
                <div
                  key={p.id}
                  onClick={() => toggleProducto(p)}
                  className={`bg-gray-50 rounded-xl p-4 flex gap-3 cursor-pointer hover:shadow-md transition-all border-2 ${enCarrito ? "border-[#1e3a5f]" : "border-transparent"}`}
                >
                  {p.image && (
                    <img src={p.image} alt={p.title} className="w-14 h-14 object-cover rounded-lg flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-700 truncate">{p.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{p.razon}</p>
                    <p className="text-xs text-[#1e3a5f] font-semibold mt-1">${p.variants?.[0]?.price} MXN</p>
                  </div>
                  <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-1 ${enCarrito ? "bg-[#1e3a5f]" : "bg-gray-200"}`}>
                    {enCarrito && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Generar carrito */}
        {seleccion.length > 0 && !cartUrl && (
          <button
            onClick={handleGenerarCarrito}
            disabled={generando}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-medium text-sm disabled:opacity-50 hover:bg-green-700 transition-colors"
          >
            {generando ? "Generando carrito..." : `Generar carrito con ${seleccion.length} producto${seleccion.length > 1 ? "s" : ""}`}
          </button>
        )}

        {/* URL generada */}
        {cartUrl && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
            <p className="text-sm font-semibold text-green-700 mb-2">Carrito generado</p>
            <a
              href={cartUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-600 underline break-all"
            >
              {cartUrl}
            </a>
            <button
              onClick={() => navigator.clipboard.writeText(cartUrl)}
              className="mt-3 w-full border border-green-400 text-green-700 py-2 rounded-lg text-sm hover:bg-green-100 transition-colors"
            >
              Copiar link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
