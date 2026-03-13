"use client";

import { useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { ChevronDown, ChevronUp, User, Mail, Package } from "lucide-react";
import Cookies from "js-cookie";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(amount || 0);

const formatDate = (dateObj) => {
  if (!dateObj?.value) return "N/A";
  try {
    return new Date(dateObj.value).toLocaleDateString("es-ES");
  } catch { return "Fecha inválida"; }
};

const calculateEndDate = (startDate, duration) => {
  if (!startDate?.value || !duration) return "N/A";
  try {
    const start     = new Date(startDate.value);
    const daysMatch = duration.match(/(\d+)/);
    const days      = daysMatch ? parseInt(daysMatch[1]) : 30;
    const end       = new Date(start);
    end.setDate(start.getDate() + days);
    return end.toLocaleDateString("es-ES");
  } catch { return "N/A"; }
};

const statusStyle = {
  paid:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  refunded: "bg-red-50 text-red-600 border-red-200",
};

export default function OrdersTable({ data }) {
  const [expandedOrder, setExpandedOrder] = useState(null);

  const toggle = (orderNumber) =>
    setExpandedOrder(prev => prev === orderNumber ? null : orderNumber);

  const shareProduct = (productName, productHandle) => {
    const customerId = Cookies.get("customerId") || "default";
    const url        = `https://vitahub.mx/products/${productHandle}?sref=${customerId}`;
    const msg        = `Hola! Noté que se te está por terminar el "${productName}". Te comparto el link para que lo puedas reponer: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="flex flex-col divide-y divide-gray-50">
      {data.map((order) => {
        const isOpen = expandedOrder === order.order_number;
        const st     = statusStyle[order.financial_status] || "bg-amber-50 text-amber-700 border-amber-200";

        return (
          <div key={order.order_number}>

            {/* ── Fila de orden ── */}
            <div
              className="flex flex-col md:flex-row md:items-center gap-3 px-6 py-4 hover:bg-gray-50/60 cursor-pointer transition"
              onClick={() => toggle(order.order_number)}
            >
              {/* Info izquierda */}
              <div className="flex-1 flex flex-col gap-1">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-bold text-[#1b3f7a]">
                    #{order.order_number}
                  </span>
                  <span className={`text-[0.68rem] font-semibold px-2 py-0.5 rounded-full border ${st}`}>
                    {order.financial_status || "unknown"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400 flex-wrap">
                  <User size={11} />
                  <span>{order.nombre_cliente} {order.apellido_cliente || ""}</span>
                  <span className="mx-1 opacity-40">·</span>
                  <span>{formatDate(order.created_at)}</span>
                  <span className="mx-1 opacity-40">·</span>
                  <Package size={11} />
                  <span>{order.total_items} items</span>
                </div>
              </div>

              {/* Ganancia + toggle */}
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">
                    Ganancia
                  </p>
                  <p className="text-base font-extrabold text-emerald-600">
                    {formatCurrency(order.ganancia_total)}
                  </p>
                </div>
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 shrink-0">
                  {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </div>
              </div>
            </div>

            {/* ── Detalle expandido ── */}
            {isOpen && (
              <div className="px-6 pb-5 bg-gray-50/50">

                {/* Contacto */}
                <div className="flex items-center gap-4 py-3 mb-3 border-b border-gray-100 text-xs text-gray-500">
                  <div className="flex items-center gap-1.5">
                    <User size={12} className="text-gray-400" />
                    <span>{order.nombre_cliente} {order.apellido_cliente || ""}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail size={12} className="text-gray-400" />
                    <span>{order.customer_email}</span>
                  </div>
                </div>

                {/* Header tabla productos */}
                <div className="grid grid-cols-12 gap-2 text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400 pb-2 mb-2 border-b border-gray-100">
                  <div className="col-span-5">Producto</div>
                  <div className="col-span-2 text-center">Cant.</div>
                  <div className="col-span-2 text-center">Ganancia</div>
                  <div className="col-span-2 text-center">Termina</div>
                  <div className="col-span-1 text-center">WA</div>
                </div>

                {/* Productos */}
                <div className="flex flex-col gap-2">
                  {order.productos.map((producto, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-12 gap-2 text-sm items-center bg-white rounded-xl border border-gray-100 px-4 py-3"
                    >
                      <div className="col-span-5 font-medium text-gray-800 text-xs leading-snug">
                        {producto.producto}
                      </div>
                      <div className="col-span-2 text-center text-xs text-gray-500">
                        {producto.cantidad || 0}
                      </div>
                      <div className="col-span-2 text-center text-xs font-semibold text-emerald-600">
                        {formatCurrency(producto.ganancia_producto)}
                      </div>
                      <div className="col-span-2 text-center text-xs text-[#1b3f7a] font-medium">
                        {calculateEndDate(order.created_at, producto.duracion)}
                      </div>
                      <div className="col-span-1 flex justify-center">
                        {producto.product_handle ? (
                          producto.inventario > 0 ? (
                            <button
                              onClick={() => shareProduct(producto.producto, producto.product_handle)}
                              className="w-7 h-7 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600 transition"
                              title={`Stock: ${producto.inventario}`}
                            >
                              <FaWhatsapp size={12} />
                            </button>
                          ) : (
                            <span className="text-[0.65rem] text-gray-400 font-medium">Sin stock</span>
                          )
                        ) : (
                          <span className="text-[0.65rem] text-gray-300">—</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

              </div>
            )}

          </div>
        );
      })}
    </div>
  );
}
