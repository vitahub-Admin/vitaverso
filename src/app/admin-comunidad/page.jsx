"use client";

import { useEffect, useState } from "react";
import { Check, X, Clock, RotateCcw } from "lucide-react";

const STATUS = {
  pending:   { label: "Pendiente",  color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-200"  },
  published: { label: "Publicado",  color: "text-green-700",  bg: "bg-green-50",   border: "border-green-200"  },
  rejected:  { label: "Rechazado",  color: "text-red-700",    bg: "bg-red-50",     border: "border-red-200"    },
};

function CommentCard({ comment, saving, onPublish, onReject, onReset }) {
  const st = STATUS[comment.status] || STATUS.pending;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${st.bg} ${st.color} ${st.border}`}>
              {st.label}
            </span>
            {comment.collection_handle && (
              <span className="text-xs text-[#1b3f7a] font-medium">
                /collections/{comment.collection_handle}
              </span>
            )}
            {comment.sku && (
              <span className="text-xs text-gray-400 font-mono">{comment.sku}</span>
            )}
          </div>
          <span className="text-xs text-gray-400">
            {comment.affiliate_name || `ID ${comment.customer_id}`}
            {" · "}
            Producto {comment.product_id}
          </span>
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
          {new Date(comment.created_at).toLocaleDateString("es-AR", {
            day: "2-digit", month: "short", year: "numeric",
          })}
        </span>
      </div>

      <blockquote className="text-gray-700 text-sm leading-relaxed italic border-l-4 border-[#1b3f7a]/20 pl-4">
        "{comment.comment}"
      </blockquote>

      <div className="flex gap-2 justify-end">
        {comment.status !== "published" && (
          <button
            onClick={onPublish}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-500 text-white text-sm font-semibold rounded-lg hover:bg-green-600 disabled:opacity-50 transition"
          >
            <Check size={15} />
            {saving ? "Guardando..." : "Publicar"}
          </button>
        )}
        {comment.status !== "rejected" && (
          <button
            onClick={onReject}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 text-sm font-semibold rounded-lg hover:bg-red-100 disabled:opacity-50 transition"
          >
            <X size={15} />
            {saving ? "Guardando..." : "Rechazar"}
          </button>
        )}
        {comment.status !== "pending" && (
          <button
            onClick={onReset}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-600 text-sm font-semibold rounded-lg hover:bg-gray-200 disabled:opacity-50 transition"
          >
            <RotateCcw size={14} />
            Pendiente
          </button>
        )}
      </div>
    </div>
  );
}

export default function AdminComunidadPage() {
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState("pending");
  const [saving, setSaving]     = useState(null);
  const [toast, setToast]       = useState(null);

  useEffect(() => { fetchComments(); }, []);

  async function fetchComments() {
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/comunidad/comments");
      const data = await res.json();
      if (data.success) setComments(data.comments);
    } catch {
      showToast("Error al cargar comentarios ❌");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id, status) {
    setSaving(id);
    try {
      const res  = await fetch("/api/admin/comunidad/comments", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id, status }),
      });
      const data = await res.json();
      if (data.success) {
        setComments((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
        showToast(
          status === "published" ? "Publicado ✅" :
          status === "rejected"  ? "Rechazado ✅" : "Vuelto a pendiente ✅"
        );
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

  const counts = {
    pending:   comments.filter((c) => c.status === "pending").length,
    published: comments.filter((c) => c.status === "published").length,
    rejected:  comments.filter((c) => c.status === "rejected").length,
    all:       comments.length,
  };

  const filtered = filter === "all"
    ? comments
    : comments.filter((c) => c.status === filter);

  return (
    <div className="flex flex-col gap-6">
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4">
        <h1 className="text-3xl text-white font-lato">Comentarios de productos</h1>
        <p className="text-blue-200 text-sm mt-1">
          Revisá y publicá los comentarios de los especialistas sobre sus productos
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { key: "pending",   label: `Pendientes (${counts.pending})`   },
          { key: "published", label: `Publicados (${counts.published})`  },
          { key: "rejected",  label: `Rechazados (${counts.rejected})`  },
          { key: "all",       label: `Todos (${counts.all})`            },
        ].map((f) => (
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

      {loading ? (
        <div className="flex justify-center py-16 text-gray-400">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
          <Clock size={32} strokeWidth={1.5} />
          <p>No hay comentarios en esta categoría</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              saving={saving === c.id}
              onPublish={() => updateStatus(c.id, "published")}
              onReject={()  => updateStatus(c.id, "rejected")}
              onReset={()   => updateStatus(c.id, "pending")}
            />
          ))}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 bg-[#1b3f7a] text-white px-4 py-2 rounded-lg shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}
    </div>
  );
}
