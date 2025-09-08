"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export default function Chart1({ data }) {
  // Procesar los datos para agrupar por fecha
  const processedData = useMemo(() => {
    const map = {};

    data.forEach((item) => {
      const date = item.created_at.value; // tu fecha
      const ganancia =
        item.line_items_price * item.comission * item.line_items_quantity;

      if (!map[date]) {
        map[date] = { date, totalGanancia: 0, orderCount: 0 };
      }

      map[date].totalGanancia += ganancia;
      map[date].orderCount += 1;
    });

    // Convertir a array y ordenar por fecha
    return Object.values(map).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [data]);

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col gap-8">
   

      {/* Gráfica */}
      <div className="w-full h-80 bg-white shadow-md rounded p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={processedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip formatter={(value) => `$${value.toFixed(2)}`} />
            <Line
              type="monotone"
              dataKey="totalGanancia"
              stroke="#1b3f7a"
              strokeWidth={3}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

    </div>
  );
}
