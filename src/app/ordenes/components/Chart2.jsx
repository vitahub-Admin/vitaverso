// "use client";
//
// import { useMemo } from "react";
// import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";


"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

function truncateText(text, maxCharsPerLine = 15, maxLines = 2) {
  if (!text) return "";
  text = String(text);
  const words = text.split(/\s+/);
  let lines = [], currentLine = "";
  for (let word of words) {
    if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
    if (lines.length === maxLines) break;
  }
  if (currentLine && lines.length < maxLines) lines.push(currentLine);
  if (words.join(" ").length > lines.join(" ").length) lines[lines.length - 1] += "...";
  return lines.join("\n");
}

const CustomTick = ({ x, y, payload }) => {
  const truncated = truncateText(payload.value, 15, 2);
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill="#9ca3af" fontSize={11}>
      {truncated.split("\n").map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 14}>{line}</tspan>
      ))}
    </text>
  );
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-md px-4 py-3 text-sm">
      <p className="text-gray-400 text-xs mb-1">{label}</p>
      <p className="font-bold text-[#1b3f7a]">{payload[0].value} vendidos</p>
    </div>
  );
}

export default function Chart2({ data }) {
  const topProducts = useMemo(() => {
    const map = {};
    data.forEach((order) => {
      order.productos.forEach((p) => {
        const name = p.producto;
        if (!map[name]) map[name] = 0;
        map[name] += p.cantidad || 0;
      });
    });
    return Object.entries(map)
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 4);
  }, [data]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[0.67rem] font-semibold tracking-widest uppercase text-gray-400">
        Top productos
      </p>
      <div className="w-full h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={topProducts}
            margin={{ top: 4, right: 8, left: 20, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "#9ca3af" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={<CustomTick />}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="quantity" fill="#1b3f7a" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

