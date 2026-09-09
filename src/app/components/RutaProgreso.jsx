"use client";

/**
 * Ruta de primeros pasos: cinco hitos conectados, con el estado real de cada
 * uno. Se calcula en /api/affiliates/onboarding, nunca se guarda: así no puede
 * decirle "completá tu perfil" a alguien que ya lo completó.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

// Un checklist terminado que sigue ocupando el home se vuelve ruido, así que
// la idea es ocultarlo al completarse. En false mientras se revisa el diseño
// con la cuenta propia, que ya tiene todos los hitos hechos.
const OCULTAR_AL_COMPLETAR = false;

export default function RutaProgreso() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/affiliates/onboarding")
      .then(r => r.json())
      .then(d => { if (d?.ok) setData(d); })
      .catch(() => {});
  }, []);

  if (!data) return null;
  if (OCULTAR_AL_COMPLETAR && data.nivel >= data.total) return null;

  return (
    <div className="bg-white border border-[#D0E4EC] rounded-2xl p-5">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C]">
          Tus primeros pasos
        </h2>
        <span className="text-[11px] font-bold text-[#1E8FA8] tabular-nums">
          {data.nivel} de {data.total}
        </span>
      </div>

      <div className="flex items-start overflow-x-auto pb-1
        [&::-webkit-scrollbar]:h-1
        [&::-webkit-scrollbar-thumb]:bg-[#D0E4EC]
        [&::-webkit-scrollbar-thumb]:rounded-full">
        {data.pasos.map((paso, i) => {
          const previoHecho = i > 0 && data.pasos[i - 1].done;
          return (
            <Link key={paso.id} href={paso.href}
              className="group relative flex-1 min-w-[116px] flex flex-col items-center px-1">

              {/* Conector hacia el paso anterior */}
              {i > 0 && (
                <span className={`absolute top-[13px] right-1/2 w-full h-[2px] ${
                  previoHecho ? "bg-[#1E8FA8]" : "bg-[#E3ECF1]"}`} />
              )}

              {/* Punto */}
              <span className={`relative z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center
                text-[11px] font-extrabold tabular-nums transition-all ${
                paso.done
                  ? "bg-[#1E8FA8] border-[#1E8FA8] text-white shadow-[0_0_14px_2px_rgba(30,143,168,0.45)]"
                  : "bg-white border-[#D0E4EC] text-[#B0C8D4] group-hover:border-[#1E8FA8] group-hover:text-[#1E8FA8]"
              }`}>
                {paso.done ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>

              <p className={`mt-2 text-[11px] font-bold text-center leading-tight transition-colors ${
                paso.done ? "text-[#1b3f7a]" : "text-[#5B7A8C] group-hover:text-[#1b3f7a]"}`}>
                {paso.label}
              </p>
              {!paso.done && (
                <p className="mt-0.5 text-[10px] text-[#B0C8D4] text-center leading-tight">
                  {paso.hint}
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
