"use client";

/**
 * Lista de contactos del profesional.
 *
 * Un contacto es un paciente, no un comprador: el nombre sale del carrito que
 * le armaron. Por eso cada fila puede mostrar "pagó Fulana" cuando la compra
 * la hizo otra persona, y también aparecen pacientes que todavía no compraron.
 */

import { useState } from "react";
import { ShoppingBag, Send, Phone, Mail, ChevronDown } from "lucide-react";
import ClientDetails from "./ClientDetails";

const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

// "12 sep" · "12 sep 25" si es de otro año
const fmtFecha = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const esteAno = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("es-MX", {
    day: "numeric", month: "short", ...(esteAno ? {} : { year: "2-digit" }),
  });
};

// +52 55 1234 5678 → 55 1234 5678
const fmtTel = (t) => {
  const d = String(t || "").replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}` : (t || null);
};

export default function Contactsheet({ data, specialistId }) {
  const [abierto, setAbierto] = useState(null);

  const nombreCompleto = (c) =>
    `${c.nombre_cliente || ""} ${c.apellido_cliente || ""}`.trim() || "Paciente sin nombre";

  if (!data?.length) {
    return (
      <div className="py-10 text-center text-sm text-[#5B7A8C]">
        No hay contactos disponibles
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {data.map((c) => {
        const clave     = c.id || c.email_cliente;
        const expandido = abierto === clave;
        const compro    = c.cantidad_ordenes > 0;
        const fecha     = fmtFecha(c.ultima_actividad || c.fecha_ultima_orden);

        return (
          <div key={clave} className="border border-[#D0E4EC] rounded-xl overflow-hidden bg-white">
            <div className="p-3.5 flex items-start gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0
                ${compro ? "bg-[#1b3f7a]" : "bg-[#B0C8D4]"}`}>
                {nombreCompleto(c).charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#1b3f7a] leading-snug truncate">
                  {nombreCompleto(c)}
                </p>

                {/* Contacto */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                  {c.telefono_cliente && (
                    <span className="text-[11px] text-[#5B7A8C] flex items-center gap-1">
                      <Phone size={10} className="text-[#B0C8D4]" /> {fmtTel(c.telefono_cliente)}
                    </span>
                  )}
                  {c.email_cliente && (
                    <span className="text-[11px] text-[#5B7A8C] flex items-center gap-1 truncate max-w-full">
                      <Mail size={10} className="text-[#B0C8D4] shrink-0" />
                      <span className="truncate">{c.email_cliente}</span>
                    </span>
                  )}
                </div>

                {/* Quién pagó, cuando no es el paciente */}
                {c.compradores?.length > 0 && (
                  <p className="text-[11px] text-[#8AAAB8] mt-1">
                    Pagó <span className="font-semibold text-[#5B7A8C]">{c.compradores.join(", ")}</span>
                  </p>
                )}

                {/* Actividad */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  {c.cantidad_carritos > 0 && (
                    <span className="text-[10px] font-semibold text-[#5B7A8C] bg-[#F7F9FB] border border-[#D0E4EC] px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Send size={9} /> {c.cantidad_carritos} carrito{c.cantidad_carritos !== 1 ? "s" : ""}
                    </span>
                  )}
                  {compro ? (
                    <span className="text-[10px] font-semibold text-[#1E8FA8] bg-[#E6F4F8] border border-[#C2DFE8] px-2 py-0.5 rounded-full flex items-center gap-1">
                      <ShoppingBag size={9} /> {c.cantidad_ordenes} compra{c.cantidad_ordenes !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-[#B0C8D4] border border-[#D0E4EC] px-2 py-0.5 rounded-full">
                      Sin compras todavía
                    </span>
                  )}
                  {fecha && <span className="text-[10px] text-[#B0C8D4]">último movimiento: {fecha}</span>}
                </div>
              </div>

              {/* Ganancia + detalle */}
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <span className={`text-sm font-extrabold tabular-nums ${compro ? "text-[#1E8FA8]" : "text-[#D0E4EC]"}`}>
                  {fmtMXN(c.ganancia_total)}
                </span>
                {c.email_cliente && (
                  <button
                    onClick={() => setAbierto(expandido ? null : clave)}
                    className="text-[11px] font-semibold text-[#1E8FA8] hover:text-[#1b3f7a] transition-colors flex items-center gap-1"
                  >
                    {expandido ? "Ocultar" : "Detalles"}
                    <ChevronDown size={11} className={expandido ? "rotate-180 transition-transform" : "transition-transform"} />
                  </button>
                )}
              </div>
            </div>

            {expandido && specialistId && c.email_cliente && (
              <div className="border-t border-[#EEF3F7] bg-[#F7F9FB]">
                <ClientDetails customerEmail={c.email_cliente} specialistId={specialistId} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
