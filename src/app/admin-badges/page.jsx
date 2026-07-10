"use client";

import { useEffect, useState } from "react";
import { Award, Users, Medal } from "lucide-react";

export default function AdminBadgesPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/badges")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 rounded-full border-[3px] border-gray-200 border-t-[#1b3f7a] animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="w-full border-b border-gray-100 px-6">
        <div className="max-w-[960px] mx-auto py-6">
          <h1 className="text-3xl font-extrabold text-[#1b3f7a] tracking-tight leading-none mb-1">Badges Admin</h1>
          <p className="text-sm text-gray-400 font-medium">Resumen del sistema de medallas</p>
        </div>
      </div>

      <div className="max-w-[960px] mx-auto px-6 py-7 flex flex-col gap-6">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#EEF2FF] flex items-center justify-center">
              <Users size={20} className="text-[#1b3f7a]" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-[#1b3f7a]">{data?.totalUsuarios ?? '—'}</p>
              <p className="text-xs text-gray-400 font-medium">Afiliados con medallas</p>
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#FFF9E6] flex items-center justify-center">
              <Award size={20} className="text-yellow-500" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-[#1b3f7a]">{data?.totalBadges ?? '—'}</p>
              <p className="text-xs text-gray-400 font-medium">Medallas asignadas en total</p>
            </div>
          </div>
        </div>

        {/* ── Top 10 ── */}
        <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-50">
            <Medal size={16} className="text-[#1b3f7a]" />
            <h2 className="text-base font-extrabold text-[#1b3f7a]">Top 10 afiliados</h2>
          </div>

          <div className="divide-y divide-gray-50">
            {data?.top10?.map((row, i) => {
              const isTop5 = i < 5
              const medals = ['🥇','🥈','🥉']

              return (
                <div
                  key={row.customer_id}
                  className={`px-6 py-4 flex flex-col gap-2 transition ${isTop5 ? 'bg-gradient-to-r from-[#FFFBEB] to-white' : 'hover:bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-extrabold w-6 text-center ${isTop5 ? 'text-[#1b3f7a]' : 'text-gray-300'}`}>
                        {medals[i] || `${i + 1}`}
                      </span>
                      <span className={`font-semibold ${isTop5 ? 'text-gray-800' : 'text-gray-500'} text-sm`}>
                        {row.nombre}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 bg-[#EEF2FF] text-[#1b3f7a] font-bold text-xs px-2.5 py-1 rounded-full">
                      <Award size={11} />
                      {row.total}
                    </span>
                  </div>

                  {row.badges?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-9">
                      {row.badges.map(b => (
                        <span
                          key={b.slug}
                          className="text-[0.6rem] font-semibold px-2 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: b.color }}
                        >
                          {b.nombre}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
