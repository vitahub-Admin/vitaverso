"use client";

import { useEffect, useMemo, useState } from "react";

export default function AdminSharecartsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros de fecha
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (from) params.append("from", from);
      if (to) params.append("to", to);

      const res = await fetch(
        `/api/admin/sharecarts?${params.toString()}`
      );
      const json = await res.json();

      if (json.success) {
        setData(json.data || []);
      }
    } catch (err) {
      console.error("Error loading admin sharecarts", err);
    } finally {
      setLoading(false);
    }
  }

  // Agrupar por referido
  const groupedBySpecialist = useMemo(() => {
    const map = {};

    data.forEach((row) => {
      const id = row.specialist_id;
      if (!id) return;

      if (!map[id]) {
        map[id] = {
          specialist_id: id,
          first_name: row.first_name,
          last_name: row.last_name,
          email: row.email,
          tags: row.tags,
          orders: [],
          totalEarnings: 0,
          totalItems: 0,
        };
      }

      map[id].orders.push(row);
      map[id].totalEarnings += Number(row.earning || 0);
      map[id].totalItems += Number(row.total_items || 0);
    });

    return Object.values(map);
  }, [data]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Ganancias por Referido
        </h1>
        <p className="text-sm text-gray-500">
          Órdenes y comisiones agrupadas por especialista
        </p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-4 items-end">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500">Desde</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500">Hasta</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          />
        </div>

        <button
          onClick={fetchData}
          className="bg-black text-white text-sm px-4 py-2 rounded hover:bg-gray-800"
        >
          Aplicar filtros
        </button>
      </div>

      {/* Estado */}
      {loading && (
        <div className="text-sm text-gray-500">Cargando datos…</div>
      )}

      {!loading && groupedBySpecialist.length === 0 && (
        <div className="text-sm text-gray-500">
          No hay datos para el rango seleccionado
        </div>
      )}

      {/* Listado */}
      <div className="space-y-4">
        {groupedBySpecialist.map((spec) => (
          <details
            key={spec.specialist_id}
            className="bg-white rounded-lg shadow border"
          >
            <summary className="cursor-pointer list-none">
              <div className="p-4 flex items-center justify-between">
                {/* Info */}
                <div>
                  <div className="font-semibold text-gray-800 text-lg">
                    {spec.first_name} {spec.last_name}
                  </div>
                  <div className="text-sm text-gray-600">{spec.email}</div>

                  {spec.tags && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {spec.tags.split(",").map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded"
                        >
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Totales */}
                <div className="text-right">
                  <div className="text-sm text-gray-500">Ganancia total</div>
                  <div className="text-xl font-bold text-green-600">
                    ${spec.totalEarnings.toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {spec.orders.length} órdenes · {spec.totalItems} items
                  </div>
                </div>
              </div>
            </summary>

            {/* Órdenes */}
            <div className="border-t px-4 py-3 space-y-2">
              {spec.orders.map((order) => (
                <div
                  key={order.order_number}
                  className="flex items-center justify-between bg-gray-50 rounded p-3 text-sm"
                >
                  <div>
                    <div className="font-medium text-gray-800">
                      Orden #{order.order_number}
                    </div>
                    <div className="text-gray-500">
                      {new Date(order.created_at).toLocaleDateString()} ·{" "}
                      {order.total_items} items
                    </div>
                  </div>

                  <div className="font-semibold text-green-600">
                    ${Number(order.earning || 0).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
