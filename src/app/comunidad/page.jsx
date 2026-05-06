"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import Image from "next/image";
import { TrendingUp, Package, Check, Loader2 } from "lucide-react";
import Banner from "../components/Banner.jsx";

function ProductCard({ product, comment, collectionHandle, onSave }) {
  const [text, setText] = useState(comment?.comment || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const isDirty = text.trim() !== (comment?.comment || "");

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/comunidad/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: product.product_id,
          sku: product.sku,
          collection_handle: collectionHandle,
          comment: text,
        }),
      });
      if (res.ok) {
        onSave(product.product_id, text);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
      <div className="relative bg-gray-50 aspect-square">
        {product.image ? (
          <Image src={product.image} alt={product.title} fill className="object-cover" sizes="300px" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={36} className="text-gray-300" />
          </div>
        )}
        {product.total_sold > 0 && (
          <span className="absolute top-2 left-2 bg-[#1b3f7a] text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
            <TrendingUp size={11} />
            {product.total_sold} vendidos
          </span>
        )}
        {!product.in_collection && (
          <span className="absolute top-2 right-2 bg-amber-100 text-amber-700 text-[10px] font-semibold px-2 py-1 rounded-full">
            No está en tienda
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col gap-2 flex-1">
        <p className="text-sm font-semibold text-gray-800 leading-tight line-clamp-2">{product.title}</p>
        {product.sku && <p className="text-[10px] text-gray-400 font-mono">{product.sku}</p>}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 250))}
          placeholder="¿Por qué lo recomendás? ¿Qué resultados viste? Tu experiencia real es lo que más convierte."
          className="mt-auto w-full text-xs border border-gray-200 rounded-xl px-3 py-2 resize-none h-20 focus:outline-none focus:ring-2 focus:ring-[#1b3f7a]/30 transition"
        />
        <p className={`text-[10px] text-right -mt-1 ${text.length >= 250 ? "text-red-400" : "text-gray-300"}`}>
          {text.length}/250
        </p>

        {comment?.status === "published" && !isDirty && (
          <span className="text-[10px] text-emerald-600 font-medium">✓ Publicado</span>
        )}
        {comment?.status === "pending" && !isDirty && (
          <span className="text-[10px] text-amber-500 font-medium">En revisión</span>
        )}
        {comment?.status === "rejected" && !isDirty && (
          <span className="text-[10px] text-red-400 font-medium">Rechazado</span>
        )}

        <button
          onClick={handleSave}
          disabled={!text.trim() || saving || (!isDirty && !!comment)}
          className="w-full py-2 rounded-xl text-xs font-semibold transition
            bg-[#1b3f7a] text-white hover:bg-[#163264]
            disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
            flex items-center justify-center gap-1.5"
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : saved ? (
            <><Check size={13} /> Guardado</>
          ) : (
            "Guardar comentario"
          )}
        </button>
      </div>
    </div>
  );
}

export default function ComunidadPage() {
  const [products, setProducts] = useState([]);
  const [comments, setComments] = useState({});
  const [collectionHandle, setCollectionHandle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const customerId = Cookies.get("customerId");
    if (!customerId) { setError("No hay sesión activa"); setLoading(false); return; }
    loadData();
  }, []);

  async function loadData() {
    try {
      const [prodRes, commRes] = await Promise.all([
        fetch("/api/comunidad/products").then((r) => r.json()),
        fetch("/api/comunidad/comments").then((r) => r.json()),
      ]);

      if (!prodRes.success) throw new Error(prodRes.message || "Error cargando productos");

      setProducts(prodRes.products || []);
      setCollectionHandle(prodRes.collection_handle);

      const commMap = {};
      for (const c of commRes.comments || []) {
        commMap[c.product_id] = c;
      }
      setComments(commMap);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSave(productId, text) {
    setComments((prev) => ({
      ...prev,
      [productId]: { ...(prev[productId] || {}), comment: text, status: "pending" },
    }));
  }


  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-[#1b3f7a]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-500 text-sm">{error}</div>
    );
  }

  return (
     <div className="min-h-screen bg-white text-gray-900">
            <Banner  />
       <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[960px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
            Comunidad
          </h1>
          <p className="text-sm text-gray-400 font-medium">
            Tus productos más vendidos y los de tu colección
          </p>
        </div>
      </div>

      <div className="max-w-[960px] mx-auto px-6 py-7 flex flex-col gap-6">

        <div className="bg-gradient-to-r from-[#1b3f7a]/5 to-[#2BB9B8]/5 border border-[#1b3f7a]/10 rounded-2xl p-4">
          <p className="text-sm font-semibold text-[#1b3f7a] mb-1">Dale visibilidad a tu tienda</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            Tu opinión sobre los productos que recomendás aparece directamente en la tienda de Vitahub,
            asociada a tu colección. Cuanto más auténtico y detallado sea tu comentario, más confianza
            generás en quienes visitan tu tienda.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Los comentarios son revisados por el equipo antes de publicarse. Una vez aprobados, quedan visibles para tus clientes.
          </p>
        </div>

        {products.length > 0 ? (
          <section>
            <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3 flex items-center gap-2">
              <TrendingUp size={13} /> Tus productos
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {products.map((p) => (
                <ProductCard
                  key={p.product_id}
                  product={p}
                  comment={comments[p.product_id]}
                  collectionHandle={collectionHandle}
                  onSave={handleSave}
                />
              ))}
            </div>
          </section>
        ) : (
          <div className="text-center text-gray-400 text-sm py-16">
            No hay productos para mostrar aún.
          </div>
        )}

      </div>
    </div>
  );
}
