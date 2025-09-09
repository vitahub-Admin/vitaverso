"use client";

import { useMemo } from "react";
import Cookies from "js-cookie";
import { FaShareAlt } from "react-icons/fa";


export default function Sheet({ data }) {
  // Procesar datos
  const processedData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return data.map((item) => ({
      createdAt: item.created_at?.value || "-",
      code: item.code || "-",
      clientName: item.client_name || item.email || "-",
      status: item.status || "-",
      itemsCount: item.items_count ?? 0,
      itemsValue: item.items_value ?? 0,
      opensCount: item.opens_count ?? 0,
    }));
  }, [data]);

  function getWhatsAppLink(code) {
    const cartUrl = `https://vitahub.mx/cart/?ml-shared-cart-id=${code}&sref=${customerId}`;
    const message = encodeURIComponent(`Te comparto mi carrito: ${cartUrl}`);
    return `https://wa.me/?text=${message}`;
  }

  const customerId = Cookies.get("customerId");
  return (
    <div className="w-full max-w-6xl mx-auto flex flex-col gap-8">
      <h2 className="text-xl font-bold text-center text-[#1b3f7a]">
        Carritos Generados
      </h2>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-[#f0f8ff] shadow-md rounded-lg text-xs">
          <thead className="bg-[#1b3f7a] text-white">
            <tr>
              <th className="py-2 px-4 border-r border-gray-200">Fecha</th>
              <th className="py-2 px-4 border-r border-gray-200">Código</th>
              <th className="py-2 px-4 border-r border-gray-200">Cliente</th>
              <th className="py-2 px-4 border-r border-gray-200">Status</th>
              <th className="py-2 px-4 border-r border-gray-200"># Items</th>
              <th className="py-2 px-4 border-r border-gray-200">Valor</th>
              <th className="py-2 px-4"># Aperturas</th>
              <th className="py-2 px-4">Compartir</th>
            </tr>
          </thead>
          <tbody>
            {processedData.length > 0 ? (
              processedData.map((row, idx) => (
                <tr
                  key={idx}
                  className="text-center border-b hover:bg-[#e6f2ff] transition"
                >
                  <td className="py-2 px-4 border-r border-gray-100">
                    {row.createdAt}
                  </td>
                  <td className="py-2 px-4 border-r border-gray-100 font-mono">
                    {row.code}
                  </td>
                  <td className="py-2 px-4 border-r border-gray-100 truncate max-w-[200px]">
                    {row.clientName}
                  </td>
                  <td className="py-2 px-4 border-r border-gray-100">
                    {row.status}
                  </td>
                  <td className="py-2 px-4 border-r border-gray-100">
                    {row.itemsCount}
                  </td>
                  <td className="py-2 px-4 border-r border-gray-100">
                    ${row.itemsValue?.toFixed?.(2) ?? "-"}
                  </td>
                  <td className="py-2 px-4">{row.opensCount}</td>
                  <td className="py-1 px-4">  <button
    key={row.code}
    onClick={() => window.open(getWhatsAppLink(row.code), "_blank")}
    className="flex items-center m-0 px-4 py-1 rounded-2xl bg-teal-500 text-white font-medium shadow-md transition-colors hover:bg-teal-600"
  >
    <FaShareAlt className="text-lg" />
    Compartir
  </button></td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={7}
                  className="py-4 text-center text-gray-500 italic"
                >
                  No hay carritos disponibles
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
