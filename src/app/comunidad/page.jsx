"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import Image from "next/image";
import { TrendingUp, Package, Check, Loader2 } from "lucide-react";
import Banner from "../components/Banner.jsx";

const EXAMPLE_COMMENT = "Lo recomiendo para personas con alta demanda mental o fatiga constante. Al ser enzimáticamente activo, el cuerpo lo aprovecha de forma directa — eso marca una diferencia real versus un complejo B genérico.";

function SpecialistPreviewCard({ image, name, comment }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-lg w-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="relative w-12 h-12 shrink-0">
          {image ? (
            <img src={image} alt={name} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#1b3f7a]/10 flex items-center justify-center text-[#1b3f7a] font-bold text-lg">
              {name?.[0] || "?"}
            </div>
          )}
          <span className="absolute bottom-0 right-0 bg-[#1b3f7a] rounded-full p-0.5">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>
        </div>
        <div>
          <p className="text-[11px] font-normal text-gray-400 mb-0.5">Especialista Verificado</p>
          <p className="text-[16px] font-bold text-gray-800 leading-tight">{name || "Tu nombre"}</p>
        </div>
      </div>
      <hr className="border-gray-100 mb-4" />
      <p className="text-sm text-gray-600 leading-relaxed">
        <span className="text-gray-300 text-lg leading-none mr-0.5">"</span>
        {comment}
        <span className="text-gray-300 text-lg leading-none ml-0.5">"</span>
      </p>
    </div>
  );
}

function ExampleProductCard({ image, title }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-lg w-full">
      <div className="relative bg-gray-50 aspect-square">
        {image ? (
          <img src={image} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package size={36} className="text-gray-300" />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-xs font-semibold text-gray-700 leading-snug line-clamp-3">{title}</p>
      </div>
    </div>
  );
}

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
      {/* Imagen — más chica en mobile, cuadrada en desktop */}
      <div className="relative bg-gray-50 h-44 sm:h-auto sm:aspect-square">
        {product.image ? (
          <Image src={product.image} alt={product.title} fill className="object-contain" sizes="300px" />
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
          <p className="text-sm font-semibold text-gray-800 leading-tight">{product.title}</p>
          {product.sku && <p className="text-[10px] text-gray-400 font-mono">{product.sku}</p>}

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 250))}
            placeholder="¿Por qué lo recomiendas? ¿Qué resultados viste? Tu experiencia real es lo que más convierte."
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
  const [collectionTitle, setCollectionTitle]   = useState(null);
  const [collectionImage, setCollectionImage]   = useState(null);
  const [exampleProduct, setExampleProduct]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const customerId = Cookies.get("customerId");
    if (!customerId) { setError("No hay sesión activa"); setLoading(false); return; }
    loadData();
  }, []);

  async function loadData() {
    try {
      const [prodRes, commRes, exRes] = await Promise.all([
        fetch("/api/comunidad/products").then((r) => r.json()),
        fetch("/api/comunidad/comments").then((r) => r.json()),
        fetch("/api/comunidad/example-product").then((r) => r.json()).catch(() => ({})),
      ]);

      if (!prodRes.success) throw new Error(prodRes.message || "Error cargando productos");

      setProducts(prodRes.products || []);
      setCollectionHandle(prodRes.collection_handle);
      setCollectionTitle(prodRes.collection_title);
      setCollectionImage(prodRes.collection_image);
      setExampleProduct(exRes);

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
      <Banner />
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

        {/* ── Info ── */}
        <div className="bg-gradient-to-r from-[#1b3f7a]/5 to-[#2BB9B8]/5 border border-[#1b3f7a]/10 rounded-2xl p-4">
          <p className="text-sm font-semibold text-[#1b3f7a] mb-1">Gana visibilidad a tu perfil profesional.</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            Tu opinión sobre los productos que recomiendas aparece directamente en la tienda de Vitahub,
            asociada a tu colección. Cuanto más auténtico y detallado sea tu comentario, más confianza
            generas en quienes visitan tu tienda.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Los comentarios son revisados por el equipo antes de publicarse. Una vez aprobados, quedan visibles para tus clientes.
          </p>
        </div>

        {/* ── Ejemplo de cómo se ve ── */}
        <div className="border border-gray-100 rounded-2xl p-5 bg-gray-50/50">
          <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-1">
            Así se ve un comentario que convierte
          </p>
          <p className="text-xs text-gray-400 mb-4 leading-relaxed">
            Breve y específico es suficiente — 2 o 3 oraciones desde tu experiencia real valen más que un párrafo genérico. Usá esto como referencia.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-full sm:w-auto sm:flex-1">
              <SpecialistPreviewCard
                image={collectionImage}
                name={collectionTitle}
                comment={EXAMPLE_COMMENT}
              />
            </div>
            <div className="sm:w-44 shrink-0 flex flex-col gap-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ejemplo para el producto:</p>
              <ExampleProductCard
                image={exampleProduct?.image}
                title={exampleProduct?.title}
              />
            </div>
          </div>
        </div>

        {/* ── Productos ── */}
        {products.length > 0 ? (
          <section>
            <h2 className="text-xs font-semibold tracking-widest uppercase text-gray-400 mb-3 flex items-center gap-2">
              <TrendingUp size={13} /> Tus productos
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {products.filter((p) => p.total_sold > 0).map((p) => (
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
