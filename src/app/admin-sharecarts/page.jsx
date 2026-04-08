"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";

const VIDEO_URL = 'https://vambe-bkt.s3.us-east-1.amazonaws.com/upload/private/5cc1d04f-36ef-4986-9858-84770fdf302c/32bb19a5-f7d0-4ced-b341-0f0074962ba5-whatsapp-video-2026-03-24-at-16.32.56.mp4';

function downloadXlsx(rows) {
  const data = [
    ['Teléfono', 'Nombre', 'Variable 1', 'Variable 2', 'Variable 3', 'Variable 4'],
    ...rows.map(r => [
      r.phone?.replace(/^\+/, '') ?? '',
      r.name ?? '',
      VIDEO_URL,
      r.name ?? '',
      r.specialist ?? '',
      r.url_params ?? '',
    ])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Recovery');
  XLSX.writeFile(wb, `recovery_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function AdminSharecartsPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState(null);
  const [lastExport, setLastExport] = useState(null);

  // Filtros de fecha
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    fetchData();
    fetch('/api/admin/sharecarts/recovery')
      .then(r => r.json())
      .then(d => setLastExport(d.last_export ?? null));
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

  const horasSinceExport = lastExport
    ? (Date.now() - new Date(lastExport).getTime()) / (1000 * 60 * 60)
    : null;
  const exportedRecently = horasSinceExport !== null && horasSinceExport < 12;

  async function handleRecovery() {
    setRecoveryLoading(true);
    setRecoveryResult(null);
    try {
      const today = new Date();
      const from4 = new Date(today); from4.setDate(today.getDate() - 4);
      const fmt = d => d.toISOString().slice(0, 10);

      const res = await fetch('/api/admin/sharecarts/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fmt(from4), to: fmt(today) }),
      });
      const json = await res.json();

      if (json.success && json.count > 0) {
        downloadXlsx(json.data);
        setRecoveryResult({ count: json.count, ok: true });
        setLastExport(new Date().toISOString());
      } else if (json.success && json.count === 0) {
        setRecoveryResult({ count: 0, ok: true });
        setLastExport(new Date().toISOString());
      } else {
        setRecoveryResult({ error: json.error, ok: false });
      }
    } catch (err) {
      setRecoveryResult({ error: err.message, ok: false });
    } finally {
      setRecoveryLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Ganancias por Referido
          </h1>
          <p className="text-sm text-gray-500">
            Órdenes y comisiones agrupadas por especialista
          </p>
        </div>

        {/* Recovery export */}
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={handleRecovery}
            disabled={recoveryLoading}
            className="flex items-center gap-2 bg-[#1b3f7a] text-white text-sm px-4 py-2 rounded-lg hover:bg-[#163264] disabled:opacity-50 transition-colors"
          >
            <Download size={15} />
            {recoveryLoading ? 'Generando…' : 'Recovery últimos 4 días (CSV)'}
          </button>

          {lastExport && (
            <p className={`text-xs ${exportedRecently ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
              {exportedRecently
                ? `⚠️ Exportado hace ${Math.round(horasSinceExport * 60)} min — puede estar vacío`
                : `Último export: ${new Date(lastExport).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`}
            </p>
          )}

          {recoveryResult && (
            <p className={`text-xs ${recoveryResult.ok ? 'text-emerald-600' : 'text-red-500'}`}>
              {recoveryResult.ok
                ? recoveryResult.count === 0
                  ? 'Sin carritos pendientes'
                  : `✓ ${recoveryResult.count} carrito(s) exportados`
                : `Error: ${recoveryResult.error}`}
            </p>
          )}
        </div>
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
