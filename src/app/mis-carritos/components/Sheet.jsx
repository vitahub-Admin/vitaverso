"use client";

import { useMemo } from "react";
import Cookies from "js-cookie";
import { FaWhatsapp } from "react-icons/fa";
import { Eye, Package, Hash } from "lucide-react";

const statusStyle = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pending:   "bg-amber-50  text-amber-700  border-amber-200",
  abandoned: "bg-red-50    text-red-600    border-red-200",
};

const formatCurrency = (n) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n || 0);

const formatDate = (str) => {
  if (!str || str === "-") return "-";
  try {
    return new Date(str).toLocaleDateString("es-ES", {
      day: "2-digit", month: "short", year: "numeric",
    });
  } catch { return str; }
};

export default function Sheet({ data }) {
  const customerId = Cookies.get("customerId");

  const rows = useMemo(() => {
    if (!data?.length) return [];
    return data.map((item) => ({
      createdAt:  item.created_at?.value || "-",
      code:       item.code        || "-",
      clientName: item.client_name || item.email || "-",
      status:     item.status      || "-",
      itemsCount: item.items_count  ?? 0,
      itemsValue: item.items_value  ?? 0,
      opensCount: item.opens_count  ?? 0,
    }));
  }, [data]);

  function getWhatsAppLink(code) {
    const cartUrl = `https://vitahub.mx/cart/?ml-shared-cart-id=${code}&sref=${customerId}`;
    const message = encodeURIComponent(`Te comparto mi carrito: ${cartUrl}`);
    return `https://wa.me/?text=${message}`;
  }

  if (!rows.length) return (
    <div className="flex flex-col items-center gap-2 py-16 text-gray-300">
      <Package size={32} strokeWidth={1.5} />
      <p className="text-sm text-gray-400">No hay carritos disponibles</p>
    </div>
  );

  return (
    <div className="flex flex-col divide-y divide-gray-50">

      {/* ── Header de columnas ── */}
      <div className="grid grid-cols-12 gap-2 px-6 py-3 text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">
        <div className="col-span-2">Fecha</div>
        <div className="col-span-2">Código</div>
        <div className="col-span-3">Cliente</div>
        <div className="col-span-1 text-center">Status</div>
        <div className="col-span-1 text-center">Items</div>
        <div className="col-span-1 text-center">Valor</div>
        <div className="col-span-1 text-center">
          <Eye size={12} className="inline" />
        </div>
        <div className="col-span-1 text-center">WA</div>
      </div>

      {/* ── Filas ── */}
      {rows.map((row, idx) => {
        const st = statusStyle[row.status?.toLowerCase()] || "bg-gray-50 text-gray-500 border-gray-200";

        return (
          <div
            key={idx}
            className="grid grid-cols-12 gap-2 px-6 py-3.5 items-center hover:bg-gray-50/60 transition text-sm"
          >
            {/* Fecha */}
            <div className="col-span-2 text-xs text-gray-400">
              {formatDate(row.createdAt)}
            </div>

            {/* Código */}
            <div className="col-span-2 font-mono text-xs text-gray-500 truncate">
              {row.code}
            </div>

            {/* Cliente */}
            <div className="col-span-3 text-xs text-gray-700 truncate font-medium">
              {row.clientName}
            </div>

            {/* Status */}
            <div className="col-span-1 flex justify-center">
              <span className={`text-[0.65rem] font-semibold px-2 py-0.5 rounded-full border ${st}`}>
                {row.status}
              </span>
            </div>

            {/* Items */}
            <div className="col-span-1 text-center text-xs text-gray-500">
              {row.itemsCount}
            </div>

            {/* Valor */}
            <div className="col-span-1 text-center text-xs font-semibold text-[#1b3f7a]">
              {formatCurrency(row.itemsValue)}
            </div>

            {/* Aperturas */}
            <div className="col-span-1 text-center text-xs text-gray-400 flex items-center justify-center gap-1">
              <Eye size={11} />
              {row.opensCount}
            </div>

            {/* Compartir */}
            <div className="col-span-1 flex justify-center">
              <button
                onClick={() => window.open(getWhatsAppLink(row.code), "_blank")}
                className="w-7 h-7 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600 transition"
                title="Compartir por WhatsApp"
              >
                <FaWhatsapp size={12} />
              </button>
            </div>

          </div>
        );
      })}

    </div>
  );
}
