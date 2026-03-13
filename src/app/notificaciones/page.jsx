"use client";

import { useEffect, useState } from "react";
import Banner from "../components/Banner";
import { Newspaper, Calendar } from "lucide-react";

export default function NoticiasPage() {
  const [error,    setError]   = useState("");
  const [noticias, setNoticias] = useState([]);
  const [loading,  setLoading] = useState(true);

  useEffect(() => {
    async function fetchNoticias() {
      try {
        const res  = await fetch("/api/data/news");
        if (!res.ok) throw new Error("Error al cargar noticias");
        const data = await res.json();
        setNoticias(data.news);

        if (data.noticias?.length > 0) {
          const ultimoId = data.noticias[data.noticias.length - 1].id;
          localStorage.setItem("lastSeenId", ultimoId);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchNoticias();
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=gbS7ix6Wr9E" />

      {/* ── Título ── */}
      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[960px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">
            Noticias
          </h1>
          <p className="text-sm text-gray-400 font-medium">
            Novedades y actualizaciones de VitaHub
          </p>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="max-w-[960px] mx-auto px-6 py-7">

        {loading && (
          <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
            <div className="w-6 h-6 rounded-full border-[3px] border-gray-200 border-t-[#1b3f7a] animate-spin" />
            <span className="text-sm">Cargando noticias…</span>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        {!loading && !error && noticias.length === 0 && (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-300">
            <Newspaper size={32} strokeWidth={1.5} />
            <p className="text-sm text-gray-400">No hay noticias disponibles.</p>
          </div>
        )}

        {!loading && !error && noticias.length > 0 && (
          <div className="flex flex-col gap-5">
            {noticias.map((n) => (
              <div
                key={n.id}
                className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden flex flex-col md:flex-row"
              >
                {/* Imagen */}
                {n.imagen && n.imagen.startsWith("http") && (
                  <div className="w-full md:w-64 shrink-0">
                    <img
                      src={n.imagen}
                      alt={n.titulo}
                      className="w-full h-48 md:h-full object-cover"
                    />
                  </div>
                )}

                {/* Contenido */}
                <div className="flex-1 p-6 flex flex-col gap-3 justify-center">
                  <h2 className="text-lg font-extrabold text-[#1b3f7a] leading-snug">
                    {n.titulo}
                  </h2>
                  {n.fecha && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <Calendar size={12} />
                      <span>{n.fecha}</span>
                    </div>
                  )}
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {n.contenido}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}