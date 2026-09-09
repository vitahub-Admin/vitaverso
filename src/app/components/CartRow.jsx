"use client";

/**
 * Fila de un protocolo compartido, expandible al detalle de productos.
 *
 * Vive acá porque la usan dos vistas —Analytics y Protocolos compartidos— y
 * tenerla duplicada garantizaba que se desincronizaran al primer retoque.
 *
 * Espera la forma que devuelve /api/sharecart/merged/[id]:
 *   { token, created_at, client_name, phone, items_count, items_value,
 *     has_sale, items: [{ title, variant_title, price, quantity }] }
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";

export const fmtMXN = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 })
    .format(Number(n) || 0);

export default function CartRow({ cart }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const date = new Date(cart.created_at).toLocaleDateString("es-MX", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-shadow hover:shadow-sm
      ${cart.has_sale ? "border-emerald-200" : "border-[#D0E4EC]"}`}>

      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        {cart.has_sale
          ? <CheckCircle2 size={18} className="text-emerald-500 shrink-0" />
          : <Clock size={18} className="text-[#B0C8D4] shrink-0" />
        }

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-[#1b3f7a] truncate">
              {cart.client_name || "Sin nombre"}
            </span>
            {cart.has_sale
              ? <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Vendido</span>
              : <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#5B7A8C] bg-[#F7F9FB] px-2 py-0.5 rounded-full">Pendiente</span>
            }
          </div>
          <p className="text-[11px] text-[#B0C8D4] mt-0.5">
            {cart.items_count} {cart.items_count === 1 ? "producto" : "productos"} · {date}
          </p>
        </div>

        <span className="text-sm font-extrabold text-[#1b3f7a] tabular-nums shrink-0">
          {fmtMXN(cart.items_value)}
        </span>

        {open
          ? <ChevronUp size={14} className="text-[#B0C8D4] shrink-0" />
          : <ChevronDown size={14} className="text-[#B0C8D4] shrink-0" />
        }
      </button>

      {open && (
        <div className="border-t border-[#EEF3F7] px-4 py-3 space-y-2 bg-[#F7F9FB]">
          {cart.items.length === 0 && (
            <p className="text-xs text-[#B0C8D4]">Sin productos</p>
          )}
          {cart.items.map((item, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-[#1b3f7a] font-medium leading-snug flex-1 min-w-0 truncate">
                {item.title || "Producto"}
                {item.variant_title && item.variant_title !== "Default Title"
                  ? <span className="text-[#5B7A8C] font-normal ml-1">· {item.variant_title}</span>
                  : null}
              </span>
              <span className="text-[#5B7A8C] tabular-nums shrink-0">
                ×{item.quantity || 1} · {fmtMXN((item.price || 0) * (item.quantity || 1))}
              </span>
            </div>
          ))}
          {cart.phone && (
            <p className="text-[10px] text-[#B0C8D4] pt-1 border-t border-[#EEF3F7]">
              📞 {cart.phone}
            </p>
          )}
          <div className="flex justify-end pt-2 border-t border-[#EEF3F7] mt-1">
            <button
              onClick={() => router.push(`/armador-carritos?fromCart=${cart.token}`)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#1E8FA8] hover:text-[#1b3f7a] transition-colors py-1 px-2 rounded-lg hover:bg-white"
            >
              <RefreshCw size={12} />
              Regenerar protocolo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
