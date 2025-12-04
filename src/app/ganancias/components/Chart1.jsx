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
  const processedData = useMemo(() => {
    const map = {};

    data.forEach((item) => {
      const date = item.created_at.value.split("T")[0]; 
      const ganancia = item.ganancia_total || 0;

      if (!map[date]) {
        map[date] = { date, totalGanancia: 0, orderCount: 0 };
      }

      map[date].totalGanancia += ganancia;
      map[date].orderCount += 1;
    });

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  return (
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
  );
}
