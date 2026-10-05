/**
 * Aviso de incidente para los profesionales.
 *
 * Esto es un cartel temporal: se enciende cuando algo está fallando y se apaga
 * cuando se resolvió. No es una funcionalidad, es un parche de comunicación —
 * por eso el texto vive acá y no en la base: hay que poder prenderlo y apagarlo
 * en un commit, sin depender de que nadie cargue nada en ningún lado.
 *
 * ── PARA APAGARLO: `activo: false` ──
 */

import { AlertTriangle } from "lucide-react";

export const AVISO = {
  activo: true,
  texto:
    "Estamos resolviendo una falla en la plataforma de pagos. Los retiros pueden " +
    "tardar más de lo normal — tu saldo está seguro y no se pierde. " +
    "Gracias por tu paciencia.",
};

export default function AvisoPlataforma() {
  if (!AVISO.activo) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
    >
      <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
      <p className="text-[13px] text-amber-900 leading-relaxed">{AVISO.texto}</p>
    </div>
  );
}
