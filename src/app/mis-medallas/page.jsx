"use client";

import { useEffect, useState } from "react";
import { Award } from "lucide-react";

function BadgeCard({ item }) {
  const { badge, ganado, proximo } = item;
  const level = badge?.level;
  const hito  = badge?.hito;

  const baseColor = ganado ? (level?.color || '#EAB308') : '#374151'
  const circleStyle = {
    background: ganado
      ? `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 40%, transparent 65%), ${baseColor}`
      : `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.15) 0%, transparent 60%), ${baseColor}`,
    boxShadow: ganado
      ? `0 6px 16px rgba(0,0,0,0.22), inset 0 1px 3px rgba(255,255,255,0.5)`
      : `0 3px 8px rgba(0,0,0,0.18)`,
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col items-center gap-2 shadow-sm w-[120px]">
      <div
        className="w-[72px] h-[72px] rounded-full flex items-center justify-center"
        style={circleStyle}
      >
        {badge?.image_url ? (
          <img
            src={badge.image_url}
            alt={badge.nombre}
            className="w-10 h-10 object-contain"
          />
        ) : (
          <Award size={28} className="text-white" strokeWidth={1.5} />
        )}
      </div>

      <div className="text-center">
        {hito ? (
          <>
            <p className="text-sm font-extrabold text-gray-700 leading-tight">{hito.valor}</p>
            <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-500">{hito.unidad}</p>
          </>
        ) : (
          <p className="text-xs font-bold text-gray-700 leading-tight">{badge?.nombre}</p>
        )}
      </div>

      {ganado && proximo && (
        <p className="text-[0.6rem] text-[#1b3f7a] text-center leading-tight">
          Próximo: {proximo.valor} {proximo.unidad}
        </p>
      )}

      {!ganado && (
        <p className="text-[0.6rem] text-gray-400 text-center">Por alcanzar</p>
      )}
    </div>
  );
}

export default function MisMedallasPage() {
  const [badges,  setBadges]  = useState(null);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    fetch("/api/mis-medallas")
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setBadges(d.badges);
      })
      .catch(err => setError(err.message));
  }, []);

  const ganadas    = badges?.filter(b => b.ganado)  || [];
  const porAlcanzar = badges?.filter(b => !b.ganado) || [];

  return (
    <div className="min-h-screen bg-white text-gray-900">

      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[960px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">Mis Medallas</h1>
          <p className="text-sm text-gray-400 font-medium">Logros e hitos alcanzados en tu trayectoria</p>
        </div>
      </div>

      <div className="max-w-[960px] mx-auto px-6 py-7 flex flex-col gap-8">

        {error && <p className="text-red-500 text-sm">{error}</p>}

        {badges === null && !error && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-[3px] border-gray-200 border-t-[#1b3f7a] animate-spin" />
          </div>
        )}

        {badges !== null && (
          <>
            {/* ── Logros alcanzados ── */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Award size={16} className="text-[#1b3f7a]" />
                <h2 className="text-base font-extrabold text-[#1b3f7a]">
                  Logros alcanzados
                  <span className="text-gray-400 font-normal text-sm ml-1">({ganadas.length})</span>
                </h2>
              </div>

              {ganadas.length === 0 ? (
                <div className="border border-dashed border-gray-200 rounded-2xl p-10 flex flex-col items-center gap-2 text-gray-300">
                  <Award size={28} strokeWidth={1.5} />
                  <p className="text-sm">Todavía no tienes logros — ¡sigue adelante!</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {ganadas.map((item, i) => (
                    <BadgeCard key={i} item={item} />
                  ))}
                </div>
              )}
            </div>

            {/* ── Por alcanzar ── */}
            {porAlcanzar.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-base font-extrabold text-gray-400">Por alcanzar</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  {porAlcanzar.map((item, i) => (
                    <BadgeCard key={i} item={item} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
