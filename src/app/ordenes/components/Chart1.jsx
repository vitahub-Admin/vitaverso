"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-md px-4 py-3 text-sm">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="font-bold text-[#1b3f7a]">${payload[0].value.toFixed(2)}</p>
    </div>
  );
}

export default function Chart1({ data }) {
  const processedData = useMemo(() => {
    const map = {};
    data.forEach((item) => {
      const date     = item.created_at.value.split("T")[0];
      const ganancia = item.ganancia_total || 0;
      if (!map[date]) map[date] = { date, totalGanancia: 0 };
      map[date].totalGanancia += ganancia;
    });
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">
        Ganancias por día
      </p>
      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={processedData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `$${v}`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="totalGanancia"
              stroke="#1b3f7a"
              strokeWidth={2.5}
              dot={{ r: 3, fill: "#1b3f7a", strokeWidth: 0 }}
              activeDot={{ r: 5, fill: "#1b3f7a" }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}