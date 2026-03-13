"use client";

// src/app/admin/resenas/page.jsx
// Protegida por el layout admin existente

import { useEffect, useState } from "react";
import { Check, X, Clock } from "lucide-react";

const STATUS_LABEL = {
  ACTIVE: { label: "Activa",   color: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  DRAFT:  { label: "Borrador", color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
};

export default function ModerationPage() {
  const [reviews, setReviews]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("DRAFT"); // DRAFT | ACTIVE | ALL
  const [saving, setSaving]     = useState(null);    // id del item que se está guardando
  const [toast, setToast]       = useState(null);

  async function fetchReviews() {
    setLoading(true);
    try {
      const res  = await fetch("/api/shopify/metaobjects/affiliate-review/moderation");
      const data = await res.json();
      if (data.success) setReviews(data.reviews);
    } catch (err) {
      showToast("Error al cargar las reseñas ❌");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchReviews(); }, []);

  async function updateStatus(id, status) {
    setSaving(id);
    try {
      const res  = await fetch("/api/shopify/metaobjects/affiliate-review/moderation", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id, status }),
      });
      const data = await res.json();

      if (data.success) {
        setReviews(prev =>
          prev.map(r => r.id === id ? { ...r, status } : r)
        );
        showToast(status === "ACTIVE" ? "Reseña publicada ✅" : "Reseña enviada a borrador ✅");
      } else {
        showToast("Error al actualizar ❌");
      }
    } catch {
      showToast("Error de conexión ❌");
    } finally {
      setSaving(null);
    }
  }

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  const filtered = reviews.filter(r =>
    filter === "ALL" ? true : r.status === filter
  );

  const counts = {
    ALL:   reviews.length,
    DRAFT: reviews.filter(r => r.status === "DRAFT").length,
    ACTIVE: reviews.filter(r => r.status === "ACTIVE").length,
  };

  return (
    <div className="flex flex-col gap-6">

      {/* Header */}
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4">
        <h1 className="text-3xl text-white font-lato">Moderación de reseñas</h1>
        <p className="text-blue-200 text-sm mt-1">
          Reseñas enviadas por los especialistas sobre VitaHub
        </p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {[
          { key: "DRAFT",  label: `Borradores (${counts.DRAFT})` },
          { key: "ACTIVE", label: `Activas (${counts.ACTIVE})` },
          { key: "ALL",    label: `Todas (${counts.ALL})` },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition
              ${filter === f.key
                ? "bg-[#1b3f7a] text-white border-[#1b3f7a]"
                : "bg-white text-gray-600 border-gray-300 hover:border-[#1b3f7a]"
              }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-16 text-gray-400">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
          <Clock size={32} strokeWidth={1.5} />
          <p>No hay reseñas en esta categoría</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map(review => (
            <ReviewCard
              key={review.id}
              review={review}
              saving={saving === review.id}
              onActivate={() => updateStatus(review.id, "ACTIVE")}
              onDraft={() => updateStatus(review.id, "DRAFT")}
            />
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-50">
          {toast}
        </div>
      )}

    </div>
  );
}

function ReviewCard({ review, saving, onActivate, onDraft }) {
  const st = STATUS_LABEL[review.status] || STATUS_LABEL.DRAFT;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-4">

      {/* Top: handle + status + fecha */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${st.bg} ${st.color} ${st.border}`}>
              {st.label}
            </span>
            <span className="text-sm font-bold text-[#1b3f7a]">
              /collections/{review.handle_coll}
            </span>
          </div>
          {review.affiliate_id && (
            <span className="text-xs text-gray-400">
              ID afiliado: {review.affiliate_id}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {new Date(review.updatedAt).toLocaleDateString("es-AR", {
            day: "2-digit", month: "short", year: "numeric"
          })}
        </span>
      </div>

      {/* Comentario */}
      <blockquote className="text-gray-700 text-sm leading-relaxed italic border-l-4 border-[#1b3f7a]/20 pl-4">
        "{review.comment}"
      </blockquote>

      {/* Acciones */}
      <div className="flex gap-2 justify-end">
        {review.status === "DRAFT" ? (
          <button
            onClick={onActivate}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white text-sm font-semibold rounded-lg hover:bg-green-600 disabled:opacity-50 transition"
          >
            <Check size={15} />
            {saving ? "Publicando..." : "Publicar"}
          </button>
        ) : (
          <button
            onClick={onDraft}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
          >
            <X size={15} />
            {saving ? "Guardando..." : "Volver a borrador"}
          </button>
        )}
      </div>

    </div>
  );
}
