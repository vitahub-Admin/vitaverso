"use client";

import { useEffect, useState } from "react";
import Banner from "../components/Banner";

export default function NoticiasPage() {
  const [error, setError] = useState("");
  const [noticias, setNoticias] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchNoticias() {
      try {
        const res = await fetch("/api/data/news");
        if (!res.ok) throw new Error("Error al cargar noticias");
        const data = await res.json();
        setNoticias(data.news);

        // cuando el usuario abre la página de noticias:
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
    <div className="flex flex-col items-center gap-6 p-4">
    <Banner youtubeVideoUrl="https://www.youtube.com/watch?v=gbS7ix6Wr9E" />

      {/* Header */}
      <div className="w-full bg-[#1b3f7a] rounded-lg p-4 flex flex-col md:flex-row md:justify-between gap-4 mb-6">
        <h1 className="text-3xl md:text-4xl text-white font-lato">Noticias</h1>
      </div>

      {/* Contenido */}
      {loading ? (
        <p className="text-gray-600">Cargando...</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : noticias.length === 0 ? (
        <p className="text-gray-500">No hay noticias disponibles.</p>
      ) : (
        <div className="w-full flex flex-col gap-6">
          {noticias.map((n) => (
            <div
              key={n.id}
              className="flex flex-col md:flex-row bg-white rounded-lg shadow-md border overflow-hidden max-w-[1200px]"
            >
              {/* Imagen */}
              {n.imagen && n.imagen.startsWith("http") && (
                <div className="w-full md:w-[300px] relative">
                  <img
                    src={n.imagen}
                    alt={n.titulo}
                    className="object-cover w-full aspect-square max-h-[60vh] md:max-h-none"
                  />
                </div>
              )}

              {/* Contenido */}
              <div className="flex-1 p-4 flex flex-col gap-2">
                <h2 className="text-2xl font-bold text-gray-800">{n.titulo}</h2>
                {n.fecha && (
                  <p className="text-xs italic text-gray-500">{n.fecha}</p>
                )}
                <p className="text-sm text-gray-600">{n.contenido}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
